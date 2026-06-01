import '../assets/styles.css';
import { AnimeViewer } from './viewer.js';

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('viewport-container');
    const canvas = document.getElementById('three-canvas');

    if (!container || !canvas) {
        console.error('Missing canvas or container element.');
        return;
    }

    const viewer = new AnimeViewer(canvas, container);

    // =========================================================================
    // UI ELEMENT REFERENCES
    // =========================================================================
    const dropZone = document.getElementById('drop-zone-overlay');
    const playPauseBtn = document.getElementById('btn-play-pause');
    const cameraToggleBtn = document.getElementById('btn-camera-toggle');
    const gridToggleBtn = document.getElementById('btn-grid-toggle');
    const recModal = document.getElementById('recording-modal-overlay');
    const toast = document.getElementById('recording-toast');
    const btnFullscreenRecord = document.getElementById('btn-fullscreen-record');

    let toastTimeout = null;

    // =========================================================================
    // DRAG AND DROP
    // =========================================================================

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dropZone) dropZone.style.opacity = '1';
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        const outside = (
            e.clientX <= 0 || e.clientY <= 0 ||
            e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
        );
        if (dropZone && outside) dropZone.style.opacity = '0';
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dropZone) dropZone.style.opacity = '0';
        const files = e.dataTransfer.files;
        if (files && files.length > 0) processFileRouting(files[0]);
    });

    // =========================================================================
    // FILE PICKERS
    // =========================================================================

    document.getElementById('glb-file-picker')?.addEventListener('change', (e) => {
        if (e.target.files?.[0]) processFileRouting(e.target.files[0]);
    });

    document.getElementById('hdri-file-picker')?.addEventListener('change', (e) => {
        if (e.target.files?.[0]) processFileRouting(e.target.files[0]);
    });

    function processFileRouting(file) {
        if (!file?.name) return;
        const name = file.name.toLowerCase();
        const reader = new FileReader();

        if (name.endsWith('.glb') || name.endsWith('.gltf')) {
            reader.onload = (e) => {
                if (e.target?.result) viewer.loadModelData(e.target.result);
                if (playPauseBtn) playPauseBtn.innerText = 'Pause';
            };
            reader.readAsArrayBuffer(file);
        } else if (name.endsWith('.hdr')) {
            reader.onload = (e) => {
                if (e.target?.result) viewer.loadHDRISkybox(e.target.result);
            };
            reader.readAsArrayBuffer(file);
        } else if (name.endsWith('.exr')) {
            reader.onload = (e) => {
                if (e.target?.result) viewer.loadEXRSkybox(e.target.result);
            };
            reader.readAsArrayBuffer(file);
        } else if (name.endsWith('.zip')) {
            reader.onload = (e) => {
                if (e.target?.result) viewer.loadZipCubemap(e.target.result);
            };
            reader.readAsArrayBuffer(file);
        }
    }

    // =========================================================================
    // PLAYBACK CONTROLS
    // =========================================================================

    playPauseBtn?.addEventListener('click', (e) => {
        const isPlaying = viewer.togglePlayback();
        e.target.innerText = isPlaying ? 'Pause' : 'Play';
    });

    document.getElementById('btn-restart')?.addEventListener('click', () => {
        viewer.restartAnimation();
        if (playPauseBtn) playPauseBtn.innerText = 'Pause';
    });

    // =========================================================================
    // CAMERA CONTROLS
    // =========================================================================

    function updateCamButtonUI(usesBlenderCam) {
        const btns = [
            cameraToggleBtn,
            document.getElementById('mdl-btn-camera-toggle')
        ];
        btns.forEach(btn => {
            if (!btn) return;
            btn.innerText = usesBlenderCam ? 'Blender Camera Active' : 'Orbit Camera Mode';
            btn.classList.toggle('toggle-active', usesBlenderCam);
            btn.classList.toggle('toggle-inactive', !usesBlenderCam);
        });
    }

    cameraToggleBtn?.addEventListener('click', () => {
        updateCamButtonUI(viewer.toggleCameraMode());
    });

    document.getElementById('btn-focus-model')?.addEventListener('click', () => {
        viewer.focusAndScaleModel();
    });

    // =========================================================================
    // SCENE HELPERS
    // =========================================================================

    gridToggleBtn?.addEventListener('click', (e) => {
        const on = viewer.toggleGrid();
        e.target.innerText = on ? 'Grid Floor ON' : 'Grid Floor OFF';
        e.target.classList.toggle('toggle-active', on);
        e.target.classList.toggle('toggle-inactive', !on);
    });

    document.getElementById('select-shadow-res')?.addEventListener('change', (e) => {
        viewer.updateShadowMapResolution(parseInt(e.target.value));
    });

    // =========================================================================
    // COLOR CORRECTION
    // =========================================================================

    document.getElementById('slider-exposure')?.addEventListener('input', (e) => {
        viewer.updateExposure(parseFloat(e.target.value));
    });
    document.getElementById('slider-contrast')?.addEventListener('input', (e) => {
        viewer.updateContrast(parseFloat(e.target.value));
    });
    document.getElementById('slider-saturation')?.addEventListener('input', (e) => {
        viewer.updateSaturation(parseFloat(e.target.value));
    });

    // =========================================================================
    // SPECULAR HIGHLIGHT OVERLAY
    // — Fixed: was calling toggleSpecularHighlightFeature which didn't exist
    // =========================================================================

    const toggleSpecularBtn = document.getElementById('toggle-specular');
    toggleSpecularBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleSpecularHighlightFeature(); // NOW CORRECTLY NAMED
        e.target.innerText = active ? 'Specular Overlay ON' : 'Specular Overlay OFF';
        e.target.classList.toggle('toggle-active', active);
        e.target.classList.toggle('toggle-inactive', !active);
    });

    document.getElementById('slider-sun-orbit')?.addEventListener('input', (e) => {
        viewer.setSpecularSunOrbit(parseFloat(e.target.value));
    });
    document.getElementById('slider-sun-altitude')?.addEventListener('input', (e) => {
        viewer.setSpecularSunAltitude(parseFloat(e.target.value));
    });
    document.getElementById('slider-shadow-darkening')?.addEventListener('input', (e) => {
        viewer.setSpecularShadowDarkening(parseFloat(e.target.value));
    });
    document.getElementById('slider-specular-intensity')?.addEventListener('input', (e) => {
        viewer.setSpecularIntensity(parseFloat(e.target.value));
    });

    // =========================================================================
    // MESH SHADOWS
    // =========================================================================

    const toggleMeshShadowsBtn = document.getElementById('toggle-mesh-shadows');
    toggleMeshShadowsBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleMeshShadows();
        e.target.innerText = active ? 'Mesh Shadows ON' : 'Mesh Shadows OFF';
        e.target.classList.toggle('toggle-active', active);
        e.target.classList.toggle('toggle-inactive', !active);
    });
    document.getElementById('slider-mesh-shadow-opacity')?.addEventListener('input', (e) => {
        viewer.setMeshShadowOpacity(parseFloat(e.target.value));
    });
    document.getElementById('picker-mesh-shadow-color')?.addEventListener('input', (e) => {
        viewer.setMeshShadowColor(e.target.value);
    });
    document.getElementById('slider-mesh-shadow-offset-x')?.addEventListener('input', (e) => {
        viewer.setMeshShadowOffsetX(parseFloat(e.target.value));
    });
    document.getElementById('slider-mesh-shadow-offset-z')?.addEventListener('input', (e) => {
        viewer.setMeshShadowOffsetZ(parseFloat(e.target.value));
    });

    // =========================================================================
    // HIGHLIGHT COMPOSITING BLUR / GLARE
    // =========================================================================

    const toggleHighlightBlurBtn = document.getElementById('toggle-highlight-blur');
    toggleHighlightBlurBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleHighlightBlur();
        e.target.innerText = active ? 'Glare Effect ON' : 'Glare Effect OFF';
        e.target.classList.toggle('toggle-active', active);
        e.target.classList.toggle('toggle-inactive', !active);
    });
    document.getElementById('slider-highlight-blur-intensity')?.addEventListener('input', (e) => {
        viewer.setHighlightBlurIntensity(parseFloat(e.target.value));
    });
    document.getElementById('slider-highlight-blur-threshold')?.addEventListener('input', (e) => {
        viewer.setHighlightBlurThreshold(parseFloat(e.target.value));
    });
    document.getElementById('slider-highlight-glare-size')?.addEventListener('input', (e) => {
        viewer.setHighlightGlareSize(parseFloat(e.target.value));
    });

    // =========================================================================
    // SKY SYSTEM
    // =========================================================================

    const toggleSkyOverrideBtn = document.getElementById('toggle-sky-override');
    toggleSkyOverrideBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleSkyboxOverride();
        e.target.innerText = active ? 'Sky Override ON' : 'Sky Override OFF';
        e.target.classList.toggle('toggle-active', active);
        e.target.classList.toggle('toggle-inactive', !active);
    });

    const toggleSkyNightBtn = document.getElementById('toggle-sky-night');
    toggleSkyNightBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleSkyNightMode();
        e.target.innerText = active ? 'Sky Night Mode ON' : 'Sky Night Mode OFF';
        e.target.classList.toggle('toggle-active', active);
        e.target.classList.toggle('toggle-inactive', !active);
    });

    document.getElementById('slider-sky-sun-orbit')?.addEventListener('input', (e) => {
        viewer.setSkySunOrbit(parseFloat(e.target.value));
    });
    document.getElementById('slider-sky-sun-altitude')?.addEventListener('input', (e) => {
        viewer.setSkySunAltitude(parseFloat(e.target.value));
    });
    document.getElementById('select-sky-moon-phase')?.addEventListener('change', (e) => {
        viewer.setSkyMoonPhase(e.target.value);
    });
    document.getElementById('slider-sky-exposure')?.addEventListener('input', (e) => {
        viewer.setSkyExposure(parseFloat(e.target.value));
    });
    document.getElementById('slider-sky-cloud-amount')?.addEventListener('input', (e) => {
        viewer.setSkyCloudAmount(parseFloat(e.target.value));
    });
    document.getElementById('picker-sky-cloud-color')?.addEventListener('input', (e) => {
        viewer.setSkyCloudColor(e.target.value);
    });

    // =========================================================================
    // STYLIZATION ENGINE
    // =========================================================================

    // OUTLINE
    const toggleOutlineBtn = document.getElementById('toggle-outline');
    toggleOutlineBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleOutline();
        e.target.innerText = active ? 'Outline ON' : 'Outline OFF';
        e.target.classList.toggle('active', active);
    });
    document.getElementById('slider-outline-weight')?.addEventListener('input', (e) => {
        viewer.setOutlineThickness(parseFloat(e.target.value));
    });

    // DYNAMIC FPS
    const toggleFpsBtn = document.getElementById('toggle-fps-limit');
    toggleFpsBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleFpsReducer();
        e.target.innerText = active ? 'Dynamic FPS ON' : 'Dynamic FPS OFF';
        e.target.classList.toggle('active', active);
    });

    // GLOW OVERLAY (canvas bloom)
    const toggleBloomBtn = document.getElementById('toggle-bloom');
    toggleBloomBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleBloomOverlay();
        e.target.innerText = active ? 'Glow Overlay ON' : 'Glow Overlay OFF';
        e.target.classList.toggle('active', active);
    });
    document.getElementById('slider-bloom-glow')?.addEventListener('input', (e) => {
        viewer.setBloomIntensity(parseFloat(e.target.value));
    });

    // CEL / ANIME FILTER
    const toggleAnimeFilterBtn = document.getElementById('toggle-anime-filter');
    toggleAnimeFilterBtn?.addEventListener('click', (e) => {
        const active = viewer.toggleCelFilter();
        e.target.innerText = active ? 'Cel Filter ON' : 'Cel Filter OFF';
        e.target.classList.toggle('active', active);
    });
    document.getElementById('slider-anime-steps')?.addEventListener('input', (e) => {
        viewer.setCelSteps(parseInt(e.target.value));
    });

    // =========================================================================
    // SCREEN RECORDING / PRESENTATION MODE
    // =========================================================================

    function showToast(msg) {
        if (!toast) return;
        if (toastTimeout) clearTimeout(toastTimeout);
        if (msg) toast.innerText = msg;
        toast.style.opacity = '1';
        toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
    }

    function enterRecordingMode() {
        document.body.classList.add('hide-for-recording');
        viewer.handleResize();
        if (recModal) recModal.style.display = 'flex';
        showToast('Press SPACE to play/pause · ESC to exit fullscreen');
    }

    function exitRecordingMode() {
        document.body.classList.remove('hide-for-recording');
        if (recModal) recModal.style.display = 'none';
        viewer.stopNativeRecording();
        viewer.handleResize();
    }

    btnFullscreenRecord?.addEventListener('click', () => {
        enterRecordingMode();
    });

    document.getElementById('mdl-btn-camera-toggle')?.addEventListener('click', () => {
        updateCamButtonUI(viewer.toggleCameraMode());
    });

    document.getElementById('mdl-btn-native-rec')?.addEventListener('click', (e) => {
        if (viewer.isRecordingNow) {
            viewer.stopNativeRecording();
            e.target.innerText = '2. Record with Built-in Website Recorder';
            e.target.style.background = '#0284c7';
        } else {
            const started = viewer.startNativeRecording();
            if (started) {
                e.target.innerText = 'STOP RECORDING & SAVE FILE';
                e.target.style.background = '#e11d48';
                if (recModal) recModal.style.display = 'none';
                showToast('Recording... Press button again to stop & save');
            }
        }
    });

    document.getElementById('mdl-btn-reset-only')?.addEventListener('click', () => {
        viewer.restartAnimation();
        viewer.togglePlayback(false);
        if (playPauseBtn) playPauseBtn.innerText = 'Play';
    });

    document.getElementById('mdl-btn-reset-play')?.addEventListener('click', () => {
        viewer.restartAnimation();
        viewer.togglePlayback(true);
        if (playPauseBtn) playPauseBtn.innerText = 'Pause';
        if (recModal) recModal.style.display = 'none';
    });

    document.getElementById('mdl-btn-close')?.addEventListener('click', () => {
        if (recModal) recModal.style.display = 'none';
    });

    // =========================================================================
    // KEYBOARD SHORTCUTS (Fullscreen Mode)
    // =========================================================================

    window.addEventListener('keydown', (e) => {
        const inFullscreen = document.body.classList.contains('hide-for-recording');
        if (!inFullscreen) return;

        if (e.code === 'Space') {
            e.preventDefault();
            const isPlaying = viewer.togglePlayback();
            if (playPauseBtn) playPauseBtn.innerText = isPlaying ? 'Pause' : 'Play';
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            exitRecordingMode();
        }
    });

    // =========================================================================
    // INIT
    // =========================================================================

    updateCamButtonUI(false);
    window.addEventListener('resize', () => viewer.handleResize());
});
