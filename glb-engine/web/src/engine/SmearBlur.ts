export class SmearBlur {
  prevFrameTex!: WebGLTexture;
  prevFrameFBO!: WebGLFramebuffer;
  strength = 0;

  init(gl: WebGL2RenderingContext, w: number, h: number) {
    this.prevFrameTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.prevFrameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.prevFrameFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prevFrameFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.prevFrameTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  copyCurrentToHistory(gl: WebGL2RenderingContext, currentTex: WebGLTexture, w: number, h: number) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.prevFrameFBO);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}