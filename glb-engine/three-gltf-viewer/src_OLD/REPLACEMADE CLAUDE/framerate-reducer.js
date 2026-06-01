/**
 * FrameRateReducer
 * Limits render updates to a dynamically varying low FPS target.
 * Uses a sine oscillation to shift between ~8 and ~15 fps for a hand-drawn feel.
 * Returns true on frames that should be rendered, false on frames to skip.
 */
export class FrameRateReducer {
    constructor() {
        this.isActive = false;
        this.sineTracker = 0;
        this.accumulator = 0;
        this.lastFrameDelta = 0;
    }

    toggle() {
        this.isActive = !this.isActive;
        this.accumulator = 0;
        return this.isActive;
    }

    /**
     * Call this every RAF tick with the real delta time.
     * Returns true if this frame should be rendered.
     */
    shouldRender(realDelta) {
        if (!this.isActive) return true;

        this.sineTracker += realDelta;

        // Target FPS oscillates between ~8 and ~15
        const targetFps = 11.5 + Math.sin(this.sineTracker * 0.8) * 3.5;
        const frameInterval = 1.0 / targetFps;

        this.accumulator += realDelta;

        if (this.accumulator >= frameInterval) {
            this.lastFrameDelta = this.accumulator;
            this.accumulator = 0;
            return true;
        }

        return false;
    }

    getLastDelta() {
        return this.lastFrameDelta;
    }
}
