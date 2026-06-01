import * as THREE from 'three';

/**
 * OutlineFeature
 * Renders ink outlines using back-face extrusion.
 * - Adds child outline mesh to each source mesh (follows transforms automatically)
 * - USE_SKINNING define is explicitly set so r160 compiles the skinning path
 * - renderOrder = 1 (render after model, not before) with BackSide + depthTest
 */
export class OutlineFeature {
    constructor() {
        this.isActive = false;
        this.thickness = 0.02; // world-space units
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
        // slider range 1–5 → world units 0.005–0.06
        this.thickness = val * 0.012;
        this.outlineMeshes.forEach(mesh => {
            if (mesh.material && mesh.material.uniforms) {
                mesh.material.uniforms.uOutlineThickness.value = this.thickness;
            }
        });
    }

    generateOutlines(model) {
        this.clearOutlines();

        model.traverse((node) => {
            if (!node.isMesh || node.userData.isOutlineMesh) return;

            const isSkinned = node.isSkinnedMesh;

            const defines = {};
            if (isSkinned) {
                defines['USE_SKINNING'] = '';
                // Also need morph support if present
                if (node.morphTargetInfluences && node.morphTargetInfluences.length > 0) {
                    defines['USE_MORPHTARGETS'] = '';
                }
            }

            const outlineMaterial = new THREE.ShaderMaterial({
                side: THREE.BackSide,
                depthWrite: true,
                depthTest: true,
                transparent: false,
                defines,
                uniforms: {
                    uOutlineThickness: { value: this.thickness },
                    uOutlineColor:     { value: new THREE.Color(0x000000) },
                    // Required by skinning includes
                    bindMatrix:        { value: isSkinned ? node.bindMatrix : new THREE.Matrix4() },
                    bindMatrixInverse: { value: isSkinned ? node.bindMatrixInverse : new THREE.Matrix4() },
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

                        // Compute normal in object space, then apply skinning if needed
                        vec3 objNormal = normalize(objectNormal);

                        #ifdef USE_SKINNING
                            mat4 skinMatrix =
                                skinWeight.x * boneMatX +
                                skinWeight.y * boneMatY +
                                skinWeight.z * boneMatZ +
                                skinWeight.w * boneMatW;
                            objNormal = normalize((skinMatrix * vec4(objNormal, 0.0)).xyz);
                        #endif

                        // Extrude in view space along view-space normal
                        vec3 vNorm = normalize(normalMatrix * objNormal);
                        vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
                        mvPos.xyz += vNorm * uOutlineThickness;
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
            if (isSkinned) {
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
            outlineMesh.renderOrder = 1; // render after the model, not before

            // Add as child so it inherits the parent's transforms automatically
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
