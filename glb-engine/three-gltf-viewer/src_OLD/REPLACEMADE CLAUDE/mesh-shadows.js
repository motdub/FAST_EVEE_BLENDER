import * as THREE from 'three';

/**
 * MeshShadowsSystem
 * Creates flat "blob shadow" proxy meshes that follow each mesh in the loaded model.
 * Proxies are squashed to Y=0 (floor plane) and rendered with a dark semi-transparent material.
 * Works with both static and skinned/animated meshes.
 */
export class MeshShadowsSystem {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'MeshShadowProxies';
        this.scene.add(this.group);
        this.mappings = [];
        this.visible = false;
        this.group.visible = false;

        this.params = {
            opacity: 0.6,
            color: new THREE.Color('#111116'),
            offsetX: 0.0,
            offsetZ: 0.0
        };
    }

    buildProxies(object, mixer) {
        this.clearProxies();

        object.traverse((node) => {
            if (!node.isMesh) return;

            const shadowMat = new THREE.MeshBasicMaterial({
                color: this.params.color.clone(),
                transparent: true,
                opacity: this.params.opacity,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            let shadowProxy;

            if (node.isSkinnedMesh) {
                // Clone geometry so we can manipulate it independently
                const clonedGeo = node.geometry.clone();
                const clonedMat = shadowMat.clone();
                clonedMat.skinning = true;

                shadowProxy = new THREE.SkinnedMesh(clonedGeo, clonedMat);

                // Must copy skeleton reference properly
                shadowProxy.skeleton = node.skeleton;
                shadowProxy.bindMatrix = node.bindMatrix.clone();
                shadowProxy.bindMatrixInverse = node.bindMatrixInverse.clone();
                shadowProxy.bind(node.skeleton, node.bindMatrix);

                // Copy morph targets if present
                if (node.morphTargetInfluences) {
                    shadowProxy.morphTargetInfluences = [...node.morphTargetInfluences];
                    shadowProxy.morphTargetDictionary = node.morphTargetDictionary;
                }
            } else {
                shadowProxy = new THREE.Mesh(node.geometry, shadowMat);
            }

            shadowProxy.castShadow = false;
            shadowProxy.receiveShadow = false;
            shadowProxy.frustumCulled = false;
            shadowProxy.name = 'shadow_proxy_' + (node.name || 'mesh');

            this.group.add(shadowProxy);

            this.mappings.push({
                source: node,
                proxy: shadowProxy,
                isSkinned: node.isSkinnedMesh
            });
        });

        this.group.visible = this.visible;
    }

    clearProxies() {
        this.mappings.forEach(({ proxy }) => {
            if (proxy.geometry && proxy.geometry !== proxy.geometry) {
                proxy.geometry.dispose();
            }
            if (Array.isArray(proxy.material)) {
                proxy.material.forEach(m => m.dispose());
            } else if (proxy.material) {
                proxy.material.dispose();
            }
            this.group.remove(proxy);
        });
        this.mappings = [];

        // Ensure group is fully cleared
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
    }

    update() {
        if (!this.visible || this.mappings.length === 0) return;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();

        for (let i = 0; i < this.mappings.length; i++) {
            const { source, proxy, isSkinned } = this.mappings[i];

            if (!source || !source.parent) continue;

            // Decompose the source world matrix to get accurate world transform
            source.updateWorldMatrix(true, false);
            source.matrixWorld.decompose(worldPos, worldQuat, worldScale);

            if (isSkinned) {
                // For skinned meshes: copy the full world matrix but flatten Y
                proxy.matrixAutoUpdate = false;
                proxy.matrix.copy(source.matrixWorld);

                // Extract and flatten Y to floor
                proxy.matrix.elements[13] = 0.01; // Y translation = near floor

                // Apply offsets by modifying X and Z translation components
                proxy.matrix.elements[12] += this.params.offsetX;
                proxy.matrix.elements[14] += this.params.offsetZ;

                // Flatten scale Y to create shadow squash effect
                // Scale is encoded in columns 0,1,2 of the matrix
                const sx = worldScale.x;
                const sz = worldScale.z;
                proxy.matrix.elements[4] *= 0.0;  // Y column X component
                proxy.matrix.elements[5] = 0.001; // Y scale near zero
                proxy.matrix.elements[6] *= 0.0;  // Y column Z component

                proxy.matrixWorldNeedsUpdate = true;

                // Sync morph targets
                if (source.morphTargetInfluences && proxy.morphTargetInfluences) {
                    for (let m = 0; m < source.morphTargetInfluences.length; m++) {
                        if (m < proxy.morphTargetInfluences.length) {
                            proxy.morphTargetInfluences[m] = source.morphTargetInfluences[m];
                        }
                    }
                }
            } else {
                // For static meshes: set position directly
                proxy.position.set(
                    worldPos.x + this.params.offsetX,
                    0.01,
                    worldPos.z + this.params.offsetZ
                );
                proxy.quaternion.copy(worldQuat);
                proxy.scale.set(worldScale.x, 0.001, worldScale.z);
                proxy.updateMatrixWorld(true);
            }
        }
    }

    setVisible(visible) {
        this.visible = visible;
        this.group.visible = visible;
    }

    setOpacity(val) {
        this.params.opacity = val;
        this.mappings.forEach(({ proxy }) => {
            if (Array.isArray(proxy.material)) {
                proxy.material.forEach(m => { m.opacity = val; });
            } else if (proxy.material) {
                proxy.material.opacity = val;
            }
        });
    }

    setColor(hex) {
        this.params.color.set(hex);
        this.mappings.forEach(({ proxy }) => {
            if (Array.isArray(proxy.material)) {
                proxy.material.forEach(m => m.color.set(hex));
            } else if (proxy.material) {
                proxy.material.color.set(hex);
            }
        });
    }

    setOffsetX(val) { this.params.offsetX = val; }
    setOffsetZ(val) { this.params.offsetZ = val; }
}
