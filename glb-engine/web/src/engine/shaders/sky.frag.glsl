#version 300 es
precision mediump float;
in vec3 v_dir;
uniform samplerCube u_skybox;
uniform float u_intensity;
out vec4 fragColor;
void main() {
  fragColor = texture(u_skybox, normalize(v_dir)) * u_intensity;
}