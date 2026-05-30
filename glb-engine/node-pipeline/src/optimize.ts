import {
  NodeIO,
  Document,
  Primitive,
} from "@gltf-transform/core";
import {
  dedup,
  flatten,
  join,
  reorder,
  quantize,
  textureCompress,
  draco,
  meshopt,
  instance,
  prune,
  resample,
  simplify,
} from "@gltf-transform/functions";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import * as path from "path";
import * as fs from "fs";

const INPUT = process.argv[2] ?? "export_scene.glb";
const OUTPUT = process.argv[3] ?? "optimized.glb";

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;

  const io = new NodeIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });

  console.log(`Loading ${INPUT}...`);
  const doc = await io.read(INPUT);

  console.log("Optimizing...");

  await doc.transform(
    // Remove unused data
    prune(),
    dedup(),

    // Flatten nodes, join meshes where safe
    flatten(),

    // Detect and enable GPU instancing for repeated meshes
    instance({ min: 2 }),

    // Reorder mesh data for GPU cache efficiency
    reorder({ encoder: MeshoptEncoder }),

    // Bake animation curves (remove redundant keyframes)
    resample(),

    // Compress geometry with meshopt (fast decode, great ratio)
    meshopt({ encoder: MeshoptEncoder }),

    // Compress textures to WebP for bandwidth
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [1024, 1024],
    }),
  );

  console.log(`Writing ${OUTPUT}...`);
  await io.write(OUTPUT, doc);

  const inStat = fs.statSync(INPUT);
  const outStat = fs.statSync(OUTPUT);
  const ratio = ((1 - outStat.size / inStat.size) * 100).toFixed(1);
  console.log(
    `Done: ${(inStat.size / 1024 / 1024).toFixed(2)} MB → ${(outStat.size / 1024 / 1024).toFixed(2)} MB (${ratio}% smaller)`
  );
}

main().catch(console.error);