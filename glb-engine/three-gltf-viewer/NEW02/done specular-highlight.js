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
            specularIntensity:  1.5,
            rimIntensity:       2.0,   // exaggerated lit-side rim, controlled by its own slider
            sunColor:           0xfff4e0,
        };

        this._modelCenter = new THREE.Vector3(0, 1, 0);

        // Warm directional specular light (key/sun light)
        this.specularLight = new THREE.DirectionalLight(this.params.sunColor, 0.0);
        this.specularLight.castShadow = false;
        this.scene.add(this.specularLight);
        this.scene.add(this.specularLight.target);
        this.specularLight.target.position.set(0, 1, 0);

        // Rim/exaggerated lit-side light — shines from the OPPOSITE direction of the shadow.
        // When Mesh Shadows places the shadow one side, this rim light blasts the other side.
        this.rimLight = new THREE.DirectionalLight(0xfff8f0, 0.0);
        this.rimLight.castShadow = false;
        this.scene.add(this.rimLight);
        this.scene.add(this.rimLight.target);
        this.rimLight.target.position.set(0, 1, 0);

        this._updateLightPosition();
    }

    setModelCenter(center) {
        this._modelCenter.copy(center);
        this.specularLight.target.position.copy(center);
        this.specularLight.target.updateMatrixWorld();
        this.rimLight.target.position.copy(center);
        this.rimLight.target.updateMatrixWorld();
        this._updateLightPosition();
    }

    toggle(forceState) {
        this.active = (forceState !== undefined) ? forceState : !this.active;
        this.specularLight.intensity = this.active ? this.params.specularIntensity : 0.0;
        this.rimLight.intensity      = this.active ? this.params.rimIntensity      : 0.0;
        return this.active;
    }

    _updateLightPosition() {
        const orbitRad    = THREE.MathUtils.degToRad(this.params.sunOrbitDegrees);
        const altitudeRad = THREE.MathUtils.degToRad(this.params.sunAltitudeDegrees);
        const dist = 30;

        // Key light — from sun direction
        const x = this._modelCenter.x + Math.cos(altitudeRad) * Math.cos(orbitRad) * dist;
        const y = this._modelCenter.y + Math.sin(altitudeRad) * dist;
        const z = this._modelCenter.z + Math.cos(altitudeRad) * Math.sin(orbitRad) * dist;
        this.specularLight.position.set(x, y, z);

        // Rim light — exactly opposite direction (behind model relative to key light)
        // Also slightly lower altitude so it hits the lit side of upright characters
        const rimAlt = THREE.MathUtils.degToRad(Math.max(5, this.params.sunAltitudeDegrees - 20));
        const rx = this._modelCenter.x - Math.cos(rimAlt) * Math.cos(orbitRad) * dist;
        const ry = this._modelCenter.y + Math.sin(rimAlt) * dist * 0.5;
        const rz = this._modelCenter.z - Math.cos(rimAlt) * Math.sin(orbitRad) * dist;
        this.rimLight.position.set(rx, ry, rz);
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

    /** Lit-side rim exaggeration intensity — separate slider */
    setRimIntensity(val) {
        this.params.rimIntensity = val;
        if (this.active) this.rimLight.intensity = val;
    }

    setSunColor(hexString) {
        this.params.sunColor = hexString;
        this.specularLight.color.set(hexString);
        // Tint the rim light similarly but slightly cooler
        this.rimLight.color.set(hexString);
    }

    dispose() {
        this.scene.remove(this.specularLight);
        this.scene.remove(this.specularLight.target);
        this.scene.remove(this.rimLight);
        this.scene.remove(this.rimLight.target);
    }
}
