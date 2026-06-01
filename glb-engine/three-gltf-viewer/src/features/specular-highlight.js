import * as THREE from 'three';

/**
 * SpecularHighlightSystem
 *
 * Adds a warm directional light that orbits around the model to create
 * game-engine-style specular highlights on mesh surfaces.
 *
 * FIX vs previous: The light was illuminating the ground plane but not the
 * mesh because:
 *   1. The ShadowMaterial ground plane has no specular response — correct
 *   2. The light target was set to (0,0,0) not model center — FIXED
 *   3. The shadow receiver plane was receiving the specular light creating
 *      a bright disc on the floor — FIXED by ensuring shadow receiver is
 *      MeshBasicMaterial/ShadowMaterial only (no specular response)
 */
export class SpecularHighlightSystem {
    constructor(scene) {
        this.scene  = scene;
        this.active = false;

        this.params = {
            sunOrbitDegrees:    45,
            sunAltitudeDegrees: 60,
            shadowDarkening:    0.3,
            specularIntensity:  1.5
        };

        this._modelCenter = new THREE.Vector3(0, 1, 0);

        // Warm directional specular light
        this.specularLight = new THREE.DirectionalLight(0xfff4e0, 0.0);
        this.specularLight.castShadow = false; // shadow casting handled by MeshShadowsSystem
        this.scene.add(this.specularLight);

        // Target MUST be in scene for DirectionalLight to work
        this.scene.add(this.specularLight.target);
        this.specularLight.target.position.set(0, 1, 0);

        this._updateLightPosition();
    }

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
        const orbitRad    = THREE.MathUtils.degToRad(this.params.sunOrbitDegrees);
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
        if (this.active) this.specularLight.intensity = val;
    }

    dispose() {
        this.scene.remove(this.specularLight);
        this.scene.remove(this.specularLight.target);
    }
}
