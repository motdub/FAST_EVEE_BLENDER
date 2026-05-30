import { mat4, vec3 } from "gl-matrix";
import { Camera } from "./Camera";
import { Frustum, AABB } from "./Frustum";
import { Lighting } from "./Lighting";
import { Sky } from "./Sky";
import { SmearBlur } from "./SmearBlur";
import type { DOFSettings } from "./DOFCamera";
import type { ColorCorrectionSettings } from "./ColorCorrection";
import type { LoadedMesh } from "../loader/GLBLoader";

// Import shaders as strings via vite-plugin-glsl
import meshVert from "./shaders/mesh.vert.glsl?raw";
import meshFrag from "./shaders/mesh.frag.glsl?raw";
import skyVert  from "./shaders/sky.vert.glsl?raw";
import skyFrag  from "./shaders/sky.frag.glsl?raw";
import smearFrag from "./shaders/smear.frag.glsl?raw";

const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0, 1); }`;

interface GPUMesh {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  indexType: number;
  albedoTex: WebGLTexture;
  aabb: AABB;
  skinned: boolean;
  modelMatrix: mat4;
}

function compileShader(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error("Shader error: " + gl.getShaderInfoLog(s));
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, vert, gl.VERTEX_SHADER));
  gl.attachShader(p, compileShader(gl, frag, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error("Program link error: " + gl.getProgramInfoLog(p));
  return p;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private meshProg!: WebGLProgram;
  private skyProg!: WebGLProgram;
  private smearProg!: WebGLProgram;

  private gpuMeshes: GPUMesh[] = [];
  private frustum = new Frustum();

  camera = new Camera();
  lighting = new Lighting();
  sky = new Sky();
  smear = new SmearBlur();

  dof: DOFSettings = { focusDistance: 0.5, blurRadius: 0 };
  cc: ColorCorrectionSettings = { brightness: 1, contrast: 1, saturation: 1, bloom: 0 };

  // Render-to-texture
  private sceneFBO!: WebGLFramebuffer;
  private sceneColorTex!: WebGLTexture;
  private sceneDepthRBO!: WebGLRenderbuffer;
  private quadVAO!: WebGLVertexArrayObject;

  private w = 0;
  private h = 0;
  private frame = 0;
  private lastTime = 0;
  fpsCallback?: (fps: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    this.init();
  }

  private init() {
    const gl = this.gl;
    this.meshProg  = linkProgram(gl, meshVert, meshFrag);
    this.skyProg   = linkProgram(gl, skyVert, skyFrag);
    this.smearProg = linkProgram(gl, QUAD_VERT, smearFrag);

    // Shadow map
    this.lighting.initShadowMap(gl, 512);
    this.lighting.updateLightSpaceMatrix();

    // Full-screen quad
    this.quadVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVAO);
    const qbuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qbuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    this.sky.init(gl);
    this._resize();
  }

  loadMeshes(meshes: LoadedMesh[]) {
    const gl = this.gl;
    for (const m of meshes) {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);

      const upload = (loc: number, data: ArrayBufferView, size: number, type: number) => {
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, type, false, 0, 0);
      };

      upload(0, m.positions, 3, gl.FLOAT);
      upload(1, m.normals,   3, gl.FLOAT);
      upload(2, m.uvs,       2, gl.FLOAT);

      if (m.joints && m.weights) {
        upload(3, m.joints,  4, gl.UNSIGNED_BYTE);
        upload(4, m.weights, 4, gl.FLOAT);
      }

      const ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);

      // Texture
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (m.albedoData) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, m.albedoData);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      } else {
        // Default white 1x1
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
          new Uint8Array([255,255,255,255]));
      }

      gl.bindVertexArray(null);

      this.gpuMeshes.push({
        vao,
        indexCount: m.indices.length,
        indexType: m.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        albedoTex: tex,
        aabb: { min: m.aabbMin as any, max: m.aabbMax as any },
        skinned: m.skinned,
        modelMatrix: mat4.create(),
      });
    }
  }

  private _resize() {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    this.w = canvas.clientWidth  * devicePixelRatio | 0;
    this.h = canvas.clientHeight * devicePixelRatio | 0;
    canvas.width  = this.w;
    canvas.height = this.h;

    // Recreate scene FBO
    if (this.sceneFBO) {
      gl.deleteFramebuffer(this.sceneFBO);
      gl.deleteTexture(this.sceneColorTex);
      gl.deleteRenderbuffer(this.sceneDepthRBO);
    }
    this.sceneColorTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.sceneDepthRBO = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepthRBO);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.w, this.h);

    this.sceneFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneColorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepthRBO);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.smear.init(gl, this.w, this.h);
  }

  private setUniform(prog: WebGLProgram, name: string, ...v: any[]) {
    const gl = this.gl;
    const loc = gl.getUniformLocation(prog, name);
    if (loc === null) return;
    if (v.length === 1 && typeof v[0] === "number") gl.uniform1f(loc, v[0]);
    else if (v.length === 1 && typeof v[0] === "boolean") gl.uniform1i(loc, v[0] ? 1 : 0);
    else if (v.length === 1 && v[0] instanceof Float32Array && v[0].length === 16) gl.uniformMatrix4fv(loc, false, v[0]);
    else if (v.length === 3 && typeof v[0] === "number") gl.uniform3f(loc, v[0], v[1], v[2]);
    else if (v.length === 2 && typeof v[0] === "number") gl.uniform2f(loc, v[0], v[1]);
    else if (typeof v[0] === "number") gl.uniform1i(loc, v[0]);
  }

  renderFrame(time: number) {
    const gl = this.gl;

    // FPS
    const dt = time - this.lastTime;
    this.lastTime = time;
    if (this.fpsCallback && this.frame % 30 === 0) this.fpsCallback(1000 / dt | 0);
    this.frame++;

    // Resize check
    const canvas = gl.canvas as HTMLCanvasElement;
    const nw = canvas.clientWidth * devicePixelRatio | 0;
    const nh = canvas.clientHeight * devicePixelRatio | 0;
    if (nw !== this.w || nh !== this.h) this._resize();

    // Camera update
    const aspect = this.w / this.h;
    this.camera.update(aspect, this.frame);

    // Frustum
    const vp = mat4.multiply(mat4.create(), this.camera.proj, this.camera.view);
    this.frustum.update(vp);

    // --- Shadow pass ---
    this.lighting.updateLightSpaceMatrix();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lighting.shadowFBO);
    gl.viewport(0, 0, this.lighting.shadowRes, this.lighting.shadowRes);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // (shadow draw omitted for brevity — use mesh prog with only depth output)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // --- Scene pass → FBO ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0.05, 0.05, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Sky
    gl.depthMask(false);
    gl.useProgram(this.skyProg);
    this.setUniform(this.skyProg, "u_proj", this.camera.proj);
    this.setUniform(this.skyProg, "u_view", this.camera.view);
    this.setUniform(this.skyProg, "u_rotation", this.sky.rotation);
    this.setUniform(this.skyProg, "u_intensity", this.sky.intensity);
    gl.uniform1i(gl.getUniformLocation(this.skyProg, "u_skybox"), 0);
    this.sky.draw(gl);
    gl.depthMask(true);

    // Meshes
    gl.useProgram(this.meshProg);
    this.setUniform(this.meshProg, "u_view", this.camera.view);
    this.setUniform(this.meshProg, "u_proj", this.camera.proj);
    this.setUniform(this.meshProg, "u_lightSpaceMatrix", this.lighting.lightSpaceMatrix);
    this.setUniform(this.meshProg, "u_sunDir",          ...Array.from(this.lighting.sunDir));
    this.setUniform(this.meshProg, "u_sunColor",        ...Array.from(this.lighting.sunColor));
    this.setUniform(this.meshProg, "u_sunIntensity",    this.lighting.sunIntensity);
    this.setUniform(this.meshProg, "u_ambientColor",    ...Array.from(this.lighting.ambientColor));
    this.setUniform(this.meshProg, "u_ambientIntensity", this.lighting.ambientIntensity);
    this.setUniform(this.meshProg, "u_envIntensity",    this.lighting.envIntensity);

    // Shadow map to slot 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lighting.shadowMap);
    gl.uniform1i(gl.getUniformLocation(this.meshProg, "u_shadowMap"), 1);

    for (const gm of this.gpuMeshes) {
      if (!this.frustum.containsAABB(gm.aabb)) continue;

      this.setUniform(this.meshProg, "u_model", gm.modelMatrix);
      this.setUniform(this.meshProg, "u_skinned", gm.skinned);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gm.albedoTex);
      gl.uniform1i(gl.getUniformLocation(this.meshProg, "u_albedo"), 0);

      gl.bindVertexArray(gm.vao);
      gl.drawElements(gl.TRIANGLES, gm.indexCount, gm.indexType, 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // --- Smear + DOF + CC post pass → screen ---
    gl.viewport(0, 0, this.w, this.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(this.smearProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTex);
    gl.uniform1i(gl.getUniformLocation(this.smearProg, "u_current"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.smear.prevFrameTex);
    gl.uniform1i(gl.getUniformLocation(this.smearProg, "u_previous"), 1);

    this.setUniform(this.smearProg, "u_smear",      this.smear.strength);
    this.setUniform(this.smearProg, "u_focusDist",  this.dof.focusDistance);
    this.setUniform(this.smearProg, "u_blurRadius", this.dof.blurRadius);
    this.setUniform(this.smearProg, "u_brightness", this.cc.brightness);
    this.setUniform(this.smearProg, "u_contrast",   this.cc.contrast);
    this.setUniform(this.smearProg, "u_saturation", this.cc.saturation);
    this.setUniform(this.smearProg, "u_bloom",      this.cc.bloom);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Save current as previous for next smear frame
    this.smear.copyCurrentToHistory(gl, this.sceneColorTex, this.w, this.h);

    gl.enable(gl.DEPTH_TEST);
  }

  start() {
    const loop = (t: number) => { this.renderFrame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}