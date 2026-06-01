import * as THREE from 'three';

/**
 * OutlineFeature
 * Renders black outlines around meshes using a back-face extrusion technique.
 * Creates a companion SkinnedMesh or Mesh per node with BackSide rendering.
 * Supports animated/skinned characters properly.
 */
export class OutlineFeature {
    constructor() {
        this.isActive = false;
        this.thickness = 0.015;
        this.outlineMeshes = [];
    }

    toggle() {
        this.isActive = !this.isActive;
        this.outlineMeshes.forEach(mesh => {
            mesh.visible = this.isActive;
        });
        return this.isActive;
    }

    setThickness(val) {
        this.thickness = val * 0.01; // Convert slider value (1-5) to world units
        this.outlineMeshes.forEach(mesh => {
            if (mesh.material && mesh.material.uniforms) {
                mesh.material.uniforms.uOutlineThickness.value = this.thickness;
            }
        });
    }

    generateOutlines(model) {
        // Remove existing outlines first
        this.clearOutlines();

        model.traverse((node) => {
            if (!node.isMesh || node.userData.isOutlineMesh) return;

            const outlineMaterial = new THREE.ShaderMaterial({
                side: THREE.BackSide,
                depthWrite: true,
                depthTest: true,
                transparent: false,
                uniforms: {
                    uOutlineThickness: { value: this.thickness },
                    uOutlineColor: { value: new THREE.Color(0x000000) }
                },
                vertexShader: `
                    uniform float uOutlineThickness;

                    #include <common>
                    #include <morphtarget_pars_vertex>
                    #include <skinning_pars_vertex>

                    void main() {
                        #include <skinbase_vertex>
                        #include <begin_vertex>
                        #include <morphtarget_vertex>
                        #include <skinning_vertex>

                        // Transform normal into view space for correct extrusion
                        vec3 transformedNormal = normalMatrix * objectNormal;
                        #ifdef USE_SKINNING
                            mat3 skinMat = mat3(
                                skinMatrix[0].xyz,
                                skinMatrix[1].xyz,
                                skinMatrix[2].xyz
                            );
                            transformedNormal = normalMatrix * normalize(skinMat * objectNormal);
                        #endif

                        vec3 norm = normalize(transformedNormal);
                        vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
                        mvPos.xyz += norm * uOutlineThickness;
                        gl_Position = projectionMatrix * mvPos;
                    }
                `,
                fragmentShader: `
                    uniform vec3 uOutlineColor;
                    void main() {
                        gl_FragColor = vec4(uOutlineColor, 1.0);
                    }
                `
            });

            let outlineMesh;

            if (node.isSkinnedMesh) {
                outlineMesh = new THREE.SkinnedMesh(node.geometry, outlineMaterial);
                outlineMesh.bind(node.skeleton, node.bindMatrix);
                if (node.morphTargetInfluences) {
                    outlineMesh.morphTargetInfluences = node.morphTargetInfluences;
                    outlineMesh.morphTargetDictionary = node.morphTargetDictionary;
                }
            } else {
                outlineMesh = new THREE.Mesh(node.geometry, outlineMaterial);
            }

            outlineMesh.userData.isOutlineMesh = true;
            outlineMesh.visible = this.isActive;
            outlineMesh.frustumCulled = false;
            outlineMesh.renderOrder = -1;

            node.add(outlineMesh);
            this.outlineMeshes.push(outlineMesh);
        });
    }

    clearOutlines() {
        this.outlineMeshes.forEach(mesh => {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.material) mesh.material.dispose();
        });
        this.outlineMeshes = [];
    }
}
