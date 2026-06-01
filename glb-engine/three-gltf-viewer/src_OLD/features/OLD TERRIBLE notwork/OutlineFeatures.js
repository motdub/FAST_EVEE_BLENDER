import * as THREE from 'three';

export class OutlineFeature {
    constructor(viewer) {
        this.viewer = viewer;
        this.isActive = true;
        this.thickness = 0.015;
        this.outlineMaterials = [];
    }

    toggle() {
        this.isActive = !this.isActive;
        this.outlineMaterials.forEach(mat => mat.visible = this.isActive);
        return this.isActive;
    }

    setThickness(val) {
        this.thickness = val;
        this.outlineMaterials.forEach(mat => {
            if (mat.userData.shader) {
                mat.userData.shader.uniforms.uOutlineThickness.value = this.thickness;
            }
        });
    }

    generateOutlines() {
        if (!this.viewer.model) return;
        this.outlineMaterials = [];

        this.viewer.model.traverse((node) => {
            if (node.isMesh && !node.userData.isOutlineMesh) {
                
                // Construct a custom back-face shader material layout
                const outlineMaterial = new THREE.ShaderMaterial({
                    side: THREE.BackSide,
                    blending: THREE.NormalBlending,
                    depthWrite: true,
                    depthTest: true,
                    uniforms: {
                        uOutlineThickness: { value: this.thickness },
                        uOutlineColor: { value: new THREE.Color(0x000000) }
                    },
                    vertexShader: `
                        uniform float uOutlineThickness;
                        #include <common>
                        #include <skinning_pars_vertex>
                        void main() {
                            #include <skinning_vertex>
                            
                            // Displace vertex points straight outward along surface normals vectors
                            vec3 transformedNormal = objectNormal;
                            #ifdef USE_SKINNING
                                transformedNormal = skinMatrix[int(skinIndex.x)] * objectNormal;
                            #endif
                            
                            vec3 displacedPosition = transformed + normalized(transformedNormal) * uOutlineThickness;
                            vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
                            gl_Position = projectionMatrix * mvPosition;
                        }
                    `,
                    fragmentShader: `
                        uniform vec3 uOutlineColor;
                        void main() {
                            gl_FragColor = vec4(uOutlineColor, 1.0);
                        }
                    `
                });

                outlineMaterial.userData.shader = outlineMaterial;

                // Create duplicate structural companion proxy mesh nodes layout
                let outlineMesh;
                if (node.isSkinnedMesh) {
                    outlineMesh = new THREE.SkinnedMesh(node.geometry, outlineMaterial);
                    outlineMesh.bind(node.skeleton, node.bindMatrix);
                } else {
                    outlineMesh = new THREE.Mesh(node.geometry, outlineMaterial);
                }

                outlineMesh.userData.isOutlineMesh = true;
                outlineMesh.visible = this.isActive;
                
                // Append proxy directly back inside bone hierarchies path nodes
                node.add(outlineMesh);
                this.outlineMaterials.push(outlineMaterial);
            }
        });
    }
}