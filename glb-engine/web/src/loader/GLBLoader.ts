import { WebIO, Document } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

export interface LoadedMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  joints?: Uint8Array;
  weights?: Float32Array;
  albedoData?: ImageBitmap;
  skinned: boolean;
  name: string;
  // AABB
  aabbMin: [number, number, number];
  aabbMax: [number, number, number];
}

export interface LoadedScene {
  meshes: LoadedMesh[];
}

export async function loadGLB(url: string): Promise<LoadedScene> {
  await MeshoptDecoder.ready;

  const io = new WebIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

  const doc = await io.read(url);
  const root = doc.getRoot();
  const meshes: LoadedMesh[] = [];

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const posAcc  = prim.getAttribute("POSITION")!;
      const normAcc = prim.getAttribute("NORMAL")!;
      const uvAcc   = prim.getAttribute("TEXCOORD_0");
      const idxAcc  = prim.getIndices();
      const jointAcc  = prim.getAttribute("JOINTS_0");
      const weightAcc = prim.getAttribute("WEIGHTS_0");

      const positions = new Float32Array(posAcc.getArray()!);
      const normals   = new Float32Array(normAcc.getArray()!);
      const uvs       = uvAcc ? new Float32Array(uvAcc.getArray()!) : new Float32Array(positions.length / 3 * 2);
      const indices   = idxAcc
        ? (idxAcc.getArray()!.constructor === Uint32Array
            ? new Uint32Array(idxAcc.getArray()!)
            : new Uint16Array(idxAcc.getArray()!))
        : undefined;

      // AABB from accessor bounds
      const minArr = posAcc.getMin([]) as number[];
      const maxArr = posAcc.getMax([]) as number[];

      // Texture
      let albedoData: ImageBitmap | undefined;
      const mat = prim.getMaterial();
      if (mat) {
        const baseColorTex = mat.getBaseColorTexture();
        if (baseColorTex) {
          const imgData = baseColorTex.getImage();
          if (imgData) {
            const blob = new Blob([imgData]);
            albedoData = await createImageBitmap(blob);
          }
        }
      }

      meshes.push({
        positions, normals, uvs,
        indices: indices ?? new Uint16Array(0),
        joints: jointAcc ? new Uint8Array(jointAcc.getArray()!) : undefined,
        weights: weightAcc ? new Float32Array(weightAcc.getArray()!) : undefined,
        albedoData,
        skinned: !!jointAcc,
        name: mesh.getName(),
        aabbMin: [minArr[0] ?? 0, minArr[1] ?? 0, minArr[2] ?? 0],
        aabbMax: [maxArr[0] ?? 0, maxArr[1] ?? 0, maxArr[2] ?? 0],
      });
    }
  }

  return { meshes };
}