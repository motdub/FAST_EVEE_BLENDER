#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform float u_smear;

// DOF params
uniform float u_focusDist;   // world units, passed as normalized 0-1
uniform float u_blurRadius;  // pixels

// Color correction
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_bloom;

out vec4 fragColor;

vec3 colorCorrect(vec3 col) {
  // Brightness
  col *= u_brightness;
  // Contrast
  col = (col - 0.5) * u_contrast + 0.5;
  // Saturation
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(gray), col, u_saturation);
  return clamp(col, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;

  // Smear / motion blur: blend previous frame
  vec4 curr = texture(u_current, uv);
  vec4 prev = texture(u_previous, uv);
  vec4 col  = mix(curr, prev, u_smear);

  // Simple radial DOF — blur based on distance from center
  float dist = length(uv - 0.5) * 2.0; // 0..1 toward edges
  float blurAmt = max(0.0, dist - u_focusDist) * u_blurRadius;
  if (blurAmt > 0.5) {
    // box blur in screen space
    vec4 blurred = vec4(0.0);
    float px = 1.0 / 1920.0;
    float steps = 6.0;
    for (float dx = -steps; dx <= steps; dx++) {
      for (float dy = -steps; dy <= steps; dy++) {
        blurred += texture(u_current, uv + vec2(dx,dy) * px * blurAmt);
      }
    }
    blurred /= pow(steps*2.0+1.0, 2.0);
    col = mix(col, blurred, clamp(blurAmt / 8.0, 0.0, 1.0));
  }

  // Bloom: bright areas bleed as semi-transparent overlay
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  vec3 bloom = col.rgb * max(0.0, lum - 0.7) * u_bloom * 3.0;
  col.rgb += bloom;

  col.rgb = colorCorrect(col.rgb);
  fragColor = col;
}