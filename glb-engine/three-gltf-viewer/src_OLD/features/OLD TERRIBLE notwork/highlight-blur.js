export class HighlightBlurSystem {
    constructor(bloomPass) {
        this.bloomPass = bloomPass;
        this.active = false;
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        this.bloomPass.strength = this.active ? 1.2 : 0.0;
        return this.active;
    }

    setIntensity(val) { if (this.active) this.bloomPass.strength = val; }
    setThreshold(val) { this.bloomPass.threshold = val; }
    setGlareSize(val) { this.bloomPass.radius = Math.min(val * 0.12, 1.2); }
}