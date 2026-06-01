import * as THREE from 'three';

/**
 * CelShaderSystem
 * Injects toon/cel shading into all MeshStandardMaterial or MeshPhysicalMaterial
 * on the loaded model using Three.js onBeforeCompile hooks.
 * Quantizes diffuse lighting into discrete steps for a cartoon look.
 */
export class CelShaderSystem {
    constructor() {
        this.isActive = false;
        this.steps = 4;
        this._patchedMaterials = [];
    }

    toggle() {
        this.isActive = !this.isActive;
        this._patchedMaterials.forEach(({ mat, shader }) => {
            if (shader && shader.uniforms.uCelActive) {
                shader.uniforms.uCelActive.value = this.isActive ? 1.0 : 0.0;
            }
        });
        return this.isActive;
    }

    setSteps(val) {
        this.steps = Math.max(2, Math.min(8, val));
        this._patchedMaterials.forEach(({ mat, shader }) => {
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

            mats.forEach(mat => {
                if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;

                const entry = { mat, shader: null };
                this._patchedMaterials.push(entry);

                const origOnBeforeCompile = mat.onBeforeCompile;

                mat.onBeforeCompile = (shader) => {
                    if (origOnBeforeCompile) origOnBeforeCompile(shader);

                    shader.uniforms.uCelActive = { value: this.isActive ? 1.0 : 0.0 };
                    shader.uniforms.uCelSteps = { value: parseFloat(this.steps) };

                    // Inject uniform declarations at top of fragment shader
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `void main() {`,
                        `
uniform float uCelActive;
uniform float uCelSteps;

float celQuantize(float val, float steps) {
    return floor(val * steps) / steps;
}

void main() {`
                    );

                    // After outgoing light is computed, quantize it
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `#include <lights_fragment_end>`,
                        `
#include <lights_fragment_end>
if (uCelActive > 0.5) {
    float luminance = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114));
    float celFactor = celQuantize(max(luminance, 0.0), uCelSteps);
    float ratio = (luminance > 0.001) ? (celFactor / luminance) : 1.0;
    reflectedLight.directDiffuse *= ratio;
    reflectedLight.directSpecular *= ratio;
}`
                    );

                    entry.shader = shader;
                };

                mat.needsUpdate = true;
            });
        });
    }

    clearPatches() {
        // Force material recompile on clear by flagging needsUpdate
        this._patchedMaterials.forEach(({ mat }) => {
            mat.onBeforeCompile = () => {};
            mat.needsUpdate = true;
        });
        this._patchedMaterials = [];
    }
}
