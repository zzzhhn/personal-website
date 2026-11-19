/** Locate the authored subsets in the actual Draco-decoded runtime index buffers. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { readMineStaticVisual } from '../alpha-mine-tests/static-visual.mjs';

const py = fileURLToPath(new URL('./contact-sources.py',import.meta.url));
const recipe = JSON.parse(execFileSync('python3', ['-B',py], {encoding:'utf8'}));
const asset = await readMineStaticVisual();
const groups = Object.entries(recipe.parts);
const tolerance = .00020; // Shipping positions are quantized to 20 bits.

function inside(point, {center,size,axes}) {
  const [x,y,z] = [point.x-center[0],point.y-center[1],point.z-center[2]];
  return axes.every(([a,b,c],i)=>Math.abs(x*a+y*b+z*c)<=size[i]/2+tolerance);
}
function record(part, start) {
  const range = part.at(-1);
  if (range && range[0]+range[1]===start) range[1]+=3;
  else part.push([start,3]);
}

try {
  asset.root.updateWorldMatrix(true,true);
  const batches = {};
  for (const name of new Set(groups.map(([,p])=>p.batch))) {
    const mesh = asset.root.getObjectByName(name), pos = mesh.geometry.getAttribute('position'), index=mesh.geometry.index;
    const positions = Array.from({length:pos.count},(_,i)=>new Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld));
    const parents = new Int32Array(index.count/3).map((_,i)=>i);
    const firstFace = new Map();
    const rootOf = i => {
      while (parents[i]!==i) { parents[i]=parents[parents[i]]; i=parents[i]; }
      return i;
    };
    for (let i=0; i<index.count; i++) {
      const p=positions[index.getX(i)], key=[p.x,p.y,p.z].join(','), face=Math.floor(i/3);
      const first=firstFace.get(key);
      if (first===undefined) firstFace.set(key,face);
      else parents[rootOf(face)]=rootOf(first);
    }
    const components=new Map();
    for (let i=0; i<index.count; i++) {
      const root=rootOf(Math.floor(i/3)), component=components.get(root)??new Set();
      component.add(positions[index.getX(i)]);
      components.set(root,component);
    }
    const choices=groups.filter(([,p])=>p.batch===name);
    const classification=new Map();
    for(const [root,points] of components) {
      const vertices=[...points];
      const matches=choices.filter(([,part])=>part.volumes.some(volume=>vertices.every(p=>inside(p,volume))));
      assert.ok(matches.length<=1,JSON.stringify({root,matches:matches.map(p=>p[0])}));
      if(matches.length)classification.set(root,matches[0][0]);
    }
    const parts=Object.fromEntries(choices.map(([key])=>[key,[]]));
    for(let i=0;i<index.count;i+=3) {
      const part=classification.get(rootOf(i/3));
      if(part)record(parts[part],i);
    }
    batches[name]={indexCount:index.count,parts};
  }
  const output={batches,old:Object.fromEntries(groups.map(([id,p])=>[id,p.old]).filter(([,r])=>r.length)),
    legacyLengths:recipe.legacyLengths};
  const target = new URL('../../../src/components/world/alpha-mine-contact.generated.json',import.meta.url);
  const contents=JSON.stringify(output)+'\n';
  if (process.argv.includes('--check')) assert.equal(readFileSync(target,'utf8'),contents);
  else writeFileSync(target,contents);
  console.log(JSON.stringify(Object.fromEntries(Object.values(batches).flatMap(b=>Object.entries(b.parts).map(
    ([name,ranges])=>[name,{ranges:ranges.length,triangles:ranges.reduce((n,[,count])=>n+count/3,0)}])))));
} finally {asset.dispose();}
