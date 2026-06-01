import * as THREE from 'three';

/**
 * CelShaderSystem — r160 compatible
 *
 * ROOT CAUSE OF PREVIOUS FAILURE:
 *   - `#include <lights_fragment_end>` does NOT exist in r160 fragment shaders.
 *   - The correct injection point is `#include <lights_fragment_maps>` which
 *     appears AFTER all light accumulation in the standard shader.
 *   - We also inject BEFORE `gl_FragColor` assignment using `outgoingLight` which
 *     is the final accumulated light value.
 *
 * STRATEGY: quantize `outgoingLight` just before the final color assignment.
 * This correctly bands the entire lit output (diffuse + specular + emissive halo)
 * into N flat toon steps without touching reflections or environment maps.
 */
export class CelShaderSystem {
    constructor() {
        this.isActive = false;
        this.steps = 4;
        this._patches = []; // { node, originalMaterial, patchedMaterial, matIndex, shader }
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

                const cloned = mat.clone();
                const entry = { node, originalMaterial: mat, patchedMaterial: cloned, shader: null, matIndex: idx };
                this._patches.push(entry);

                cloned.onBeforeCompile = (shader) => {
                    shader.uniforms.uCelActive = { value: this.isActive ? 1.0 : 0.0 };
                    shader.uniforms.uCelSteps  = { value: parseFloat(this.steps) };

                    // Inject uniform declarations at top of fragment shader
                    shader.fragmentShader = 'uniform float uCelActive;\nuniform float uCelSteps;\n' + shader.fragmentShader;

                    // In r160, the final output is assembled as:
                    //   vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse
                    //                     + reflectedLight.directSpecular + reflectedLight.indirectSpecular
                    //                     + totalEmissiveRadiance;
                    // We replace that line to inject cel quantization before gl_FragColor is set.
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;`,
                        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
if (uCelActive > 0.5) {
    float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    if (lum > 0.001) {
        float cel = floor(lum * uCelSteps) / uCelSteps;
        outgoingLight *= (cel / lum);
    }
}`
                    );

                    entry.shader = shader;
                };

                cloned.customProgramCacheKey = () => `cel_v2_${this.steps}`;
                cloned.needsUpdate = true;
                return cloned;
            });

            if (Array.isArray(node.material)) {
                node.material = patchedMats;
            } else {
                node.material = patchedMats[0];
            }
        });
    }

    clearPatches() {
        this._patches.forEach(({ node, originalMaterial, patchedMaterial, matIndex }) => {
            if (!node) return;
            if (Array.isArray(node.material)) {
                node.material[matIndex] = originalMaterial;
            } else {
                node.material = originalMaterial;
            }
            if (patchedMaterial && patchedMaterial !== originalMaterial) {
                patchedMaterial.dispose();
            }
        });
        this._patches = [];
    }
}
