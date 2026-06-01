import * as THREE from 'three';

/**
 * MeshShadowsSystem — Fake 2D Blob Shadows
 *
 * Strategy: for each mesh in the model, project its bounding box footprint
 * onto a flat ellipse at floor level. This avoids all skeleton/skinning clone
 * issues (which caused the blue glitch) and gives a clean anime-style shadow.
 *
 * Each proxy is a flat CircleGeometry scaled to match the mesh XZ extents,
 * updated every frame to track the source mesh world position.
 *
 * The "directional" look comes from the offset X/Z controls — shift the shadow
 * in the opposite direction of your specular light to sell the illusion.
 */
export class MeshShadowsSystem {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'MeshShadowProxies';
        this.scene.add(this.group);

        this.mappings = []; // { source: Mesh, proxy: Mesh, baseRadius: number }
        this.visible = false;
        this.group.visible = false;

        this.params = {
            opacity: 0.6,
            color: new THREE.Color('#111116'),
            offsetX: 0.0,
            offsetZ: 0.0
        };

        // Y position for the shadow floor — set externally when model loads
        this.floorY = 0.005;
    }

    setFloorY(y) {
        this.floorY = y + 0.005; // tiny lift to avoid z-fight
    }

    buildProxies(object) {
        this.clearProxies();

        // Collect all renderable meshes (skip outline proxies)
        const meshes = [];
        object.traverse((node) => {
            if (node.isMesh && !node.userData.isOutlineMesh) {
                meshes.push(node);
            }
        });

        meshes.forEach((node) => {
            // Compute the mesh's local bounding box to get XZ extents
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            const bb = node.geometry.boundingBox;
            const sizeX = (bb.max.x - bb.min.x);
            const sizeZ = (bb.max.z - bb.min.z);
            const baseRadius = Math.max(sizeX, sizeZ) * 0.5;

            // Circular blob shadow — 32 segments is smooth enough
            const geo = new THREE.CircleGeometry(1.0, 32);
            const mat = new THREE.MeshBasicMaterial({
                color: this.params.color.clone(),
                transparent: true,
                opacity: this.params.opacity,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const proxy = new THREE.Mesh(geo, mat);
            proxy.rotation.x = -Math.PI / 2; // lay flat
            proxy.receiveShadow = false;
            proxy.castShadow = false;
            proxy.frustumCulled = false;
            proxy.name = 'blobshadow_' + (node.name || 'mesh');

            this.group.add(proxy);
            this.mappings.push({ source: node, proxy, baseRadius });
        });

        this.group.visible = this.visible;
    }

    clearProxies() {
        this.mappings.forEach(({ proxy }) => {
            proxy.geometry.dispose();
            proxy.material.dispose();
            this.group.remove(proxy);
        });
        this.mappings = [];

        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
    }

    update() {
        if (!this.visible || this.mappings.length === 0) return;

        const worldPos  = new THREE.Vector3();
        const worldScale = new THREE.Vector3();
        const _quat     = new THREE.Quaternion();

        for (const { source, proxy, baseRadius } of this.mappings) {
            if (!source || !source.parent) continue;

            source.updateWorldMatrix(true, false);
            source.matrixWorld.decompose(worldPos, _quat, worldScale);

            // Place flat on the floor
            proxy.position.set(
                worldPos.x + this.params.offsetX,
                this.floorY,
                worldPos.z + this.params.offsetZ
            );

            // Scale to world-space extents of the mesh
            const rx = baseRadius * Math.abs(worldScale.x);
            const rz = baseRadius * Math.abs(worldScale.z);
            proxy.scale.set(rx, rz, 1.0); // CircleGeometry lies in XY, rotation.x flips it to XZ
        }
    }

    setVisible(visible) {
        this.visible = visible;
        this.group.visible = visible;
    }

    setOpacity(val) {
        this.params.opacity = val;
        this.mappings.forEach(({ proxy }) => {
            proxy.material.opacity = val;
        });
    }

    setColor(hex) {
        this.params.color.set(hex);
        this.mappings.forEach(({ proxy }) => {
            proxy.material.color.set(hex);
        });
    }

    setOffsetX(val) { this.params.offsetX = val; }
    setOffsetZ(val) { this.params.offsetZ = val; }
}
