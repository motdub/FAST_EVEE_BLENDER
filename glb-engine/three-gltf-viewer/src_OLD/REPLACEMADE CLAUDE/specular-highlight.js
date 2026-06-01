import * as THREE from 'three';

/**
 * SpecularHighlightSystem
 * Adds a secondary directional light that can be orbited around the scene.
 * The light position is driven by sunOrbitDegrees and sunAltitudeDegrees.
 * shadowDarkening controls ambient intensity (lower = darker shadows).
 * specularIntensity controls the specular light brightness.
 */
export class SpecularHighlightSystem {
    constructor(scene) {
        this.scene = scene;
        this.active = false;

        this.params = {
            sunOrbitDegrees: 45,
            sunAltitudeDegrees: 45,
            shadowDarkening: 0.3,
            specularIntensity: 1.0
        };

        // Secondary specular directional light
        this.specularLight = new THREE.DirectionalLight(0xfff4e0, 0.0);
        this.specularLight.castShadow = false;
        this.scene.add(this.specularLight);

        // Helper to visualize light direction (hidden by default)
        this.lightHelper = new THREE.DirectionalLightHelper(this.specularLight, 1, 0xf59e0b);
        this.lightHelper.visible = false;
        this.scene.add(this.lightHelper);

        this._updateLightPosition();
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        this.specularLight.intensity = this.active ? this.params.specularIntensity : 0.0;
        return this.active;
    }

    _updateLightPosition() {
        const orbitRad = THREE.MathUtils.degToRad(this.params.sunOrbitDegrees);
        const altitudeRad = THREE.MathUtils.degToRad(this.params.sunAltitudeDegrees);

        const x = Math.cos(altitudeRad) * Math.cos(orbitRad) * 20;
        const y = Math.sin(altitudeRad) * 20;
        const z = Math.cos(altitudeRad) * Math.sin(orbitRad) * 20;

        this.specularLight.position.set(x, y, z);

        if (this.lightHelper) {
            this.lightHelper.update();
        }
    }

    setSunOrbit(degrees) {
        this.params.sunOrbitDegrees = degrees;
        this._updateLightPosition();
    }

    setSunAltitude(degrees) {
        this.params.sunAltitudeDegrees = degrees;
        this._updateLightPosition();
    }

    setShadowDarkening(val) {
        this.params.shadowDarkening = val;
        // Exposed to viewer to drive ambient light intensity
    }

    setSpecularIntensity(val) {
        this.params.specularIntensity = val;
        if (this.active) {
            this.specularLight.intensity = val;
        }
    }

    dispose() {
        this.scene.remove(this.specularLight);
        this.scene.remove(this.lightHelper);
    }
}
