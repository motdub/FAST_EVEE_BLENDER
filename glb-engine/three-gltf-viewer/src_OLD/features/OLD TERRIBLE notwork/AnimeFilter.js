export class AnimeFilter {
    constructor(viewer) {
        this.viewer = viewer;
        this.isActive = true;
        this.steps = 4;
        this.materialsMap = [];
    }

    toggle() {
        this.isActive = !this.isActive;
        this.materialsMap.forEach(mat => {
            if (mat.userData.shader) {
                mat.userData.shader.uniforms.uAnimeFilterActive.value = this.isActive ? 1.0 : 0.0;
            }
        });
        return this.isActive;
    }

    setSteps(val) {
        this.steps = val;
        this.materialsMap.forEach(mat => {
            if (mat.userData.shader) {
                mat.userData.shader.uniforms.uCelSteps.value = parseFloat(this.steps);
            }
        });
    }

    applyFilterToMaterial(material) {
        this.materialsMap.push(material);

        const originalCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            if (originalCompile) originalCompile(shader);

            // Establish unified parameters properties configurations bindings points maps lines
            shader.uniforms.uAnimeFilterActive = { value: this.isActive ? 1.0 : 0.0 };
            shader.uniforms.uCelSteps = { value: parseFloat(this.steps) };

            shader.fragmentShader = `
                uniform float uAnimeFilterActive;
                uniform float uCelSteps;
                ${shader.fragmentShader}
            `;

            // Rewrite lighting calculation branches to clamp gradient transitions inside the rendering threads
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <lights_fragment_begin>`,
                `
                #include <lights_fragment_begin>
                
                if (uAnimeFilterActive > 0.5) {
                    // Quantize directional lighting paths vectors maps calculations loops parameters
                    #if NUM_DIR_LIGHTS > 0
                        for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
                            // Smooth color frequencies down into discrete values step bands blocks
                            float dotProduct = dot(geometryNormal, directionalLights[i].direction);
                            float celFactor = max(floor(dotProduct * uCelSteps) / uCelSteps, 0.1);
                            
                            // Overwrite light calculations with posterized tones
                            directionalLights[i].color *= celFactor;
                        }
                    #endif
                }
                `
            );

            material.userData.shader = shader;
        };
        material.needsUpdate = true;
    }
}