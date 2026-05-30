import { vec3, mat4 } from "gl-matrix";

export class Lighting {
  sunDir: vec3   = vec3.fromValues(0.5, 0.8, 0.3);
  sunColor: vec3 = vec3.fromValues(1.0, 0.95, 0.85);
  sunIntensity   = 1.2;

  ambientColor: vec3 = vec3.fromValues(0.5, 0.6, 0.8);
  ambientIntensity   = 0.3;

  envIntensity = 0.4;

  // Shadow map
  shadowMap!: WebGLTexture;
  shadowFBO!: WebGLFramebuffer;
  shadowRes = 512;
  lightSpaceMatrix = mat4.create();

  initShadowMap(gl: WebGL2RenderingContext, res: number) {
    this.shadowRes = res;
    this.shadowMap = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, res, res, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);

    this.shadowFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowMap, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  updateLightSpaceMatrix(sceneBounds = 20) {
    const lightDir = vec3.normalize(vec3.create(), this.sunDir);
    const lightPos = vec3.scale(vec3.create(), lightDir, sceneBounds);

    const lightView = mat4.lookAt(mat4.create(), lightPos, vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));
    const lightProj = mat4.ortho(mat4.create(),
      -sceneBounds, sceneBounds, -sceneBounds, sceneBounds, 0.1, sceneBounds * 3
    );
    mat4.multiply(this.lightSpaceMatrix, lightProj, lightView);
  }
}