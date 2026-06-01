import * as THREE from 'three';

export class MeshShadowsSystem {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.mappings = [];
        
        this.params = {
            opacity: 0.6,
            color: new THREE.Color("#111116"),
            offsetX: 0.0,
            offsetZ: 0.0
        };
    }

    buildProxies(object, mixer) {
        this.clearProxies();
        if (!mixer || mixer._actions.length === 0) return;

        object.traverse((node) => {
            if (node.isMesh) {
                const shadowMat = new THREE.MeshBasicMaterial({
                    color: this.params.color,
                    transparent: true,
                    opacity: this.params.opacity,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });

                const hasSkinning = node.isSkinnedMesh;
                let shadowProxy;

                if (hasSkinning) {
                    shadowMat.skinning = true;
                    shadowProxy = new THREE.SkinnedMesh(node.geometry, shadowMat);
                    shadowProxy.bind(node.skeleton, node.bindMatrix);
                } else {
                    shadowProxy = new THREE.Mesh(node.geometry, shadowMat);
                }

                shadowProxy.castShadow = false;
                shadowProxy.receiveShadow = false;
                
                this.group.add(shadowProxy);
                this.mappings.push({
                    source: node,
                    proxy: shadowProxy
                });
            }
        });
    }

    clearProxies() {
        this.mappings.forEach(m => {
            m.proxy.geometry.dispose();
            if (Array.isArray(m.proxy.material)) m.proxy.material.forEach(mat => mat.dispose());
            else m.proxy.material.dispose();
        });
        this.mappings = [];
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
    }

    update() {
        if (this.mappings.length === 0) return;

        for (let i = 0; i < this.mappings.length; i++) {
            const { source, proxy } = this.mappings[i];
            if (!source.parent) continue;

            source.updateWorldMatrix(true, false);
            
            proxy.position.copy(source.position);
            proxy.rotation.copy(source.rotation);
            proxy.scale.copy(source.scale);

            let parentWorldPos = new THREE.Vector3();
            source.parent.getWorldPosition(parentWorldPos);
            
            // Flatten vertical height completely to the floor plane
            proxy.position.y = -parentWorldPos.y + 0.005; 
            proxy.position.x += this.params.offsetX;
            proxy.position.z += this.params.offsetZ;
            proxy.scale.y = 0.0;

            if (source.morphTargetInfluences && proxy.morphTargetInfluences) {
                for (let m = 0; m < source.morphTargetInfluences.length; m++) {
                    proxy.morphTargetInfluences[m] = source.morphTargetInfluences[m];
                }
            }
        }
    }

    setVisible(visible) { this.group.visible = visible; }
    setOpacity(val) { this.params.opacity = val; this.mappings.forEach(m => m.proxy.material.opacity = val); }
    setColor(hex) { this.params.color.set(hex); this.mappings.forEach(m => m.proxy.material.color.set(hex)); }
    setOffsetX(val) { this.params.offsetX = val; }
    setOffsetZ(val) { this.params.offsetZ = val; }
}