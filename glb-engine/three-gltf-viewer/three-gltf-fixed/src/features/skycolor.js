import * as THREE from 'three';

/**
 * SkyColorSystem
 * Procedural sky dome — day/night, animated FBM clouds, moon phases.
 *
 * Fixes vs previous version:
 * - Added procedural sun disc to daytime sky
 * - Sun position is driven by uniforms so it can be linked to specular orbit
 */
export class SkyColorSystem {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.skyDomeMesh = null;
        this.skyShaderMaterial = null;

        this.params = {
            exposure:    1.0,
            cloudAmount: 0.45,
            cloudColor:  new THREE.Color('#ffffff'),
            nightMode:   0.0,
            moonPhase:   1.0,
            sunOrbit:    45,    // degrees, synced with specular
            sunAltitude: 60
        };

        this.init();
    }

    init() {
        const skyGeo = new THREE.SphereGeometry(450, 32, 15);

        this.skyShaderMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                u_backgroundTexture:    { value: null },
                u_useBackgroundTexture: { value: 0.0 },
                u_skyColor:             { value: new THREE.Color('#0c4a6e') },
                u_horizonColor:         { value: new THREE.Color('#7dd3fc') },
                u_cloudColor:           { value: this.params.cloudColor },
                u_cloudAmount:          { value: this.params.cloudAmount },
                u_exposure:             { value: this.params.exposure },
                u_nightMode:            { value: 0.0 },
                u_moonPhase:            { value: 1.0 },
                u_sunDir:               { value: new THREE.Vector3(0.6, 0.7, 0.4).normalize() },
                u_time:                 { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;

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
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
                        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
                        u.y
                    );
                }

                float fbm(vec2 p) {
                    float v = 0.0, a = 0.5;
                    vec2 shift = vec2(100.0);
                    for (int i = 0; i < 4; ++i) {
                        v += a * noise(p);
                        p  = p * 2.0 + shift;
                        a *= 0.5;
                    }
                    return v;
                }

                vec2 dirToEquirect(vec3 dir) {
                    float phi   = atan(dir.z, dir.x);
                    float theta = asin(clamp(dir.y, -1.0, 1.0));
                    float u = 1.0 - (phi + 3.14159265) / (2.0 * 3.14159265);
                    float v = (theta + 1.57079632) / 3.14159265;
                    return vec2(u, v);
                }

                void main() {
                    vec3 dir = normalize(vWorldPosition);
                    float h  = max(dir.y, 0.0);

                    // --- Day background ---
                    vec3 dayBackground;
                    if (u_useBackgroundTexture > 0.5) {
                        vec2 uv = dirToEquirect(dir);
                        dayBackground = texture2D(u_backgroundTexture, uv).rgb;
                    } else {
                        dayBackground = mix(u_horizonColor, u_skyColor, smoothstep(0.0, 0.6, h));
                    }

                    // Sun disc + halo
                    float sunDot  = dot(dir, normalize(u_sunDir));
                    float sunDisc = smoothstep(0.9994, 0.9998, sunDot);
                    float sunHalo = pow(max(sunDot, 0.0), 64.0) * 0.35;
                    vec3  sunColor = vec3(1.0, 0.95, 0.75);
                    dayBackground = mix(dayBackground, sunColor, sunHalo);
                    dayBackground = mix(dayBackground, vec3(1.0, 1.0, 0.9), sunDisc);

                    // --- Night background ---
                    vec3 nightBackground = mix(vec3(0.01, 0.01, 0.03), vec3(0.002, 0.002, 0.01), h);

                    // Stars
                    float starI = smoothstep(0.985, 1.0, hash(dir.xy * 250.0 + 40.0));
                    nightBackground += vec3(starI * (0.6 + 0.4 * sin(u_time * 2.0))) * smoothstep(0.1, 0.8, h);

                    // Moon
                    vec3  moonDir  = normalize(vec3(-0.5, 0.4, -0.6));
                    float moonSize = 0.993;
                    float dtm      = dot(dir, moonDir);
                    if (dtm > moonSize) {
                        float moonGlow = smoothstep(moonSize, 1.0, dtm);
                        vec3  moonLocalRight = normalize(cross(moonDir, vec3(0, 1, 0)));
                        float phaseInvert    = dot(dir, moonLocalRight) * 120.0;
                        float phaseCutoff    = (u_moonPhase - 0.5) * 2.0;
                        if (phaseInvert < phaseCutoff || u_moonPhase > 0.95) {
                            nightBackground = mix(nightBackground, vec3(0.95, 0.95, 0.85),
                                                  smoothstep(0.997, 1.0, dtm));
                        }
                        nightBackground += vec3(0.2, 0.3, 0.4) * moonGlow * (u_moonPhase * 0.5 + 0.5);
                    }

                    vec3 baseBackground = mix(dayBackground, nightBackground, u_nightMode);

                    // --- Clouds ---
                    vec2  skyUV      = dir.xz / (dir.y + 0.001);
                    vec2  wind       = vec2(u_time * 0.015, u_time * 0.008);
                    float cloudDensity = fbm(skyUV * 0.3 + wind);
                    float cloudMask  = smoothstep(1.0 - u_cloudAmount, 1.3 - u_cloudAmount, cloudDensity);
                    cloudMask       *= smoothstep(0.0, 0.2, dir.y);

                    vec3 activeCloudColor = mix(u_cloudColor, vec3(0.1, 0.1, 0.18), u_nightMode);
                    vec3 colorOutput      = mix(baseBackground, activeCloudColor, cloudMask);

                    gl_FragColor = vec4(colorOutput * u_exposure, 1.0);
                }
            `
        });

        this.skyDomeMesh = new THREE.Mesh(skyGeo, this.skyShaderMaterial);
        this.skyDomeMesh.visible = false;
        this.skyDomeMesh.renderOrder = -1;
        this.scene.add(this.skyDomeMesh);
    }

    /** Update the sun direction uniform to match specular light orbit */
    setSunDirection(orbitDeg, altitudeDeg) {
        const orbitRad   = THREE.MathUtils.degToRad(orbitDeg);
        const altitudeRad = THREE.MathUtils.degToRad(altitudeDeg);
        const x = Math.cos(altitudeRad) * Math.cos(orbitRad);
        const y = Math.sin(altitudeRad);
        const z = Math.cos(altitudeRad) * Math.sin(orbitRad);
        if (this.skyShaderMaterial) {
            this.skyShaderMaterial.uniforms.u_sunDir.value.set(x, y, z).normalize();
        }
    }

    setBackgroundTexture(texture) {
        if (!this.skyShaderMaterial) return;
        if (texture) {
            this.skyShaderMaterial.uniforms.u_backgroundTexture.value = texture;
            this.skyShaderMaterial.uniforms.u_useBackgroundTexture.value = 1.0;
        } else {
            this.skyShaderMaterial.uniforms.u_backgroundTexture.value = null;
            this.skyShaderMaterial.uniforms.u_useBackgroundTexture.value = 0.0;
        }
    }

    toggle(forceState) {
        this.visible = (forceState !== undefined) ? forceState : !this.visible;
        this.skyDomeMesh.visible = this.visible;
        return this.visible;
    }

    update(elapsedTime) {
        if (this.skyShaderMaterial) {
            this.skyShaderMaterial.uniforms.u_time.value = elapsedTime;
        }
    }

    setNightMode(val) {
        if (this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_nightMode.value = val ? 1.0 : 0.0;
    }

    setExposure(val) {
        if (this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_exposure.value = val;
    }

    setCloudAmount(val) {
        if (this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_cloudAmount.value = val;
    }

    setCloudColor(hex) {
        if (this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_cloudColor.value.set(hex);
    }

    setMoonPhase(val) {
        this.params.moonPhase = val;
        if (this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_moonPhase.value = val;
    }
}
