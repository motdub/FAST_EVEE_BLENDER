import * as THREE from 'three';
import { OrbitControls }   from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader }      from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader }      from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader }       from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass }      from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { SpecularHighlightSystem } from './features/specular-highlight.js';
import { MeshShadowsSystem }       from './features/mesh-shadows.js';
import { HighlightBlurSystem }     from './features/highlight-blur.js';
import { SkyColorSystem }          from './features/skycolor.js';
import { OutlineFeature }          from './features/outline-feature.js';
import { CelShaderSystem }         from './features/cel-shader.js';
import { BloomFeature }            from './features/bloom-feature.js';
import { FrameRateReducer }        from './features/framerate-reducer.js';

export class AnimeViewer {
    constructor(canvas, container) {
        this.canvas    = canvas;
        this.container = container;

        this.isPlaying      = true;
        this.isRecordingNow = false;
        this.clock          = new THREE.Clock();
        this.loadedModel    = null;

        this.loadedSkyboxTexture     = null;
        this.loadedSkyboxBackground  = null;

        this.mixer         = null;
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

        this.mediaRecorder  = null;
        this.recordedChunks = [];

        this.animate = this.animate.bind(this);
        this.renderer.setAnimationLoop(this.animate);
    }

    // =========================================================================
    // CORE SETUP
    // =========================================================================

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas:          this.canvas,
            antialias:       true,
            alpha:           false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace  = THREE.SRGBColorSpace;
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

