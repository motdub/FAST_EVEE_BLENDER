import * as THREE from 'three';

/**
 * SpecularHighlightSystem
 *
 * Fixes vs previous version:
 * - Light now has an explicit target that gets added to the scene and updated
 *   (without this, DirectionalLight defaults to targeting world origin = ground)
 * - target is aimed at model center, updated via setModelCenter()
 * - Removed lightHelper (was visual noise)
 */
export class SpecularHighlightSystem {
    constructor(scene) {
        this.scene = scene;
        this.active = false;

        this.params = {
            sunOrbitDegrees:   45,
            sunAltitudeDegrees: 60,
            shadowDarkening:   0.3,
            specularIntensity: 1.5
        };

        this._modelCenter = new THREE.Vector3(0, 1, 0);

        // Secondary specular directional light (warm sunlight tone)
        this.specularLight = new THREE.DirectionalLight(0xfff4e0, 0.0);
        this.specularLight.castShadow = false;
        this.scene.add(this.specularLight);

        // Target MUST be added to scene for directional light to track it
        this.scene.add(this.specularLight.target);

        this._updateLightPosition();
    }

    /** Call this after model loads so the light aims at the model, not the floor */
    setModelCenter(center) {
        this._modelCenter.copy(center);
        this.specularLight.target.position.copy(center);
        this.specularLight.target.updateMatrixWorld();
        this._updateLightPosition();
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        this.specularLight.intensity = this.active ? this.params.specularIntensity : 0.0;
        return this.active;
    }

    _updateLightPosition() {
        const orbitRad   = THREE.MathUtils.degToRad(this.params.sunOrbitDegrees);
        const altitudeRad = THREE.MathUtils.degToRad(this.params.sunAltitudeDegrees);

        const dist = 30;
        const x = this._modelCenter.x + Math.cos(altitudeRad) * Math.cos(orbitRad) * dist;
        const y = this._modelCenter.y + Math.sin(altitudeRad) * dist;
        const z = this._modelCenter.z + Math.cos(altitudeRad) * Math.sin(orbitRad) * dist;

        this.specularLight.position.set(x, y, z);
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
    }

    setSpecularIntensity(val) {
        this.params.specularIntensity = val;
        if (this.active) {
            this.specularLight.intensity = val;
        }
    }

    dispose() {
        this.scene.remove(this.specularLight);
        this.scene.remove(this.specularLight.target);
    }
}
