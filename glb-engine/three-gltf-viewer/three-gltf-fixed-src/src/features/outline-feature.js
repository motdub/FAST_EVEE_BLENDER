import * as THREE from 'three';

/**
 * OutlineFeature — r160 compatible, back-face extrusion outlines
 *
 * ROOT CAUSE OF PREVIOUS FAILURE:
 *   - The custom vertex shader tried to manually compose boneMatX/Y/Z/W which
 *     do NOT exist as individual uniforms in Three.js r160. Skinning is done
 *     via a bone texture (boneTexture/boneTextureSize uniforms).
 *   - #include <skinning_pars_vertex> in a ShaderMaterial does NOT auto-inject
 *     the bone texture uniforms — those are only injected by WebGLProgram when
 *     it detects a SkinnedMesh with USE_SKINNING.
 *   - FIX: For SkinnedMesh, we use a RawShaderMaterial approach that mirrors
 *     exactly what Three.js does internally for skinned vertex displacement,
 *     by pulling bone data from the boneTexture uniform directly.
 *
 * SIMPLER CORRECT APPROACH for r160:
 *   Use onBeforeCompile on a MeshBasicMaterial (side=BackSide) to inject
 *   the extrusion. Since MeshBasicMaterial goes through the standard program
 *   compiler, Three.js injects all skinning code automatically when it detects
 *   a SkinnedMesh. We just add the extrusion step AFTER skinning is applied.
 */
export class OutlineFeature {
    constructor() {
        this.isActive   = false;
        this.thickness  = 0.015;
        this.outlineMeshes = [];
    }

    toggle() {
        this.isActive = !this.isActive;
        this.outlineMeshes.forEach(m => { m.visible = this.isActive; });
        return this.isActive;
    }

    setThickness(val) {
        // slider 1–5 → world units 0.004–0.05
        this.thickness = val * 0.01;
        this.outlineMeshes.forEach(m => {
            if (m.material?.uniforms?.uOutlineThick) {
                m.material.uniforms.uOutlineThick.value = this.thickness;
            }
        });
    }

    generateOutlines(model) {
        this.clearOutlines();

        model.traverse((node) => {
            if (!node.isMesh || node.userData.isOutlineMesh) return;

            // Build outline material using onBeforeCompile so Three.js handles
            // all the skinning/morph setup automatically
            const outlineMat = new THREE.MeshBasicMaterial({
                color: 0x000000,
                side: THREE.BackSide,
                transparent: false,
                depthWrite: true,
            });

            // Store thickness so we can update it
            outlineMat._outlineThick = this.thickness;

            outlineMat.onBeforeCompile = (shader) => {
                shader.uniforms.uOutlineThick = { value: outlineMat._outlineThick };

                // After all standard transforms (including skinning), push
                // the vertex outward along the view-space normal
                shader.vertexShader = 'uniform float uOutlineThick;\n' + shader.vertexShader;

                // Replace the final gl_Position assignment to add outline offset
                // mvPosition is computed by Three.js standard chunks
                shader.vertexShader = shader.vertexShader.replace(
                    `#include <project_vertex>`,
                    `#include <project_vertex>
// Outline extrusion: push vertex along view-space normal
vec3 vNormal_outline = normalize( normalMatrix * objectNormal );
vec4 mvPos_outline = modelViewMatrix * vec4( transformed, 1.0 );
mvPos_outline.xyz += vNormal_outline * uOutlineThick;
gl_Position = projectionMatrix * mvPos_outline;`
                );

                // Expose uniforms for later updates
                outlineMat.userData.shader = shader;
                outlineMat.uniforms = shader.uniforms;
            };

            outlineMat.customProgramCacheKey = () => 'outline_v3';

            let outlineMesh;
            if (node.isSkinnedMesh) {
                outlineMesh = new THREE.SkinnedMesh(node.geometry, outlineMat);
                outlineMesh.bind(node.skeleton, node.bindMatrix);
                if (node.morphTargetInfluences) {
                    outlineMesh.morphTargetInfluences  = node.morphTargetInfluences;
                    outlineMesh.morphTargetDictionary  = node.morphTargetDictionary;
                }
            } else {
                outlineMesh = new THREE.Mesh(node.geometry, outlineMat);
            }

            outlineMesh.userData.isOutlineMesh = true;
            outlineMesh.visible        = this.isActive;
            outlineMesh.frustumCulled  = false;
            outlineMesh.castShadow     = false;
            outlineMesh.receiveShadow  = false;
            outlineMesh.renderOrder    = 0;

            node.add(outlineMesh);
            this.outlineMeshes.push(outlineMesh);
        });
    }

    clearOutlines() {
        this.outlineMeshes.forEach(m => {
            if (m.parent) m.parent.remove(m);
            if (m.material) m.material.dispose();
        });
        this.outlineMeshes = [];
    }
}
