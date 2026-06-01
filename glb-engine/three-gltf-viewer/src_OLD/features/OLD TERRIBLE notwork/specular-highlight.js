export class SpecularHighlightSystem {
    constructor() {
        this.active = false;
        this.params = {
            sunOrbitDegrees: 45,
            sunAltitudeDegrees: 45,
            shadowDarkening: 0.3,
            specularIntensity: 1.0
        };
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        return this.active;
    }
}