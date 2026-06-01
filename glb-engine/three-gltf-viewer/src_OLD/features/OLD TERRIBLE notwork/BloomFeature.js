export class BloomFeature {
    constructor(viewer) {
        this.viewer = viewer;
        this.isActive = true;
        this.intensity = 1.0;
        
        // Initialize an integrated canvas overlay system matrix element
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        
        this.setupOverlayStyle();
    }

    setupOverlayStyle() {
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.width = '100%';
        this.overlayCanvas.style.height = '100%';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCanvas.style.mixBlendMode = 'screen';
        this.overlayCanvas.style.display = 'block';
        
        this.viewer.container.appendChild(this.overlayCanvas);
        this.resize();
    }

    toggle() {
        this.isActive = !this.isActive;
        this.overlayCanvas.style.display = this.isActive ? 'block' : 'none';
        return this.isActive;
    }

    setIntensity(val) {
        this.intensity = val;
        this.overlayCanvas.style.opacity = Math.min(val, 1.0);
    }

    resize() {
        this.overlayCanvas.width = this.viewer.canvas.clientWidth;
        this.overlayCanvas.height = this.viewer.canvas.clientHeight;
    }

    render(activeCamera) {
        // Step 1: Fire baseline rendering paths straight onto standard canvas output buffer nodes
        this.viewer.renderer.render(this.viewer.scene, activeCamera);

        if (!this.isActive) return;

        // Step 2: Sample and mirror the rendered output to create the bloom pass
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.overlayCtx.drawImage(this.viewer.canvas, 0, 0);

        // Step 3: Apply the high-speed blur filter matrix overlay
        const blurRadius = Math.max(Math.round(12 * this.intensity), 2);
        this.overlayCtx.filter = `blur(${blurRadius}px) brightness(${130 + (this.intensity * 20)}%)`;
        this.overlayCtx.globalCompositeOperation = 'source-over';
        
        // Re-draw context onto itself to flatten pixel operations out completely
        this.overlayCtx.drawImage(this.overlayCanvas, 0, 0);
    }
}