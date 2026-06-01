/**
 * BloomFeature (Canvas Overlay Glow)
 * Creates a glow effect by drawing a blurred copy of the renderer canvas
 * on top using a 2D canvas with screen blend mode.
 * This is separate from the UnrealBloomPass (which is the Glare system).
 */
export class BloomFeature {
    constructor(viewerCanvas, container) {
        this.viewerCanvas = viewerCanvas;
        this.container = container;
        this.isActive = false;
        this.intensity = 1.0;

        this.overlayCanvas = document.createElement('canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        this._setupStyle();
        this.resize();
    }

    _setupStyle() {
        const s = this.overlayCanvas.style;
        s.position = 'absolute';
        s.top = '0';
        s.left = '0';
        s.width = '100%';
        s.height = '100%';
        s.pointerEvents = 'none';
        s.mixBlendMode = 'screen';
        s.display = 'none';
        s.zIndex = '5';

        this.container.appendChild(this.overlayCanvas);
    }

    toggle() {
        this.isActive = !this.isActive;
        this.overlayCanvas.style.display = this.isActive ? 'block' : 'none';
        return this.isActive;
    }

    setIntensity(val) {
        this.intensity = val;
        this.overlayCanvas.style.opacity = Math.min(val / 3.0, 1.0).toString();
    }

    resize() {
        this.overlayCanvas.width = this.viewerCanvas.clientWidth || this.container.clientWidth;
        this.overlayCanvas.height = this.viewerCanvas.clientHeight || this.container.clientHeight;
    }

    render() {
        if (!this.isActive) return;

        const ctx = this.overlayCtx;
        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;

        if (w === 0 || h === 0) return;

        ctx.clearRect(0, 0, w, h);

        // Draw the renderer output
        try {
            ctx.drawImage(this.viewerCanvas, 0, 0, w, h);
        } catch (e) {
            return; // Canvas may not be ready
        }

        // Apply a radial-weighted blur for glow
        const blurPx = Math.max(4, Math.round(18 * this.intensity));
        ctx.filter = `blur(${blurPx}px) brightness(${120 + this.intensity * 30}%)`;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.overlayCanvas, 0, 0, w, h);

        // Reset filter
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        if (this.overlayCanvas.parentNode) {
            this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
        }
    }
}
