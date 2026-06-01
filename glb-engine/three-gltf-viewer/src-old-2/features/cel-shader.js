import * as THREE from 'three';

/**
 * CelShaderSystem
 * Injects toon/cel shading into MeshStandardMaterial / MeshPhysicalMaterial
 * using onBeforeCompile. Clones materials per mesh so originals are never
 * mutated — this means clearPatches() can safely restore them on model reload.
 */
export class CelShaderSystem {
    constructor() {
        this.isActive = false;
        this.steps = 4;
        // Each entry: { node, originalMaterial, patchedMaterial, shader }
        this._patches = [];
    }

    toggle() {
        this.isActive = !this.isActive;
        this._patches.forEach(({ shader }) => {
            if (shader && shader.uniforms.uCelActive) {
                shader.uniforms.uCelActive.value = this.isActive ? 1.0 : 0.0;
            }
        });
        return this.isActive;
    }

    setSteps(val) {
        this.steps = Math.max(2, Math.min(8, val));
        this._patches.forEach(({ shader }) => {
            if (shader && shader.uniforms.uCelSteps) {
                shader.uniforms.uCelSteps.value = parseFloat(this.steps);
            }
        });
    }

    applyToModel(model) {
        this.clearPatches();

        model.traverse((node) => {
            if (!node.isMesh) return;

            const mats = Array.isArray(node.material) ? node.material : [node.material];
            const patchedMats = mats.map((mat, idx) => {
                if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
                    return mat;
                }

                // Clone so we never touch the original
                const cloned = mat.clone();
                const entry = { node, originalMaterial: mat, patchedMaterial: cloned, shader: null, matIndex: idx };
                this._patches.push(entry);

                cloned.onBeforeCompile = (shader) => {
                    shader.uniforms.uCelActive = { value: this.isActive ? 1.0 : 0.0 };
                    shader.uniforms.uCelSteps  = { value: parseFloat(this.steps) };

                    // Insert uniforms + helper before main()
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `void main() {`,
                        `uniform float uCelActive;
uniform float uCelSteps;

float celQuantize(float val, float steps) {
    return floor(val * steps) / steps;
}

void main() {`
                    );

                    // Quantize diffuse after lighting is resolved
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `#include <lights_fragment_end>`,
                        `#include <lights_fragment_end>
if (uCelActive > 0.5) {
    float lum = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114));
    float cel = celQuantize(max(lum, 0.0), uCelSteps);
    float ratio = (lum > 0.001) ? (cel / lum) : 1.0;
    reflectedLight.directDiffuse  *= ratio;
    reflectedLight.directSpecular *= ratio;
}`
                    );

                    entry.shader = shader;
                };

                // customProgramCacheKey must differ from original so Three.js
                // compiles a new program for this clone
                cloned.customProgramCacheKey = () => `cel_${this.steps}`;
                cloned.needsUpdate = true;
                return cloned;
            });

            // Apply patched materials to node
            if (Array.isArray(node.material)) {
                node.material = patchedMats;
            } else {
                node.material = patchedMats[0];
            }
        });
    }

    clearPatches() {
        // Restore original materials on every node
        this._patches.forEach(({ node, originalMaterial, patchedMaterial, matIndex }) => {
            if (!node) return;
            if (Array.isArray(node.material)) {
                node.material[matIndex] = originalMaterial;
            } else {
                node.material = originalMaterial;
            }
            // Dispose the cloned material to free GPU memory
            if (patchedMaterial && patchedMaterial !== originalMaterial) {
                patchedMaterial.dispose();
            }
        });
        this._patches = [];
    }
}
