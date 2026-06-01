/**
 * HighlightBlurSystem
 * Wraps Three.js UnrealBloomPass to provide a controllable glare/bloom effect.
 * The bloom pass is always present in the composer pipeline but strength=0 when inactive.
 */
export class HighlightBlurSystem {
    constructor(bloomPass) {
        this.bloomPass = bloomPass;
        this.active = false;

        // Store user-set values separately so we can restore them on toggle
        this._intensity = 1.2;
        this._threshold = 0.75;
        this._glareSize = 3.0;

        // Start disabled
        this.bloomPass.strength = 0.0;
        this.bloomPass.threshold = this._threshold;
        this.bloomPass.radius = this._glareSize * 0.12;
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        this.bloomPass.strength = this.active ? this._intensity : 0.0;
        return this.active;
    }

    setIntensity(val) {
        this._intensity = val;
        if (this.active) {
            this.bloomPass.strength = val;
        }
    }

    setThreshold(val) {
        this._threshold = val;
        this.bloomPass.threshold = val;
    }

    setGlareSize(val) {
        this._glareSize = val;
        this.bloomPass.radius = Math.min(val * 0.12, 1.2);
    }
}
