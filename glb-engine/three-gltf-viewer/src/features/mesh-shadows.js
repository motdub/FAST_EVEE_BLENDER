import * as THREE from 'three';

/**
 * MeshShadowsSystem — Real shadow-traced flat shadows
 *
 * PREVIOUS APPROACH WAS WRONG:
 *   - CircleGeometry blob proxies give fake round blobs, not real mesh silhouettes
 *   - Blue glitch was caused by the blob proxies rendering INSIDE the skinned mesh
 *     because their Y position matched the mesh origin, not the floor
 *
 * NEW APPROACH — Two-layer system:
 *   1. A dedicated shadow-only directional light (castShadow=true, no illumination)
 *      positioned opposite the specular light — this casts REAL shadows onto the ground
 *   2. The ground ShadowMaterial plane (already in viewer.js) receives these shadows
 *   3. "Shadow darkening" on the model side = the ambient light dimming that viewer.js
 *      already does when specular is active — simulates the dark side
 *
 * The "offset X/Z" sliders now control the shadow light direction (which changes
 * where the shadow falls on the ground), matching what users expect.
 *
 * The opacity slider controls the ShadowMaterial plane's opacity.
 * The color slider tints the shadow plane material.
 */
export class MeshShadowsSystem {
    constructor(scene) {
        this.scene   = scene;
        this.visible = false;

        this.params = {
            opacity:  0.55,
            color:    new THREE.Color(0x111116),
            offsetX:  0.0,
            offsetZ:  0.0,
        };

        // Dedicated shadow-casting light (no color contribution — intensity 0 for color,
        // but castShadow=true still works to produce a shadow map)
        // We use a very low white light so shadows appear but no extra illumination adds up
        this.shadowLight = new THREE.DirectionalLight(0xffffff, 0.0);
        this.shadowLight.castShadow = true;
        this.shadowLight.shadow.mapSize.width  = 2048;
        this.shadowLight.shadow.mapSize.height = 2048;
        this.shadowLight.shadow.camera.near   = 0.1;
        this.shadowLight.shadow.camera.far    = 200;
        const d = 25;
        this.shadowLight.shadow.camera.left   = -d;
        this.shadowLight.shadow.camera.right  =  d;
        this.shadowLight.shadow.camera.top    =  d;
        this.shadowLight.shadow.camera.bottom = -d;
        this.shadowLight.shadow.bias          = -0.001;
        this.shadowLight.shadow.normalBias    =  0.02;
        this.shadowLight.position.set(8, 20, 8);
        this.scene.add(this.shadowLight);
        this.scene.add(this.shadowLight.target);
        this.shadowLight.target.position.set(0, 0, 0);

        // Flat shadow receiver plane — positioned at floor level by viewer.js
        this.shadowPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 200),
            new THREE.ShadowMaterial({
                opacity:     this.params.opacity,
                transparent: true,
                depthWrite:  false,
            })
        );
        this.shadowPlane.rotation.x  = -Math.PI / 2;
        this.shadowPlane.position.y  = 0;
        this.shadowPlane.receiveShadow = true;
        this.shadowPlane.visible     = false;
        this.shadowPlane.renderOrder = 0;
        this.scene.add(this.shadowPlane);

        this._modelCenter = new THREE.Vector3(0, 0, 0);
    }

    /** Called by viewer after model loads, sets floor level and aim point */
    setFloorY(y) {
        this.shadowPlane.position.y = y + 0.003; // tiny lift to avoid z-fighting
        this._updateLightPosition();
    }

    setModelCenter(center) {
        this._modelCenter.copy(center);
        this.shadowLight.target.position.copy(center);
        this.shadowLight.target.updateMatrixWorld();
        this._updateLightPosition();
    }

    _updateLightPosition() {
        // Position shadow light based on offset sliders
        // offsetX/Z act as the shadow direction (negative = shadow goes that way)
        const baseHeight = 20;
        const x = this._modelCenter.x - this.params.offsetX * 2;
        const z = this._modelCenter.z - this.params.offsetZ * 2;
        this.shadowLight.position.set(
            this._modelCenter.x + (x - this._modelCenter.x) + 8,
            this._modelCenter.y + baseHeight,
            this._modelCenter.z + (z - this._modelCenter.z) + 8
        );
    }

    /** Enable all meshes in the model to cast shadows */
    buildProxies(model) {
        if (!model) return;
        model.traverse((node) => {
            if (node.isMesh && !node.userData.isOutlineMesh) {
                node.castShadow    = true;
                node.receiveShadow = true;
            }
        });
    }

    clearProxies() {
        // Nothing to clear — shadows are driven by the model's own castShadow flag
    }

    setVisible(visible) {
        this.visible = visible;
        this.shadowPlane.visible     = visible;
        // Enable/disable the shadow light rendering
        this.shadowLight.castShadow  = visible;
        if (visible) {
            this._updateLightPosition();
        }
    }

    setOpacity(val) {
        this.params.opacity = val;
        this.shadowPlane.material.opacity = val;
    }

    setColor(hex) {
        this.params.color.set(hex);
        // ShadowMaterial doesn't support color tint directly —
        // approximate by adjusting opacity and a color overlay
        // The darkest shadow color is approximated through opacity
        const luminance = this.params.color.r * 0.299 + this.params.color.g * 0.587 + this.params.color.b * 0.114;
        // Darker color requested → higher opacity shadow
        this.shadowPlane.material.opacity = this.params.opacity * (1.0 - luminance * 0.5);
    }

    setOffsetX(val) {
        this.params.offsetX = val;
        this._updateLightPosition();
    }

    setOffsetZ(val) {
        this.params.offsetZ = val;
        this._updateLightPosition();
    }

    // Called every frame — no-op since Three.js handles shadow updates
    update() {}

    dispose() {
        this.scene.remove(this.shadowLight);
        this.scene.remove(this.shadowLight.target);
        this.scene.remove(this.shadowPlane);
        this.shadowPlane.geometry.dispose();
        this.shadowPlane.material.dispose();
    }
}
