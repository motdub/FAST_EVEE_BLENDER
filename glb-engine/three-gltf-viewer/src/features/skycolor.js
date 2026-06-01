import * as THREE from 'three';

/**
 * SkyColorSystem — Procedural sky dome with sun, clouds, night mode
 *
 * The sky dome is a SphereGeometry(450) with BackSide ShaderMaterial.
 * When active, scene.background must be null (dome renders as geometry).
 * When inactive, caller restores scene.background to the loaded skybox.
 *
 * The background texture (HDR/EXR) is passed in and composited BEHIND
 * the procedural clouds when sky override is active.
 */
export class SkyColorSystem {
    constructor(scene) {
        this.scene   = scene;
        this.visible = false;

        this.params = {
            exposure:    1.0,
            cloudAmount: 0.45,
            cloudColor:  new THREE.Color('#ffffff'),
            nightMode:   0.0,
            moonPhase:   1.0,
            sunOrbit:    45,
            sunAltitude: 60,
        };

        this._init();
    }

    _init() {
        const geo = new THREE.SphereGeometry(450, 32, 15);

        this.mat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                u_backgroundTexture:    { value: null },
                u_useBackgroundTexture: { value: 0.0 },
                u_skyColor:             { value: new THREE.Color('#0c4a6e') },
                u_horizonColor:         { value: new THREE.Color('#7dd3fc') },
                u_cloudColor:           { value: this.params.cloudColor.clone() },
                u_cloudAmount:          { value: this.params.cloudAmount },
                u_exposure:             { value: this.params.exposure },
                u_nightMode:            { value: 0.0 },
                u_moonPhase:            { value: 1.0 },
                u_sunDir:               { value: new THREE.Vector3(0.6, 0.7, 0.4).normalize() },
                u_time:                 { value: 0.0 },
            },
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPos;
                uniform sampler2D u_backgroundTexture;
                uniform float     u_useBackgroundTexture;
                uniform vec3      u_skyColor;
                uniform vec3      u_horizonColor;
                uniform vec3      u_cloudColor;
                uniform float     u_cloudAmount;
                uniform float     u_exposure;
                uniform float     u_nightMode;
                uniform float     u_moonPhase;
                uniform vec3      u_sunDir;
                uniform float     u_time;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p); vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
                }
                float fbm(vec2 p) {
                    float v=0.0,a=0.5;
                    for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(100);a*=0.5;}
                    return v;
                }
                vec2 dirToUV(vec3 d) {
                    float phi=atan(d.z,d.x);
                    float theta=asin(clamp(d.y,-1.0,1.0));
                    return vec2(1.0-(phi+3.14159265)/(2.0*3.14159265),
                                (theta+1.5707963)/3.14159265);
                }

                void main() {
                    vec3 dir = normalize(vWorldPos);
                    float h   = max(dir.y, 0.0);

                    // ---- Day sky ----
                    vec3 dayBg;
                    if (u_useBackgroundTexture > 0.5) {
                        dayBg = texture2D(u_backgroundTexture, dirToUV(dir)).rgb;
                    } else {
                        dayBg = mix(u_horizonColor, u_skyColor, smoothstep(0.0, 0.55, h));
                    }

                    // Sun disc + halo (always rendered in day mode)
                    vec3 sunN    = normalize(u_sunDir);
                    float sunDot = dot(dir, sunN);
                    float disc   = smoothstep(0.9994, 0.9999, sunDot);
                    float halo   = pow(max(sunDot, 0.0), 48.0) * 0.4;
                    float glow   = pow(max(sunDot, 0.0), 8.0)  * 0.12;
                    vec3  sunC   = vec3(1.0, 0.95, 0.7);
                    dayBg = mix(dayBg, dayBg + sunC * glow,  1.0);
                    dayBg = mix(dayBg, sunC,                  halo);
                    dayBg = mix(dayBg, vec3(1.0, 1.0, 0.92), disc);

                    // ---- Night sky ----
                    vec3 nightBg = mix(vec3(0.01, 0.01, 0.03), vec3(0.002, 0.002, 0.01), h);
                    // Stars
                    float star = smoothstep(0.987, 1.0, hash(dir.xy * 300.0 + 41.0));
                    nightBg   += vec3(star * (0.7 + 0.3 * sin(u_time * 2.3))) * smoothstep(0.08, 0.7, h);
                    // Moon
                    vec3  moonDir  = normalize(vec3(-0.5, 0.4, -0.6));
                    float dtm      = dot(dir, moonDir);
                    float moonSize = 0.9935;
                    if (dtm > moonSize) {
                        float mg = smoothstep(moonSize, 1.0, dtm);
                        vec3  mlr = normalize(cross(moonDir, vec3(0,1,0)));
                        float phase = dot(dir, mlr) * 120.0;
                        float cut   = (u_moonPhase - 0.5) * 2.0;
                        if (phase < cut || u_moonPhase > 0.95) {
                            nightBg = mix(nightBg, vec3(0.95,0.95,0.85),
                                          smoothstep(0.997, 1.0, dtm));
                        }
                        nightBg += vec3(0.2,0.3,0.4)*mg*(u_moonPhase*0.5+0.5);
                    }

                    vec3 baseBg = mix(dayBg, nightBg, u_nightMode);

                    // ---- Clouds ----
                    vec2 skyUV = dir.xz / (dir.y + 0.001);
                    vec2 wind  = vec2(u_time * 0.014, u_time * 0.007);
                    float cd   = fbm(skyUV * 0.28 + wind);
                    float cm   = smoothstep(1.0 - u_cloudAmount, 1.3 - u_cloudAmount, cd);
                    cm        *= smoothstep(0.0, 0.18, dir.y);
                    vec3 cloudC = mix(u_cloudColor, vec3(0.1,0.1,0.18), u_nightMode);
                    vec3 color  = mix(baseBg, cloudC, cm);

                    gl_FragColor = vec4(color * u_exposure, 1.0);
                }
            `
        });

        this.mesh = new THREE.Mesh(geo, this.mat);
        this.mesh.visible     = false;
        this.mesh.renderOrder = -1;
        this.scene.add(this.mesh);
    }

    setSunDirection(orbitDeg, altitudeDeg) {
        const or = THREE.MathUtils.degToRad(orbitDeg);
        const al = THREE.MathUtils.degToRad(altitudeDeg);
        this.mat.uniforms.u_sunDir.value.set(
            Math.cos(al) * Math.cos(or),
            Math.sin(al),
            Math.cos(al) * Math.sin(or)
        ).normalize();
    }

    setBackgroundTexture(texture) {
        if (texture) {
            this.mat.uniforms.u_backgroundTexture.value    = texture;
            this.mat.uniforms.u_useBackgroundTexture.value = 1.0;
        } else {
            this.mat.uniforms.u_backgroundTexture.value    = null;
            this.mat.uniforms.u_useBackgroundTexture.value = 0.0;
        }
    }

    toggle(forceState) {
        this.visible      = (forceState !== undefined) ? forceState : !this.visible;
        this.mesh.visible = this.visible;
        return this.visible;
    }

    update(elapsed) {
        this.mat.uniforms.u_time.value = elapsed;
    }

    setNightMode(on)     { this.mat.uniforms.u_nightMode.value   = on ? 1.0 : 0.0; }
    setExposure(val)     { this.mat.uniforms.u_exposure.value    = val; }
    setCloudAmount(val)  { this.mat.uniforms.u_cloudAmount.value = val; }
    setCloudColor(hex)   { this.mat.uniforms.u_cloudColor.value.set(hex); }
    setMoonPhase(val)    { this.mat.uniforms.u_moonPhase.value   = val; }
}