        this.currentCamera  = this.orbitCamera;
        this.usesBlenderCam = false;
    }

    setupLighting() {
        // Ambient — start at moderate intensity
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        // Main fill/shadow light
        this.mainDirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
        this.mainDirLight.position.set(10, 18, 12);
        this.mainDirLight.castShadow = true;
        this.mainDirLight.shadow.mapSize.width  = 1024;
        this.mainDirLight.shadow.mapSize.height = 1024;
        this.mainDirLight.shadow.camera.near   = 0.1;
        this.mainDirLight.shadow.camera.far    = 200;
        const d = 20;
        this.mainDirLight.shadow.camera.left   = -d;
        this.mainDirLight.shadow.camera.right  =  d;
        this.mainDirLight.shadow.camera.top    =  d;
        this.mainDirLight.shadow.camera.bottom = -d;
        this.mainDirLight.shadow.bias          = -0.001;
        this.mainDirLight.shadow.normalBias    =  0.02;
        this.scene.add(this.mainDirLight);
        this.scene.add(this.mainDirLight.target);
        this.mainDirLight.target.position.set(0, 0, 0);
    }

    setupHelpers() {
        this.gridHelper = new THREE.GridHelper(60, 60, 0x38bdf8, 0x334155);
        this.gridHelper.position.y = 0.001;
        this.gridHelper.visible    = false;
        this.scene.add(this.gridHelper);
    }

    setupPostProcessingComposer() {
        this.composer = new EffectComposer(this.renderer);

        this.renderPass = new RenderPass(this.scene, this.currentCamera);
        this.composer.addPass(this.renderPass);

        // Glare/bloom pass — starts disabled
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
            0.0, 0.15, 0.75
        );
        this.composer.addPass(this.bloomPass);

        // Color correction pass
        this.colorCorrectionPass = new ShaderPass({
            uniforms: {
                tDiffuse:     { value: null },
                u_exposure:   { value: 1.0 },
                u_contrast:   { value: 1.0 },
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
                    vec4  tex   = texture2D(tDiffuse, vUv);
                    vec3  col   = tex.rgb * u_exposure;
                    col = (col - 0.5) * u_contrast + 0.5;
                    float luma  = dot(col, vec3(0.299, 0.587, 0.114));
                    col = mix(vec3(luma), col, u_saturation);
                    gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
                }
            `
        });
        this.composer.addPass(this.colorCorrectionPass);

        // Cel shader pass — LAST so it quantizes the final composited image
        // (CelShaderSystem.createPass() returns the ShaderPass to add)
        // We create the system first, then add its pass here
        this._celPassPlaceholder = null; // filled in setupFeatureSystems
    }

    setupFeatureSystems() {
        this.specularSystem      = new SpecularHighlightSystem(this.scene);
        this.meshShadowSystem    = new MeshShadowsSystem(this.scene);
        this.highlightBlurSystem = new HighlightBlurSystem(this.bloomPass);
        this.skySystem           = new SkyColorSystem(this.scene);
        this.outlineFeature      = new OutlineFeature();
        this.celShader           = new CelShaderSystem();
        this.bloomFeature        = new BloomFeature(this.canvas, this.container);
        this.fpsReducer          = new FrameRateReducer();

        // Add cel shader as the LAST pass in the composer pipeline
        const celPass = this.celShader.createPass();
        this.composer.addPass(celPass);

        this.features = {
            outline:       false,
            fpsReducer:    false,
            bloom:         false,
            celFilter:     false,
            meshShadows:   false,
            highlightBlur: false,
            skyOverride:   false,
            skyNightMode:  false,
            specular:      false,
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
        this.clock.getDelta();
        if (this.isPlaying) {
            this.mixer._actions.forEach(a => { a.reset(); a.play(); });
        }
    }

    // =========================================================================
    // CAMERA
    // =========================================================================

    toggleCameraMode() {
        if (this.blenderCamera) {
            this.usesBlenderCam = !this.usesBlenderCam;
            this.currentCamera  = this.usesBlenderCam ? this.blenderCamera : this.orbitCamera;
        } else {
            this.usesBlenderCam = false;
            this.currentCamera  = this.orbitCamera;
        }
        this.renderPass.camera = this.currentCamera;
        return this.usesBlenderCam;
    }

    focusAndScaleModel() {
        if (!this.loadedModel) return;

        const box    = new THREE.Box3().setFromObject(this.loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov    = this.orbitCamera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;

        this.orbitCamera.position.set(center.x, center.y + size.y * 0.25, center.z + cameraZ);
        this.controls.target.copy(center);
        this.controls.update();

        this.specularSystem.setModelCenter(center);
        this.meshShadowSystem.setFloorY(box.min.y);
        this.meshShadowSystem.setModelCenter(center);

        this.mainDirLight.target.position.copy(center);
        this.mainDirLight.target.updateMatrixWorld();

        this.skySystem.setSunDirection(
            this.specularSystem.params.sunOrbitDegrees,
            this.specularSystem.params.sunAltitudeDegrees
        );
    }

    // =========================================================================
    // SCENE HELPERS
    // =========================================================================

    toggleGrid() {
        this.gridHelper.visible = !this.gridHelper.visible;
        return this.gridHelper.visible;
    }

    updateShadowMapResolution(res) {
        this.mainDirLight.shadow.mapSize.width  = res;
        this.mainDirLight.shadow.mapSize.height = res;
        if (this.mainDirLight.shadow.map) {
            this.mainDirLight.shadow.map.dispose();
            this.mainDirLight.shadow.map = null;
        }
        this.meshShadowSystem.shadowLight.shadow.mapSize.width  = res;
        this.meshShadowSystem.shadowLight.shadow.mapSize.height = res;
        if (this.meshShadowSystem.shadowLight.shadow.map) {
            this.meshShadowSystem.shadowLight.shadow.map.dispose();
            this.meshShadowSystem.shadowLight.shadow.map = null;
        }
    }

    // =========================================================================
    // COLOR CORRECTION
    // =========================================================================

    updateExposure(val)   { this.colorCorrectionPass.uniforms.u_exposure.value   = val; }
    updateContrast(val)   { this.colorCorrectionPass.uniforms.u_contrast.value   = val; }
    updateSaturation(val) { this.colorCorrectionPass.uniforms.u_saturation.value = val; }

    // =========================================================================
    // SPECULAR HIGHLIGHT SYSTEM
    // =========================================================================

    /**
     * Ambient dimming for shadow-side darkening.
     * When shadows/specular active: drop ambient to near-zero so the shadow side
     * of the mesh is visibly dark. The main directional light + specular lights
     * provide brightness on the lit side.
     */
    _updateAmbientForShadows() {
        const shadowActive   = this.features.meshShadows;
        const specularActive = this.features.specular;
        const darkening      = this.specularSystem.params.shadowDarkening;

        if (specularActive || shadowActive) {
            // Drop ambient very aggressively — shadow side should be noticeably dark.
            // darkening slider 0.0 = ambient stays at 0.4, darkening 1.0 = ambient at 0.03
            const minAmbient = 0.03;
            const maxAmbient = 0.4;
            this.ambientLight.intensity = maxAmbient - (maxAmbient - minAmbient) * darkening;
        } else {
            this.ambientLight.intensity = 0.6;
        }
    }

    toggleSpecularHighlightFeature() {
        this.features.specular = this.specularSystem.toggle();
        // Patch mesh materials so roughness is low enough for visible specular
        if (this.features.specular && this.loadedModel) {
            this.specularSystem.patchMaterialsForSpecular(this.loadedModel);
        } else {
            this.specularSystem.restoreMaterials();
        }
        this._updateAmbientForShadows();
        return this.features.specular;
    }

    setSpecularSunOrbit(val) {
        this.specularSystem.setSunOrbit(val);
        this.skySystem.setSunDirection(val, this.specularSystem.params.sunAltitudeDegrees);
    }

    setSpecularSunAltitude(val) {
        this.specularSystem.setSunAltitude(val);
        this.skySystem.setSunDirection(this.specularSystem.params.sunOrbitDegrees, val);
    }

    setSpecularShadowDarkening(val) {
        this.specularSystem.setShadowDarkening(val);
        this._updateAmbientForShadows();
    }

    setSpecularIntensity(val)    { this.specularSystem.setSpecularIntensity(val); }
    setSpecularRimIntensity(val) { this.specularSystem.setRimIntensity(val); }

    setSpecularSunColor(hex) {
        this.specularSystem.setSunColor(hex);
        this.skySystem.setSunColor(hex);
    }

    // =========================================================================
    // MESH SHADOWS
    // =========================================================================

    toggleMeshShadows() {
        this.features.meshShadows = !this.features.meshShadows;
        this.meshShadowSystem.setVisible(this.features.meshShadows);
        if (this.features.meshShadows && this.loadedModel) {
            this.meshShadowSystem.buildProxies(this.loadedModel);
        }
        this._updateAmbientForShadows();
        return this.features.meshShadows;
    }

    setMeshShadowOpacity(val) { this.meshShadowSystem.setOpacity(val); }
    setMeshShadowColor(hex)   { this.meshShadowSystem.setColor(hex); }
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
    setHighlightGlareSize(val)     { this.highlightBlurSystem.setGlareSize(val); }

    // =========================================================================
    // SKY SYSTEM
    // =========================================================================

    toggleSkyboxOverride() {
        this.features.skyOverride = !this.features.skyOverride;

        if (this.features.skyOverride) {
            this.skySystem.setBackgroundTexture(this.loadedSkyboxTexture);
            this.skySystem.toggle(true);
            // KEY FIX: set scene.background to the horizon color (blue) not null.
            // This means if the dome sphere has any gap, you see blue not black.
            // The dome renders on top and covers everything anyway.
            this.scene.background = this.skySystem.getHorizonColor();
        } else {
            this.skySystem.toggle(false);
            if (this.loadedSkyboxBackground) {
                this.scene.background = this.loadedSkyboxBackground;
            } else {
                this.scene.background = new THREE.Color(0x111215);
            }
        }

        return this.features.skyOverride;
    }

    toggleSkyNightMode() {
        this.features.skyNightMode = !this.features.skyNightMode;
        this.skySystem.setNightMode(this.features.skyNightMode);
        // Update scene.background fallback color for night
        if (this.features.skyOverride) {
            this.scene.background = this.skySystem.getHorizonColor();
        }
        return this.features.skyNightMode;
    }

    setSkyExposure(val)    { this.skySystem.setExposure(val); }
    setSkyCloudAmount(val) { this.skySystem.setCloudAmount(val); }
    setSkyCloudColor(hex)  { this.skySystem.setCloudColor(hex); }
    setSkyMoonPhase(phase) {
        const map = { crescent: 0.15, half: 0.5, full: 1.0 };
        this.skySystem.setMoonPhase(map[phase] ?? 1.0);
    }

    setSkySunOrbit(val) {
        this._skySunOrbit = val;
        this.skySystem.setSunDirection(val, this._skySunAltitude ?? 60);
    }

    setSkySunAltitude(val) {
        this._skySunAltitude = val;
        this.skySystem.setSunDirection(this._skySunOrbit ?? 45, val);
    }

    // =========================================================================
    // OUTLINE
    // =========================================================================

    toggleOutline() {
        if (this.loadedModel && this.outlineFeature.outlineMeshes.length === 0) {
            this.outlineFeature.generateOutlines(this.loadedModel);
            this.outlineFeature.isActive = false;
        }
        this.features.outline = this.outlineFeature.toggle();
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
    // GLOW OVERLAY
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
    // MODEL LOADING
    // =========================================================================

    loadModelData(arrayBuffer) {
        if (this.loadedModel) {
            this.scene.remove(this.loadedModel);
            this.loadedModel.traverse(node => {
                if (node.isMesh) {
                    node.geometry.dispose();
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach(m => m && m.dispose());
                }
            });
        }

        // Restore materials before clearing patches
        this.specularSystem.restoreMaterials();
        this.outlineFeature.clearOutlines();
        this.meshShadowSystem.clearProxies();

        this.mixer         = null;
        this.blenderCamera = null;
        this.usesBlenderCam = false;
        this.currentCamera  = this.orbitCamera;
        this.renderPass.camera = this.orbitCamera;

        const loader = new GLTFLoader();
        loader.parse(arrayBuffer, '', (gltf) => {
            this.loadedModel = gltf.scene;

            gltf.cameras.forEach(cam => {
                if (!this.blenderCamera) this.blenderCamera = cam;
            });

            this.loadedModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow    = true;
                    node.receiveShadow = true;
                    if (node.material) {
                        const mats = Array.isArray(node.material) ? node.material : [node.material];
                        mats.forEach(m => { if (m) m.depthWrite = true; });
                    }
                }
            });

            this.scene.add(this.loadedModel);

            // Re-apply specular material patch if active
            if (this.features.specular) {
                this.specularSystem.patchMaterialsForSpecular(this.loadedModel);
            }

            if (this.features.outline) {
                this.outlineFeature.generateOutlines(this.loadedModel);
                this.outlineFeature.isActive = false;
                this.outlineFeature.toggle();
            }

            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.loadedModel);
                gltf.animations.forEach(clip => this.mixer.clipAction(clip).play());
            }

            this.focusAndScaleModel();

            if (this.features.meshShadows) {
                this.meshShadowSystem.buildProxies(this.loadedModel);
            }

        }, (err) => console.error('GLTF load error:', err));
    }

    // =========================================================================
    // SKYBOX LOADING
    // =========================================================================

    _processSkyboxTexture(texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        this.loadedSkyboxTexture = texture;

        const pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader();
        const envRenderTarget = pmrem.fromEquirectangular(texture);
        pmrem.dispose();

        this.scene.environment = envRenderTarget.texture;
        this.loadedSkyboxBackground = texture;

        if (this.features.skyOverride) {
            this.skySystem.setBackgroundTexture(texture);
        } else {
            this.scene.background = texture;
        }
    }

    loadHDRISkybox(arrayBuffer) {
        const url = URL.createObjectURL(new Blob([arrayBuffer]));
        new RGBELoader().load(url, (texture) => {
            this._processSkyboxTexture(texture);
            URL.revokeObjectURL(url);
        }, undefined, (err) => {
            console.error('HDR load error:', err);
            URL.revokeObjectURL(url);
        });
    }

    loadEXRSkybox(arrayBuffer) {
        const url = URL.createObjectURL(new Blob([arrayBuffer]));
        new EXRLoader().load(url, (texture) => {
            this._processSkyboxTexture(texture);
            URL.revokeObjectURL(url);
        }, undefined, (err) => {
            console.error('EXR load error:', err);
            URL.revokeObjectURL(url);
        });
    }

    loadZipCubemap(arrayBuffer) {
        const loadJSZip = () => {
            if (window.JSZip) return Promise.resolve(window.JSZip);
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                s.onload = () => resolve(window.JSZip);
                s.onerror = () => reject(new Error('Failed to load JSZip'));
                document.head.appendChild(s);
            });
        };

        loadJSZip().then(JSZip => JSZip.loadAsync(arrayBuffer)).then(zip => {
            const faceMap = { px: null, nx: null, py: null, ny: null, pz: null, nz: null };
            const altNames = {
                right: 'px', left: 'nx', top: 'py', up: 'py',
                bottom: 'ny', down: 'ny', front: 'pz', back: 'nz',
                posx: 'px', negx: 'nx', posy: 'py', negy: 'ny', posz: 'pz', negz: 'nz'
            };

            const imagePromises = [];
            zip.forEach((relativePath, zipEntry) => {
                if (zipEntry.dir) return;
                const base = relativePath.split('/').pop().toLowerCase().replace(/\.(jpg|jpeg|png|webp)$/, '');
                const faceKey = faceMap.hasOwnProperty(base) ? base : altNames[base];
                if (!faceKey) return;

                const p = zipEntry.async('blob').then(blob => {
                    return new Promise((res, rej) => {
                        const img = new Image();
                        const url = URL.createObjectURL(blob);
                        img.onload = () => { URL.revokeObjectURL(url); res({ key: faceKey, img }); };
                        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed: ' + relativePath)); };
                        img.src = url;
                    });
                });
                imagePromises.push(p);
            });

            return Promise.all(imagePromises).then(results => {
                results.forEach(({ key, img }) => { faceMap[key] = img; });
                const order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
                if (order.some(k => !faceMap[k])) {
                    console.error('ZIP cubemap: missing faces. Found:', results.map(r => r.key));
                    return;
                }
                const cube = new THREE.CubeTexture(order.map(k => faceMap[k]));
                cube.needsUpdate = true;
                this.loadedSkyboxTexture    = cube;
                this.loadedSkyboxBackground = cube;
                this.scene.environment      = cube;
                if (!this.features.skyOverride) {
                    this.scene.background = cube;
                }
            });
        }).catch(err => console.error('ZIP cubemap load error:', err));
    }

    // =========================================================================
    // RECORDING
    // =========================================================================

    startNativeRecording() {
        this.recordedChunks = [];
        const stream = this.canvas.captureStream(30);
        let options = { mimeType: 'video/webm; codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm; codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
        try {
            this.mediaRecorder = new MediaRecorder(stream, options);
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data?.size > 0) this.recordedChunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const url  = URL.createObjectURL(blob);
                const a    = Object.assign(document.createElement('a'), { href: url, download: `capture_${Date.now()}.webm` });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
            this.mediaRecorder.start(100);
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

        if (this.blenderCamera?.isPerspectiveCamera) {
            this.blenderCamera.aspect = w / h;
            this.blenderCamera.updateProjectionMatrix();
        }

        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomFeature.resize();
    }

    // =========================================================================
    // RENDER LOOP
    // =========================================================================

    animate() {
        const rawDelta = this.clock.getDelta();
        const elapsed  = this.clock.getElapsedTime();

        if (!this.features.fpsReducer || this.fpsReducer.shouldRender(rawDelta)) {
            const delta = this.features.fpsReducer ? this.fpsReducer.getLastDelta() : rawDelta;

            this.skySystem.update(elapsed);

            if (this.mixer && this.isPlaying) {
                this.mixer.update(delta);
            }

            this.meshShadowSystem.update();

            if (this.controls && !this.usesBlenderCam) {
                this.controls.update();
            }

            this.composer.render();

            if (this.features.bloom) {
                this.bloomFeature.render();
            }
        }
    }
}
