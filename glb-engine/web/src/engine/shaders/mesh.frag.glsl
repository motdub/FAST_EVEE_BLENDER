#version 300 es
precision mediump float;

in vec3 v_worldPos;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_lightSpacePos;

uniform sampler2D u_albedo;
uniform sampler2D u_shadowMap;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;
uniform vec3 u_ambientColor;
uniform float u_ambientIntensity;
uniform samplerCube u_envMap;
uniform float u_envIntensity;

out vec4 fragColor;

float shadowPCF(vec4 lsPos) {
  vec3 proj = lsPos.xyz / lsPos.w * 0.5 + 0.5;
  if (proj.z > 1.0) return 1.0;
  float bias = 0.003;
  float shadow = 0.0;
  vec2 texelSize = 1.0 / vec2(512.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float depth = texture(u_shadowMap, proj.xy + vec2(x,y) * texelSize).r;
      shadow += (proj.z - bias > depth) ? 0.35 : 1.0;
    }
  }
  return shadow / 9.0;
}

void main() {
  vec4 albedo = texture(u_albedo, v_uv);
  if (albedo.a < 0.1) discard;

  vec3 N = normalize(v_normal);
  float NdotL = max(dot(N, normalize(u_sunDir)), 0.0);

  // Ambient from env cube
  vec3 envAmbient = texture(u_envMap, N).rgb * u_envIntensity;

  // Shadow
  float shadow = shadowPCF(v_lightSpacePos);

  vec3 diffuse = albedo.rgb * (
    u_ambientColor * u_ambientIntensity +
    envAmbient +
    u_sunColor * u_sunIntensity * NdotL * shadow
  );

  fragColor = vec4(diffuse, albedo.a);
}