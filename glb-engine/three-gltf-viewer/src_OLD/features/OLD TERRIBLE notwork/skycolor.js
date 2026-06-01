import * as THREE from 'three';

export class SkyColorSystem {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.skyDomeMesh = null;
        this.skyShaderMaterial = null;

        this.params = {
            exposure: 1.0,
            cloudAmount: 0.45,
            cloudColor: new THREE.Color("#ffffff"),
            nightMode: 0.0,
            moonPhase: 0.0 // 0.0 = Crescent, 0.5 = Half, 1.0 = Full
        };

        this.init();
    }

    init() {
        const skyGeo = new THREE.SphereGeometry(450, 32, 15);

        this.skyShaderMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                u_backgroundTexture: { value: null },
                u_useBackgroundTexture: { value: 0.0 }, 
                u_skyColor: { value: new THREE.Color("#0c4a6e") },
                u_horizonColor: { value: new THREE.Color("#38bdf8") },
                u_cloudColor: { value: this.params.cloudColor },
                u_cloudAmount: { value: this.params.cloudAmount },
                u_exposure: { value: this.params.exposure },
                u_nightMode: { value: 0.0 },
                u_moonPhase: { value: 0.0 }, // Passed into fragment shader
                u_time: { value: 0.0 }
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
                uniform float u_useBackgroundTexture;
                
                uniform vec3 u_skyColor;
                uniform vec3 u_horizonColor;
                uniform vec3 u_cloudColor;
                uniform float u_cloudAmount;
                uniform float u_exposure;
                uniform float u_nightMode;
                uniform float u_moonPhase;
                uniform float u_time;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
                }

                float fbm(vec2 p) {
                    float v = 0.0;
                    float a = 0.5;
                    vec2 shift = vec2(100.0);
                    for (int i = 0; i < 4; ++i) {
                        v += a * noise(p);
                        p = p * 2.0 + shift;
                        a *= 0.5;
                    }
                    return v;
                }

                vec2 directionToEquirectangularUV(vec3 dir) {
                    float phi = atan(dir.z, dir.x);
                    float theta = asin(dir.y);
                    float u = 1.0 - (phi + 3.14159265) / (2.0 * 3.14159265);
                    float v = 0.0 - (theta + 1.57079632) / 3.14159265;
                    return vec2(u, v);
                }

                void main() {
                    vec3 dir = normalize(vWorldPosition);
                    float h = max(dir.y, 0.0);
                    
                    vec3 dayBackground;
                    if (u_useBackgroundTexture > 0.5) {
                        // DAY MODE WITH CUSTOM SKYBOX
                        vec2 lookupUV = directionToEquirectangularUV(dir);
                        dayBackground = texture2D(u_backgroundTexture, lookupUV).rgb;
                    } else {
                        // DAY MODE DEFAULT PROCEDURAL
                        dayBackground = mix(u_horizonColor, u_skyColor, h);
                    }

                    // NIGHT MODE (Always forces procedural stars & moon, ignoring custom skybox)
                    vec3 nightBackground = mix(vec3(0.01, 0.01, 0.03), vec3(0.002, 0.002, 0.01), h);
                    
                    // Stars
                    float starDensity = hash(floor(dir.xz * 140.0));
                    float starIntensity = smoothstep(0.985, 1.0, hash(dir.xy * 250.0 + 40.0));
                    vec3 stars = vec3(starIntensity * (0.6 + 0.4 * sin(u_time * 2.0 + starDensity * 10.0)));
                    nightBackground += stars * (smoothstep(0.1, 0.8, h));

                    // Moon Phase Masking Engine
                    vec3 moonDir = normalize(vec3(-0.5, 0.4, -0.6));
                    float moonSize = 0.993; 
                    float distToMoon = dot(dir, moonDir);
                    
                    if (distToMoon > moonSize) {
                        float moonGlow = smoothstep(moonSize, 1.0, distToMoon);
                        vec3 moonColor = vec3(0.95, 0.95, 0.85);
                        
                        // Calculate a secondary shading vector offset relative to moon local coordinates for phases
                        vec3 moonLocalUp = vec3(0.0, 1.0, 0.0);
                        vec3 moonLocalRight = normalize(cross(moonDir, moonLocalUp));
                        float phaseInvert = dot(dir, moonLocalRight) * 120.0; 
                        
                        // Phase thresholds matching: 0.0 = Crescent, 0.5 = Half, 1.0 = Full
                        float phaseCutoff = (u_moonPhase - 0.5) * 2.0; 
                        if (phaseInvert < phaseCutoff || u_moonPhase > 0.95) {
                            nightBackground = mix(nightBackground, moonColor, smoothstep(0.997, 1.0, distToMoon));
                        }
                        nightBackground += vec3(0.2, 0.3, 0.4) * moonGlow * (u_moonPhase * 0.5 + 0.5);
                    }

                    // Master Interpolation between Day and Night Background States
                    vec3 baseBackground = mix(dayBackground, nightBackground, u_nightMode);

                    // Process drifting cloud meshes cleanly on top of whatever backdrop is currently active
                    vec2 skyUV = dir.xz / (dir.y + 0.001);
                    vec2 windOffset = vec2(u_time * 0.015, u_time * 0.008);
                    float cloudDensity = fbm(skyUV * 0.3 + windOffset);
                    
                    float cloudMask = smoothstep(1.0 - u_cloudAmount, 1.3 - u_cloudAmount, cloudDensity);
                    cloudMask *= smoothstep(0.0, 0.2, dir.y); 
                    
                    vec3 activeCloudColor = mix(u_cloudColor, vec3(0.1, 0.1, 0.18), u_nightMode);
                    vec3 colorOutput = mix(baseBackground, activeCloudColor, cloudMask);
                    
                    // Exposure multiplier works over both procedural and custom texture background states!
                    gl_FragColor = vec4(colorOutput * u_exposure, 1.0);
                }
            `
        });

        this.skyDomeMesh = new THREE.Mesh(skyGeo, this.skyShaderMaterial);
        this.skyDomeMesh.visible = false;
        this.scene.add(this.skyDomeMesh);
    }

    setBackgroundTexture(texture) {
        if (this.skyShaderMaterial) {
            if (texture) {
                this.skyShaderMaterial.uniforms.u_backgroundTexture.value = texture;
                this.skyShaderMaterial.uniforms.u_useBackgroundTexture.value = 1.0;
            } else {
                this.skyShaderMaterial.uniforms.u_backgroundTexture.value = null;
                this.skyShaderMaterial.uniforms.u_useBackgroundTexture.value = 0.0;
            }
        }
    }

    toggle(forceState, currentTexture) {
        this.visible = (forceState !== undefined) ? forceState : !this.visible;
        this.skyDomeMesh.visible = this.visible;
        if (this.visible) {
            this.setBackgroundTexture(currentTexture);
        }
        return this.visible;
    }

    update(elapsedTime) {
        if (this.visible && this.skyShaderMaterial) {
            this.skyShaderMaterial.uniforms.u_time.value = elapsedTime;
        }
    }

    setNightMode(val) { if(this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_nightMode.value = val ? 1.0 : 0.0; }
    setExposure(val) { if(this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_exposure.value = val; }
    setCloudAmount(val) { if(this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_cloudAmount.value = val; }
    setCloudColor(hex) { if(this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_cloudColor.value.set(hex); }
    
    // Set Phase: Accepts values 0.0 (Crescent), 0.5 (Half), or 1.0 (Full)
    setMoonPhase(val) { 
        this.params.moonPhase = val;
        if(this.skyShaderMaterial) this.skyShaderMaterial.uniforms.u_moonPhase.value = val; 
    }
}