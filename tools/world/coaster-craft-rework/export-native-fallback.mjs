// Export the editable runtime source as glTF when Blender cannot start.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Box3, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const [input, output, receipt] = process.argv.slice(2);
assert.ok(input && output && receipt);
const data = JSON.parse(readFileSync(input, 'utf8'));
const root = new Group();
root.name = data.name ?? 'Coaster structure';
const finishes = new Map();

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

for (const part of data.parts) {
  const structure = Boolean(part.position);
  const geometry = new BufferGeometry();
  if (structure) {
    const offset = [50,1,-195];
    const position = new Float32Array(part.position);
    for (let i = 0; i < position.length; i++) position[i] -= offset[i % 3];
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('normal', new BufferAttribute(Float32Array.from(part.normal), 3));
    geometry.setAttribute('color', new BufferAttribute(Float32Array.from(part.color), 3));
    geometry.setIndex(new BufferAttribute(Uint32Array.from(part.index), 1));
  } else {
    const yUp = a => Float32Array.from(a, (_,i) => i%3===0 ? a[i] : i%3===1 ? a[i+1] : -a[i-1]);
    geometry.setAttribute('position', new BufferAttribute(yUp(part.vertices), 3));
    geometry.setAttribute('normal', new BufferAttribute(yUp(part.normals), 3));
  }

  const name = part.material ?? part.part;
  if (!finishes.has(name)) {
    const [rgb, roughness, metalness] = part.finish ?? [[1,1,1], part.roughness, part.metalness];
    finishes.set(name, new MeshStandardMaterial({ name, color: new Color(...rgb), roughness, metalness, vertexColors: structure }));
  }
  const mesh = new Mesh(geometry, finishes.get(name));
  mesh.name = part.name ?? part.part;
  root.add(mesh);
}
const glb = await new GLTFExporter().parseAsync(root, { binary:true, trs:false });
writeFileSync(output, Buffer.from(glb));
const freshBytes = readFileSync(output);
const {scene} = await new GLTFLoader().parseAsync(freshBytes.buffer.slice(freshBytes.byteOffset, freshBytes.byteOffset + freshBytes.byteLength), '');
function inspect(object) {
  const meshes = [];
  object.traverse(node => { if (node.isMesh) meshes.push(node); });
  const bounds = new Box3().setFromObject(object);
  return {
    objects: meshes.length,
    triangles: meshes.reduce((total,mesh)=>total+(mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count)/3,0),
    materials: [...new Set(meshes.map(mesh => mesh.material.name))].sort(),
    coloredVertices: meshes.reduce((total,mesh) => total + (mesh.geometry.attributes.color?.count ?? 0),0),
    bounds:[bounds.min.toArray(),bounds.max.toArray()],
  };
}
const before=inspect(root), after=inspect(scene);
assert.deepEqual(after,before);
writeFileSync(receipt, JSON.stringify({ importer:'Three.js GLTFLoader fresh import', ...after }, null, 2)+'\n');
console.log(output,after.objects,after.triangles,after.materials.length);
