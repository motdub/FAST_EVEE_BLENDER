import * as THREE from 'three';

/**
 * SpecularHighlightSystem
 *
 * Key fixes:
 * 1. patchMaterialsForSpecular() forces roughness=0.15, metalness=0.4 on all
 *    mesh materials so the directional light actually produces visible specular.
 *    GLTF models export with roughness=1.0 by default which kills specular.
 * 2. rimLight shines from OPPOSITE direction — lights the face opposite the shadow.
 * 3. Both lights start at 0 intensity and are activated on toggle.
 */
export class SpecularHighlightSystem {
    constructor(scene) {
        this.scene  = scene;
        this.active = false;

        this.params = {
            sunOrbitDegrees:    45,
            sunAltitudeDegrees: 60,
            shadowDarkening:    0.3,
            specularIntensity:  2.5,
            rimIntensity:       2.0,
            sunColor:           '#fff4e0',
        };

        this._modelCenter = new THREE.Vector3(0, 1, 0);
        this._patchedMaterials = []; // { mat, origRoughness, origMetalness }

        // Key/sun directional light
        this.specularLight = new THREE.DirectionalLight(0xfff4e0, 0.0);
        this.specularLight.castShadow = false;
        this.scene.add(this.specularLight);
        this.scene.add(this.specularLight.target);

        // Rim light — opposite side of key light
        this.rimLight = new THREE.DirectionalLight(0xfff8f0, 0.0);
        this.rimLight.castShadow = false;
        this.scene.add(this.rimLight);
        this.scene.add(this.rimLight.target);

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

    /**
     * Force all mesh materials to have low roughness so specular is visible.
     * Stores originals so we can restore on toggle-off.
     */
    patchMaterialsForSpecular(model) {
        this.restoreMaterials();
        if (!model) return;
        model.traverse((node) => {
            if (!node.isMesh) return;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach(mat => {
                if (!mat) return;
                // Store originals
                this._patchedMaterials.push({
                    mat,
                    origRoughness: mat.roughness,
                    origMetalness: mat.metalness,
                });
                // Force shiny — these values produce visible specular highlights
                if (mat.roughness !== undefined) mat.roughness = 0.15;
                if (mat.metalness !== undefined) mat.metalness = 0.4;
                mat.needsUpdate = true;
            });
        });
    }

    restoreMaterials() {
        this._patchedMaterials.forEach(({ mat, origRoughness, origMetalness }) => {
            if (mat.roughness !== undefined) mat.roughness = origRoughness;
            if (mat.metalness !== undefined) mat.metalness = origMetalness;
            mat.needsUpdate = true;
        });
        this._patchedMaterials = [];
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

        const x = this._modelCenter.x + Math.cos(altitudeRad) * Math.cos(orbitRad) * dist;
        const y = this._modelCenter.y + Math.sin(altitudeRad) * dist;
        const z = this._modelCenter.z + Math.cos(altitudeRad) * Math.sin(orbitRad) * dist;
        this.specularLight.position.set(x, y, z);

        // Rim light exactly opposite, slightly lower altitude
        const rimAlt = THREE.MathUtils.degToRad(Math.max(5, this.params.sunAltitudeDegrees - 20));
        const rx = this._modelCenter.x - Math.cos(rimAlt) * Math.cos(orbitRad) * dist;
        const ry = this._modelCenter.y + Math.sin(rimAlt) * dist * 0.5;
        const rz = this._modelCenter.z - Math.cos(rimAlt) * Math.sin(orbitRad) * dist;
        this.rimLight.position.set(rx, ry, rz);
    }

    setSunOrbit(degrees)    { this.params.sunOrbitDegrees = degrees;    this._updateLightPosition(); }
    setSunAltitude(degrees) { this.params.sunAltitudeDegrees = degrees; this._updateLightPosition(); }
    setShadowDarkening(val) { this.params.shadowDarkening = val; }

    setSpecularIntensity(val) {
        this.params.specularIntensity = val;
        if (this.active) this.specularLight.intensity = val;
    }

    setRimIntensity(val) {
        this.params.rimIntensity = val;
        if (this.active) this.rimLight.intensity = val;
    }

    setSunColor(hexString) {
        this.params.sunColor = hexString;
        this.specularLight.color.set(hexString);
        this.rimLight.color.set(hexString);
    }

    dispose() {
        this.restoreMaterials();
        this.scene.remove(this.specularLight);
        this.scene.remove(this.specularLight.target);
        this.scene.remove(this.rimLight);
        this.scene.remove(this.rimLight.target);
    }
}
