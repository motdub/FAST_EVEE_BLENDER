import { mat4, vec4, vec3 } from "gl-matrix";

export interface AABB {
  min: vec3;
  max: vec3;
}

export class Frustum {
  planes: vec4[] = Array.from({ length: 6 }, () => vec4.create());

  update(viewProj: mat4) {
    const m = viewProj;
    // Extract clip planes from VP matrix
    // Left, Right, Bottom, Top, Near, Far
    const set = (i: number, a: number, b: number, c: number, d: number) => {
      vec4.set(this.planes[i], a, b, c, d);
      const len = Math.sqrt(a*a + b*b + c*c);
      vec4.scale(this.planes[i], this.planes[i], 1 / len);
    };
    set(0,  m[3]+m[0], m[7]+m[4], m[11]+m[8],  m[15]+m[12]);
    set(1,  m[3]-m[0], m[7]-m[4], m[11]-m[8],  m[15]-m[12]);
    set(2,  m[3]+m[1], m[7]+m[5], m[11]+m[9],  m[15]+m[13]);
    set(3,  m[3]-m[1], m[7]-m[5], m[11]-m[9],  m[15]-m[13]);
    set(4,  m[3]+m[2], m[7]+m[6], m[11]+m[10], m[15]+m[14]);
    set(5,  m[3]-m[2], m[7]-m[6], m[11]-m[10], m[15]-m[14]);
  }

  containsAABB(aabb: AABB): boolean {
    for (const p of this.planes) {
      const px = p[0] > 0 ? aabb.max[0] : aabb.min[0];
      const py = p[1] > 0 ? aabb.max[1] : aabb.min[1];
      const pz = p[2] > 0 ? aabb.max[2] : aabb.min[2];
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }
}