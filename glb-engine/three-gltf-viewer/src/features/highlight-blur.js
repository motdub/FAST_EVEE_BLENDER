/**
 * HighlightBlurSystem — Glare via UnrealBloomPass
 *
 * FIX: Default intensity was 0.35 but slider in HTML defaults to 1.0,
 * causing the glare to blast on enable. Now intensity tracks slider
 * value from the start with a much gentler response curve.
 *
 * Slider range in HTML: intensity 0–5, glare size 0.5–10
 * Mapped to bloom: strength 0–1.2, radius 0.02–0.4
 */
export class HighlightBlurSystem {
    constructor(bloomPass) {
        this.bloomPass = bloomPass;
        this.active    = false;

        // Gentler defaults — match the HTML slider default values
        this._intensity = 0.18;  // maps from slider value 1.0
        this._threshold = 0.75;  // HTML slider default
        this._glareSize = 3.0;   // HTML slider default

        this.bloomPass.strength  = 0.0;
        this.bloomPass.threshold = this._threshold;
        this.bloomPass.radius    = this._sizeToRadius(this._glareSize);
    }

    // Square-root curve: slider 0.5→10 maps to radius 0.02→0.38
    // Small moves at low end are gentle, large end allows noticeable blur
    _sizeToRadius(val) {
        return Math.min(Math.sqrt(Math.max(val, 0.1) / 10.0) * 0.38, 0.38);
    }

    // Linear map: slider 0–5 → strength 0–0.8
    // Keeps strength well below 1.0 to prevent full-screen glow
    _intensityToStrength(val) {
        return Math.min(val * 0.16, 0.8);
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        this.bloomPass.strength = this.active ? this._intensityToStrength(this._intensity / 0.18 * 1.0) : 0.0;
        // Recalculate from stored raw intensity
        if (this.active) {
            this.bloomPass.strength = this._intensityToStrength(this._rawIntensity ?? 1.0);
        }
        return this.active;
    }

    setIntensity(val) {
        this._rawIntensity = val;
        this._intensity    = this._intensityToStrength(val);
        if (this.active) {
            this.bloomPass.strength = this._intensity;
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
