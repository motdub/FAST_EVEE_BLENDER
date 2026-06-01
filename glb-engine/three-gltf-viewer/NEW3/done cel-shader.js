import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * CelShaderSystem — Post-process ShaderPass approach
 *
 * Instead of patching per-material onBeforeCompile (fragile, GLSL-version dependent),
 * we add a full-screen ShaderPass AFTER the RenderPass that quantizes luminance
 * into flat toon bands. This works on ANY material type, always.
 */
export class CelShaderSystem {
    constructor() {
        this.isActive = false;
        this.steps = 4;
        this.pass = null; // set by viewer via attachToComposer()
    }

    /** Call this after composer is set up. Returns the ShaderPass to add. */
    createPass() {
        this.pass = new ShaderPass({
            uniforms: {
                tDiffuse:    { value: null },
                uCelActive:  { value: 0.0 },
                uCelSteps:   { value: 4.0 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float uCelActive;
                uniform float uCelSteps;
                varying vec2 vUv;

                void main() {
                    vec4 texel = texture2D(tDiffuse, vUv);
                    if (uCelActive < 0.5) {
                        gl_FragColor = texel;
                        return;
                    }
                    vec3 col = texel.rgb;
                    float lum = dot(col, vec3(0.299, 0.587, 0.114));
                    if (lum > 0.001) {
                        // Quantize into N flat bands
                        float cel = floor(lum * uCelSteps + 0.5) / uCelSteps;
                        col *= (cel / lum);
                    }
                    gl_FragColor = vec4(clamp(col, 0.0, 1.0), texel.a);
                }
            `
        });
        this.pass.enabled = true;
        return this.pass;
    }

    toggle() {
        this.isActive = !this.isActive;
        if (this.pass) {
            this.pass.uniforms.uCelActive.value = this.isActive ? 1.0 : 0.0;
        }
        return this.isActive;
    }

    setSteps(val) {
        this.steps = Math.max(2, Math.min(8, val));
        if (this.pass) {
            this.pass.uniforms.uCelSteps.value = parseFloat(this.steps);
        }
    }

    // These are no-ops now (post-process doesn't need per-model patching)
    applyToModel(model) {}
    clearPatches() {}
}
