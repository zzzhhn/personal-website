/** Extract one repeated stool from the approved near bar asset in its deck-local frame. */
import { writeFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

const source = 'public/assets/world/club/bar/djc-north-bar-v1.glb';
const gltf = await readWorldCraftGltf([source]);
const origin = new Vector3(-3.55, 0, .25), p = new Vector3();
const vertices = [], indices = [], lookup = new Map();
const belongs = name => /Oiled_teak|Blackened_steel|Split_rattan|Brushed_brass/.test(name);
try {
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh || !belongs(mesh.name)) return;
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const points = [i,i+1,i+2].map(n => p.fromBufferAttribute(position, index?.getX(n) ?? n)
        .applyMatrix4(mesh.matrixWorld).sub(origin).toArray());
      if (!points.every(([x,y,z]) => Math.abs(x)<.37 && Math.abs(z)<.37 && y>=-.005 && y<.84)
        || points.every(([,y]) => y<=.003)) continue;
      for (const point of points) {
        const quantized = point.map(n => Math.round(n*1e5)), key = quantized.join(',');
        if (!lookup.has(key)) { lookup.set(key, vertices.length/3); vertices.push(...quantized); }
        indices.push(lookup.get(key));
      }
    }
  });
  if (indices.length/3 !== 2488) throw new Error(`The shipped stool extraction changed (${indices.length/3} faces)`);
  const output = new URL('../../../src/components/world/club-north-bar-stool-contact.generated.json', import.meta.url);
  await writeFile(output, JSON.stringify({source, scale:1e-5, vertices, indices})+'\n');
} finally { disposeWorldCraftGltf(gltf.scene); }
