#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
out vec3 v_dir;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_rotation;
void main() {
  float s = sin(u_rotation);
  float c = cos(u_rotation);
  mat3 rot = mat3(c,0,s, 0,1,0, -s,0,c);
  v_dir = rot * a_position;
  vec4 pos = u_proj * mat4(mat3(u_view)) * vec4(a_position, 1.0);
  gl_Position = pos.xyww;
}