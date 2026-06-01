import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { SpecularHighlightSystem } from './features/specular-highlight.js';
import { MeshShadowsSystem } from './features/mesh-shadows.js';
import { HighlightBlurSystem } from './features/highlight-blur.js';
import { SkyColorSystem } from './features/skycolor.js';
import { OutlineFeature } from './features/outline-feature.js';
import { CelShaderSystem } from './features/cel-shader.js';
import { BloomFeature } from './features/bloom-feature.js';
import { FrameRateReducer } from './features/framerate-reducer.js';

export class AnimeViewer {
    constructor(canvas, container) {
        this.canvas = canvas;
        this.container = container;

        this.isPlaying = true;
        this.isRecordingNow = false;
        this.clock = new THREE.Clock();
        this.loadedModel = null;
        this.loadedSkyboxTexture = null;
        this.mixer = null;
        this.blenderCamera = null;
        this.usesBlenderCam = false;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111215);

        this.setupRenderer();
        this.setupCameras();
        this.setupLighting();
        this.setupHelpers();
        this.setupPostProcessingComposer();
        this.setupFeatureSystems();

        // Native recording
        this.mediaRecorder = null;
        this.recordedChunks = [];

        // Bind and start loop
        this.animate = this.animate.bind(this);
        this.renderer.setAnimationLoop(this.animate);
    }

    // =========================================================================
    // CORE SETUP
    // =========================================================================

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    setupCameras() {
        this.orbitCamera = new THREE.PerspectiveCamera(
            45,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            2000
        );
        this.orbitCamera.position.set(0, 5, 10);

        this.controls = new OrbitControls(this.orbitCamera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1;

        this.blenderCamera = null;
        this.currentCamera = this.orbitCamera;
        this.usesBlenderCam = false;
    }

    setupLighting() {
        // Ambient: controllable via shadowDarkening
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);

        // Main directional with shadows
        this.mainDirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.mainDirLight.position.set(10, 18, 12);
        this.mainDirLight.castShadow = true;
        this.mainDirLight.shadow.mapSize.width = 1024;
        this.mainDirLight.shadow.mapSize.height = 1024;
        this.mainDirLight.shadow.camera.near = 0.1;
        this.mainDirLight.shadow.camera.far = 200;
        const d = 20;
        this.mainDirLight.shadow.camera.left = -d;
        this.mainDirLight.shadow.camera.right = d;
        this.mainDirLight.shadow.camera.top = d;
        this.mainDirLight.shadow.camera.bottom = -d;
        this.mainDirLight.shadow.bias = -0.001;
        this.mainDirLight.shadow.normalBias = 0.02;
        this.scene.add(this.mainDirLight);

        // Ground plane to receive shadows (invisible but real)
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.35, transparent: true });
        this.shadowReceiver = new THREE.Mesh(groundGeo, groundMat);
        this.shadowReceiver.rotation.x = -Math.PI / 2;
        this.shadowReceiver.position.y = 0;
        this.shadowReceiver.receiveShadow = true;
        this.shadowReceiver.visible = true;
        this.scene.add(this.shadowReceiver);
    }

    setupHelpers() {
        this.gridHelper = new THREE.GridHelper(60, 60, 0x38bdf8, 0x334155);
        this.gridHelper.position.y = 0.001;
        this.gridHelper.visible = false;
        this.scene.add(this.gridHelper);
    }

    setupPostProcessingComposer() {
        this.composer = new EffectComposer(this.renderer);

        this.renderPass = new RenderPass(this.scene, this.currentCamera);
        this.composer.addPass(this.renderPass);

        // Bloom pass (used by HighlightBlurSystem — starts at 0 strength)
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
            0.0,   // strength — 0 = disabled
            0.4,   // radius
            0.85   // threshold — high so only bright things bloom
        );
        this.composer.addPass(this.bloomPass);

        // Color correction
        this.colorCorrectionPass = new ShaderPass({
            uniforms: {
                tDiffuse: { value: null },
                u_exposure: { value: 1.0 },
                u_contrast: { value: 1.0 },
                u_saturation: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float u_exposure;
                uniform float u_contrast;
                uniform float u_saturation;
                varying vec2 vUv;
                void main() {
                    vec4 texel = texture2D(tDiffuse, vUv);
                    vec3 color = texel.rgb * u_exposure;
                    color = (color - 0.5) * u_contrast + 0.5;
                    float luma = dot(color, vec3(0.299, 0.587, 0.114));
                    color = mix(vec3(luma), color, u_saturation);
                    gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
                }
            `
        });
        this.composer.addPass(this.colorCorrectionPass);
    }

    setupFeatureSystems() {
        // All subsystems initialized here — none are stubs
        this.specularSystem = new SpecularHighlightSystem(this.scene);
        this.meshShadowSystem = new MeshShadowsSystem(this.scene);
        this.highlightBlurSystem = new HighlightBlurSystem(this.bloomPass);
        this.skySystem = new SkyColorSystem(this.scene);
        this.outlineFeature = new OutlineFeature();
        this.celShader = new CelShaderSystem();
        this.bloomFeature = new BloomFeature(this.canvas, this.container);
        this.fpsReducer = new FrameRateReducer();

        this.features = {
            outline: false,
            fpsReducer: false,
            bloom: false,
            celFilter: false,
            meshShadows: false,
            highlightBlur: false,
            skyOverride: false,
            skyNightMode: false,
            specular: false
        };
    }

    // =========================================================================
    // PLAYBACK
    // =========================================================================

    togglePlayback(forceState) {
        this.isPlaying = (forceState !== undefined) ? forceState : !this.isPlaying;
        return this.isPlaying;
    }

    restartAnimation() {
        if (!this.mixer) return;
        this.mixer.stopAllAction();
        this.mixer.time = 0;
        this.clock.getDelta(); // flush delta
        if (this.isPlaying) {
            this.mixer._actions.forEach(act => {
                act.reset();
                act.play();
            });
        }
    }

    // =========================================================================
    // CAMERA
    // =========================================================================

    toggleCameraMode() {
        if (this.blenderCamera) {
            this.usesBlenderCam = !this.usesBlenderCam;
            this.currentCamera = this.usesBlenderCam ? this.blenderCamera : this.orbitCamera;
        } else {
            this.usesBlenderCam = false;
            this.currentCamera = this.orbitCamera;
        }
        this.renderPass.camera = this.currentCamera;
        return this.usesBlenderCam;
    }

    focusAndScaleModel() {
        if (!this.loadedModel) return;

        const box = new THREE.Box3().setFromObject(this.loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.orbitCamera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;

        this.orbitCamera.position.set(
            center.x,
            center.y + size.y * 0.25,
            center.z + cameraZ
        );
        this.controls.target.copy(center);
        this.controls.update();

        // Move shadow receiver to model base
        this.shadowReceiver.position.y = box.min.y;
    }

    // =========================================================================
    // SCENE HELPERS
    // =========================================================================

    toggleGrid() {
        this.gridHelper.visible = !this.gridHelper.visible;
        return this.gridHelper.visible;
    }

    updateShadowMapResolution(res) {
        this.mainDirLight.shadow.mapSize.width = res;
        this.mainDirLight.shadow.mapSize.height = res;
        // Must dispose old map to force regeneration
        if (this.mainDirLight.shadow.map) {
            this.mainDirLight.shadow.map.dispose();
            this.mainDirLight.shadow.map = null;
        }
    }

    // =========================================================================
    // COLOR CORRECTION
    // =========================================================================

    updateExposure(val) { this.colorCorrectionPass.uniforms.u_exposure.value = val; }
    updateContrast(val) { this.colorCorrectionPass.uniforms.u_contrast.value = val; }
    updateSaturation(val) { this.colorCorrectionPass.uniforms.u_saturation.value = val; }

    // =========================================================================
    // SPECULAR HIGHLIGHT SYSTEM
    // =========================================================================

    toggleSpecularHighlightFeature() {
        this.features.specular = this.specularSystem.toggle();
        // Adjust ambient to simulate shadow darkening when specular is active
        if (this.features.specular) {
            this.ambientLight.intensity = 0.5 * (1.0 - this.specularSystem.params.shadowDarkening * 0.6);
        } else {
            this.ambientLight.intensity = 0.5;
        }
        return this.features.specular;
    }

    setSpecularSunOrbit(val) { this.specularSystem.setSunOrbit(val); }
    setSpecularSunAltitude(val) { this.specularSystem.setSunAltitude(val); }

    setSpecularShadowDarkening(val) {
        this.specularSystem.setShadowDarkening(val);
        if (this.features.specular) {
            this.ambientLight.intensity = 0.5 * (1.0 - val * 0.6);
        }
    }

    setSpecularIntensity(val) { this.specularSystem.setSpecularIntensity(val); }

    // =========================================================================
    // MESH SHADOWS
    // =========================================================================

    toggleMeshShadows() {
        this.features.meshShadows = !this.features.meshShadows;
        this.meshShadowSystem.setVisible(this.features.meshShadows);
        if (this.features.meshShadows && this.loadedModel) {
            this.meshShadowSystem.buildProxies(this.loadedModel, this.mixer);
        }
        return this.features.meshShadows;
    }

    setMeshShadowOpacity(val) { this.meshShadowSystem.setOpacity(val); }
    setMeshShadowColor(hex) { this.meshShadowSystem.setColor(hex); }
    setMeshShadowOffsetX(val) { this.meshShadowSystem.setOffsetX(val); }
    setMeshShadowOffsetZ(val) { this.meshShadowSystem.setOffsetZ(val); }

    // =========================================================================
    // HIGHLIGHT BLUR / GLARE
    // =========================================================================

    toggleHighlightBlur() {
        this.features.highlightBlur = this.highlightBlurSystem.toggle();
        return this.features.highlightBlur;
    }

    setHighlightBlurIntensity(val) { this.highlightBlurSystem.setIntensity(val); }
    setHighlightBlurThreshold(val) { this.highlightBlurSystem.setThreshold(val); }
    setHighlightGlareSize(val) { this.highlightBlurSystem.setGlareSize(val); }

    // =========================================================================
    // SKY SYSTEM
    // =========================================================================

    toggleSkyboxOverride() {
        this.features.skyOverride = this.skySystem.toggle(undefined, this.loadedSkyboxTexture);
        if (!this.features.skyOverride && this.loadedSkyboxTexture) {
            this.scene.background = this.loadedSkyboxTexture;
        } else if (!this.features.skyOverride) {
            this.scene.background = new THREE.Color(0x111215);
        }
        return this.features.skyOverride;
    }

    toggleSkyNightMode() {
        this.features.skyNightMode = !this.features.skyNightMode;
        this.skySystem.setNightMode(this.features.skyNightMode);
        return this.features.skyNightMode;
    }

    setSkyExposure(val) { this.skySystem.setExposure(val); }
    setSkyCloudAmount(val) { this.skySystem.setCloudAmount(val); }
    setSkyCloudColor(hex) { this.skySystem.setCloudColor(hex); }

    setSkyMoonPhase(phase) {
        const map = { crescent: 0.15, half: 0.5, full: 1.0 };
        this.skySystem.setMoonPhase(map[phase] ?? 1.0);
    }

    // =========================================================================
    // OUTLINE
    // =========================================================================

    toggleOutline() {
        this.features.outline = this.outlineFeature.toggle();
        // If toggling on and model is loaded but outlines not generated yet, generate them
        if (this.features.outline && this.loadedModel && this.outlineFeature.outlineMeshes.length === 0) {
            this.outlineFeature.generateOutlines(this.loadedModel);
            // Re-toggle to ensure visibility is set
            this.outlineFeature.isActive = false;
            this.outlineFeature.toggle();
        }
        return this.features.outline;
    }

    setOutlineThickness(val) { this.outlineFeature.setThickness(val); }

    // =========================================================================
    // CEL / ANIME FILTER
    // =========================================================================

    toggleCelFilter() {
        this.features.celFilter = this.celShader.toggle();
        return this.features.celFilter;
    }

    setCelSteps(val) { this.celShader.setSteps(val); }

    // =========================================================================
    // GLOW OVERLAY (Canvas Bloom)
    // =========================================================================

    toggleBloomOverlay() {
        this.features.bloom = this.bloomFeature.toggle();
        return this.features.bloom;
    }

    setBloomIntensity(val) { this.bloomFeature.setIntensity(val); }

    // =========================================================================
    // FPS REDUCER
    // =========================================================================

    toggleFpsReducer() {
        this.features.fpsReducer = this.fpsReducer.toggle();
        return this.features.fpsReducer;
    }

    // =========================================================================
    // MODEL & ASSET LOADING
    // =========================================================================

    loadModelData(arrayBuffer) {
        // Clean up previous model
        if (this.loadedModel) {
            this.scene.remove(this.loadedModel);
            this.loadedModel.traverse(node => {
                if (node.isMesh) {
                    node.geometry.dispose();
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach(m => m.dispose());
                }
            });
        }

        this.meshShadowSystem.clearProxies();
        this.outlineFeature.clearOutlines();
        this.celShader.clearPatches();

        this.mixer = null;
        this.blenderCamera = null;
        this.usesBlenderCam = false;
        this.currentCamera = this.orbitCamera;
        this.renderPass.camera = this.orbitCamera;

        const loader = new GLTFLoader();
        loader.parse(arrayBuffer, '', (gltf) => {
            this.loadedModel = gltf.scene;

            gltf.cameras.forEach(cam => {
                if (!this.blenderCamera) this.blenderCamera = cam;
            });

            this.loadedModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    if (node.material) {
                        const mats = Array.isArray(node.material) ? node.material : [node.material];
                        mats.forEach(m => {
                            m.depthWrite = true;
                        });
                    }
                }
            });

            this.scene.add(this.loadedModel);

            // Apply cel shader to all materials in model
            this.celShader.applyToModel(this.loadedModel);

            // Generate outlines if feature is active
            if (this.features.outline) {
                this.outlineFeature.generateOutlines(this.loadedModel);
            }

            // Setup animations
            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.loadedModel);
                gltf.animations.forEach((clip) => {
                    const action = this.mixer.clipAction(clip);
                    action.play();
                });
            }

            // Build mesh shadow proxies if feature is active
            if (this.features.meshShadows) {
                this.meshShadowSystem.buildProxies(this.loadedModel, this.mixer);
            }

            this.focusAndScaleModel();
        }, (err) => {
            console.error('GLTF load error:', err);
        });
    }

    loadHDRISkybox(arrayBuffer) {
        const blob = new Blob([arrayBuffer]);
        const url = URL.createObjectURL(blob);
        new RGBELoader().load(url, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            this.loadedSkyboxTexture = texture;
            this.skySystem.setBackgroundTexture(texture);

            if (!this.features.skyOverride) {
                this.scene.background = texture;
            } else {
                // Sky override is ON: update the dome texture
                this.skySystem.setBackgroundTexture(texture);
            }

            URL.revokeObjectURL(url);
        }, undefined, (err) => {
            console.error('HDR load error:', err);
            URL.revokeObjectURL(url);
        });
    }

    loadEXRSkybox(arrayBuffer) {
        const blob = new Blob([arrayBuffer]);
        const url = URL.createObjectURL(blob);
        new EXRLoader().load(url, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            this.loadedSkyboxTexture = texture;
            this.skySystem.setBackgroundTexture(texture);

            if (!this.features.skyOverride) {
                this.scene.background = texture;
            }

            URL.revokeObjectURL(url);
        }, undefined, (err) => {
            console.error('EXR load error:', err);
            URL.revokeObjectURL(url);
        });
    }

    loadZipCubemap(arrayBuffer) {
        console.warn('ZIP cubemap loading not yet implemented.');
    }

    // =========================================================================
    // NATIVE RECORDING
    // =========================================================================

    startNativeRecording() {
        this.recordedChunks = [];
        const stream = this.canvas.captureStream(30);

        let options = { mimeType: 'video/webm; codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm; codecs=vp8' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }

        try {
            this.mediaRecorder = new MediaRecorder(stream, options);
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `capture_${Date.now()}.webm`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
            this.mediaRecorder.start(100); // collect data every 100ms
            this.isRecordingNow = true;
            return true;
        } catch (e) {
            console.error('MediaRecorder error:', e);
            return false;
        }
    }

    stopNativeRecording() {
        if (this.mediaRecorder && this.isRecordingNow) {
            this.mediaRecorder.stop();
            this.isRecordingNow = false;
        }
    }

    // =========================================================================
    // RESIZE
    // =========================================================================

    handleResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.orbitCamera.aspect = w / h;
        this.orbitCamera.updateProjectionMatrix();

        if (this.blenderCamera && this.blenderCamera.isPerspectiveCamera) {
            this.blenderCamera.aspect = w / h;
            this.blenderCamera.updateProjectionMatrix();
        }

        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomFeature.resize();
    }

    // =========================================================================
    // MAIN RENDER LOOP
    // =========================================================================

    animate() {
        const rawDelta = this.clock.getDelta();
        const elapsed = this.clock.getElapsedTime();

        // FPS limiter: if active, skip render on frames that don't meet interval
        const shouldRender = this.fpsReducer.shouldRender(rawDelta);
        const delta = this.features.fpsReducer
            ? (shouldRender ? this.fpsReducer.getLastDelta() : rawDelta)
            : rawDelta;

        if (!this.features.fpsReducer || shouldRender) {
            // Sky update (always runs for cloud animation)
            this.skySystem.update(elapsed);

            // Animation mixer
            if (this.mixer && this.isPlaying) {
                this.mixer.update(delta);
            }

            // Mesh shadow proxy update
            this.meshShadowSystem.update();

            // Orbit controls
            if (this.controls && !this.usesBlenderCam) {
                this.controls.update();
            }

            // Main post-processing composer render
            this.composer.render();

            // Canvas bloom overlay (rendered on top of composer output)
            if (this.features.bloom) {
                this.bloomFeature.render();
            }
        }
    }
}
