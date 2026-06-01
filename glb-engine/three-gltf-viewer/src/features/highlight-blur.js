/**
 * HighlightBlurSystem — Glare / Bloom via UnrealBloomPass
 *
 * Fixes vs previous version:
 * - Default intensity lowered from 1.2 → 0.35 (was way too strong at default)
 * - Default threshold raised to 0.85 (only very bright pixels bloom)
 * - setGlareSize uses square-root mapping so small slider moves don't explode
 * - radius capped at 0.6 (was 1.2, which caused full-screen haze)
 */
export class HighlightBlurSystem {
    constructor(bloomPass) {
        this.bloomPass = bloomPass;
        this.active = false;

        this._intensity  = 0.35;  // much gentler default
        this._threshold  = 0.85;  // only specular highlights bloom
        this._glareSize  = 2.0;   // slider value (0.5–10)

        // Initialize pass to sane off-state defaults
        this.bloomPass.strength  = 0.0;
        this.bloomPass.threshold = this._threshold;
        this.bloomPass.radius    = this._sizeToRadius(this._glareSize);
    }

    // Map slider value (0.5–10) → radius (0.05–0.55) with sqrt curve
    // so early slider movement is gentle and later movement is coarser
    _sizeToRadius(val) {
        return Math.min(Math.sqrt(val / 10.0) * 0.55, 0.55);
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
        this.bloomPass.radius = this._sizeToRadius(val);
    }
}
