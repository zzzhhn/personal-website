import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BufferAttribute, BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadG24Fixture() {
// Native Draco WASM, no browser, Web Worker, image, renderer or local server.
const require = createRequire(import.meta.url);
const draco = await require('draco3d').createDecoderModule({});
const loader = new GLTFLoader();
loader.setDRACOLoader({ preload() {}, decodeDracoFile(bytes: ArrayBuffer, done: (geometry: BufferGeometry) => void,
  attributes: Record<string, number>) {
  const decoder = new draco.Decoder(), input = new draco.DecoderBuffer(), mesh = new draco.Mesh();
  input.Init(new Int8Array(bytes), bytes.byteLength);
  const status = decoder.DecodeBufferToMesh(input, mesh);
  assert.ok(status.ok(), status.error_msg());
  const geometry = new BufferGeometry();
  for (const [name, id] of Object.entries(attributes)) {
    const attribute = decoder.GetAttributeByUniqueId(mesh, id), size = attribute.num_components();
    const decoded = new draco.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, decoded);
    const array = new Float32Array(mesh.num_points() * size);
    for (let i = 0; i < array.length; i++) array[i] = decoded.GetValue(i);
    geometry.setAttribute(name, new BufferAttribute(array, size)); draco.destroy(decoded);
  }
  const faces = new draco.DracoInt32Array(), indices = new Uint32Array(mesh.num_faces() * 3);
  for (let i = 0; i < mesh.num_faces(); i++) { decoder.GetFaceFromMesh(mesh, i, faces); for (let k = 0; k < 3; k++) indices[i * 3 + k] = faces.GetValue(k); }
  geometry.setIndex(new BufferAttribute(indices, 1));
  draco.destroy(faces); draco.destroy(mesh); draco.destroy(input); draco.destroy(decoder);
  done(geometry);
} } as never);
const bytes = readFileSync(new URL('../../../../public/assets/world/guide/G24.glb', import.meta.url));
return await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
