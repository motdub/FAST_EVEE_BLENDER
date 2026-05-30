#version 300 es
precision highp float;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec4 a_joints;
layout(location=4) in vec4 a_weights;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_lightSpaceMatrix;

// Skinning (up to 64 joints)
uniform mat4 u_jointMatrices[64];
uniform bool u_skinned;

out vec3 v_worldPos;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_lightSpacePos;

void main() {
  vec4 pos = vec4(a_position, 1.0);
  vec3 norm = a_normal;

  if (u_skinned) {
    mat4 skin =
      a_weights.x * u_jointMatrices[int(a_joints.x)] +
      a_weights.y * u_jointMatrices[int(a_joints.y)] +
      a_weights.z * u_jointMatrices[int(a_joints.z)] +
      a_weights.w * u_jointMatrices[int(a_joints.w)];
    pos  = skin * pos;
    norm = mat3(skin) * norm;
  }

  vec4 worldPos = u_model * pos;
  v_worldPos     = worldPos.xyz;
  v_normal       = normalize(mat3(transpose(inverse(u_model))) * norm);
  v_uv           = a_uv;
  v_lightSpacePos = u_lightSpaceMatrix * worldPos;

  gl_Position = u_proj * u_view * worldPos;
}