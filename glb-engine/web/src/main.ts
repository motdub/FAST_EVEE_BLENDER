import { Renderer } from "./engine/Renderer";
import { loadGLB } from "./loader/GLBLoader";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new Renderer(canvas);

renderer.fpsCallback = (fps) => {
  (document.getElementById("fps") as HTMLElement).textContent = `FPS: ${fps}`;
};

// Wire up UI sliders
const bind = (id: string, cb: (v: number) => void, scale = 1) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el?.addEventListener("input", () => cb(+el.value * scale));
};

bind("smear",      v => renderer.smear.strength = v / 100);
bind("focus",      v => renderer.dof.focusDistance = v / 100);
bind("blur-r",     v => renderer.dof.blurRadius = v);
bind("bloom",      v => renderer.cc.bloom = v / 100);
bind("brightness", v => renderer.cc.brightness = v / 100);
bind("contrast",   v => renderer.cc.contrast = v / 100);
bind("saturation", v => renderer.cc.saturation = v / 100);
bind("sun-x",      v => { renderer.lighting.sunDir[0] = v / 100; renderer.lighting.updateLightSpaceMatrix(); });
bind("sun-y",      v => { renderer.lighting.sunDir[1] = v / 100; renderer.lighting.updateLightSpaceMatrix(); });
bind("ambient",    v => renderer.lighting.ambientIntensity = v / 100);
bind("sky-rot",    v => renderer.sky.rotation = v * Math.PI / 180);

const shadowSel = document.getElementById("shadow-res") as HTMLSelectElement;
shadowSel?.addEventListener("change", () => {
  renderer.lighting.initShadowMap(
    (renderer as any).gl,
    +shadowSel.value
  );
});

// Camera orbit with mouse drag
let drag = false, lastX = 0, lastY = 0;
canvas.addEventListener("mousedown", e => { drag = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => { drag = false; });
window.addEventListener("mousemove", e => {
  if (!drag) return;
  const dx = (e.clientX - lastX) * 0.01;
  const dy = (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
  const cam = renderer.camera;
  const r = Math.sqrt(cam.position[0]**2 + cam.position[2]**2);
  const theta = Math.atan2(cam.position[0], cam.position[2]) + dx;
  cam.position[0] = r * Math.sin(theta);
  cam.position[2] = r * Math.cos(theta);
  cam.position[1] = Math.max(0.1, cam.position[1] - dy);
});
canvas.addEventListener("wheel", e => {
  const cam = renderer.camera;
  const scale = 1 + e.deltaY * 0.001;
  cam.position[0] *= scale;
  cam.position[1] *= scale;
  cam.position[2] *= scale;
}, { passive: true });

// Load scene and start
(async () => {
  const scene = await loadGLB("/optimized.glb");
  renderer.loadMeshes(scene.meshes);

  // Example: animated focus keyframes
  renderer.camera.focusKeyframes = [
    { frame: 0, dist: 30 },
    { frame: 120, dist: 5 },
    { frame: 240, dist: 20 },
  ];

  renderer.start();
})();