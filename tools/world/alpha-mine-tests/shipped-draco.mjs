import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BufferAttribute, BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// GLTFLoader handles node transforms, material splits and accessors as in the
// browser. Use the shipped WASM decoder directly in Node, where Web Workers
// are unavailable. Attribute arrays retain the component types in the GLB.
const directory = new URL('../../../public/assets/world/draco/', import.meta.url);
const factory = runInNewContext(readFileSync(new URL('draco_wasm_wrapper.js', directory), 'utf8') + ';DracoDecoderModule;',
  { console, TextDecoder, WebAssembly, Buffer, Uint8Array, ArrayBuffer, setTimeout, clearTimeout });
const draco = await factory({ wasmBinary: readFileSync(new URL('draco_decoder.wasm', directory)) });
const loader = new GLTFLoader().setDRACOLoader({
  preload() {},
  decodeDracoFile(bytes, callback, ids, types, _space, reject) {
    const buffer = new draco.DecoderBuffer(), decoder = new draco.Decoder(), mesh = new draco.Mesh();
    const values = new draco.DracoFloat32Array(), face = new draco.DracoInt32Array();
    try {
      buffer.Init(new Int8Array(bytes), bytes.byteLength);
      const status = decoder.DecodeBufferToMesh(buffer, mesh);
      if (!status.ok()) throw new Error(status.error_msg());
      const geometry = new BufferGeometry();
      for (const [name, id] of Object.entries(ids)) {
        const attr = decoder.GetAttributeByUniqueId(mesh, id);
        if (!decoder.GetAttributeFloatForAllPoints(mesh, attr, values)) throw new Error('Missing ' + name);
        const array = new globalThis[types[name]](values.size());
        for (let i = 0; i < array.length; i++) array[i] = values.GetValue(i);
        geometry.setAttribute(name, new BufferAttribute(array, attr.num_components()));
      }
      const indices = new Uint32Array(mesh.num_faces() * 3);
      for (let i = 0; i < mesh.num_faces(); i++) {
        decoder.GetFaceFromMesh(mesh, i, face);
        for (let k = 0; k < 3; k++) indices[i * 3 + k] = face.GetValue(k);
      }
      callback(geometry.setIndex(new BufferAttribute(indices, 1)));
    } catch (error) { reject(error); }
    finally { [face, values, mesh, decoder, buffer].forEach(value => draco.destroy(value)); }
  },
});
export async function loadShippedDraco(url) {
  const bytes = readFileSync(url);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}
