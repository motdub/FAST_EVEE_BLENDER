export class FrameRateReducer {
    constructor(viewer) {
        this.viewer = viewer;
        this.isActive = true;
        this.timeAccumulator = 0;
        this.lastStepDelta = 0;
        this.sineTracker = 0;
    }

    toggle() {
        this.isActive = !this.isActive;
        return this.isActive;
    }

    tick() {
        if (!this.isActive) return true;

        // Progress variable frequency sine calculations map
        this.sineTracker += 0.01;
        
        // Dynamically shift target frame rates over time boundaries
        const dynamicFpsTarget = 11.5 + Math.sin(this.sineTracker) * 3.5; 
        const frameIntervalThreshold = 1.0 / dynamicFpsTarget;

        const systemDelta = this.viewer.clock.getDelta();
        this.timeAccumulator += systemDelta;

        if (this.timeAccumulator >= frameIntervalThreshold) {
            this.lastStepDelta = this.timeAccumulator;
            this.timeAccumulator = 0;
            return true; // Unlocks animation step updates on this render tick
        }

        return false;
    }

    getStepDelta() {
        return this.lastStepDelta;
    }
}