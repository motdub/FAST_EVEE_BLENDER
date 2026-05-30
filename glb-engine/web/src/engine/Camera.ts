import { mat4, vec3, glMatrix } from "gl-matrix";

export class Camera {
  position: vec3 = vec3.fromValues(0, 2, 5);
  target: vec3   = vec3.fromValues(0, 0, 0);
  up: vec3       = vec3.fromValues(0, 1, 0);
  fov   = 60;
  near  = 0.1;
  far   = 500;

  view = mat4.create();
  proj = mat4.create();

  // Animated keyframe DOF focus distance (world units)
  focusKeyframes: { frame: number; dist: number }[] = [];
  currentFocus = 20;

  update(aspect: number, frame: number) {
    mat4.lookAt(this.view, this.position, this.target, this.up);
    mat4.perspective(this.proj, glMatrix.toRadian(this.fov), aspect, this.near, this.far);
    this._interpolateFocus(frame);
  }

  private _interpolateFocus(frame: number) {
    if (this.focusKeyframes.length < 2) return;
    const kfs = this.focusKeyframes;
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (frame >= a.frame && frame <= b.frame) {
        const t = (frame - a.frame) / (b.frame - a.frame);
        this.currentFocus = a.dist + (b.dist - a.dist) * t;
        return;
      }
    }
    this.currentFocus = kfs[kfs.length - 1].dist;
  }
}