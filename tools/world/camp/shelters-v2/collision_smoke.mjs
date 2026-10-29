// Geometry fixture, not walking evidence: use the actual authored GLB shell in Rapier.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const entry = require.resolve('@dimforge/rapier3d-compat', { paths: [require.resolve('@react-three/rapier')] });
const { default: R } = await import(entry);
await R.init();
const results=[];
for (const id of ['C03','C04']) {
  const bytes=await readFile(`public/assets/world/camp/${id}.glb`);
  const j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const e=j.nodes.find(n=>n.name===id).extras;
  const world=new R.World({x:0,y:0,z:0});
  world.createCollider(R.ColliderDesc.trimesh(new Float32Array(e.collisionVertices),new Uint32Array(e.collisionIndices)));
  world.step();
  for (const [label,halfHeight] of [['physics-capsule',.48],['visual-height-clearance',.52]]) {
    const shape=new R.Capsule(halfHeight,.34), y=halfHeight+.34+.01;
    for(const z of [0,-.15,.15]){
      const hit=world.castShape({x:3,y,z},{x:0,y:0,z:0,w:1},{x:-3,y:0,z:0},shape,0,1,true);
      results.push({id,label,case:`entry-offset-${z}`,pass:hit===null,toi:hit?.time_of_impact??null});
    }
    for(const [label2,from,delta] of [['back',{x:-3,y,z:0},{x:3,y:0,z:0}],['left',{x:0,y,z:-3},{x:0,y:0,z:3}],['right',{x:0,y,z:3},{x:0,y:0,z:-3}]]) {
      const hit=world.castShape(from,{x:0,y:0,z:0,w:1},delta,shape,0,1,true);
      results.push({id,label,case:label2,pass:!!hit,toi:hit?.time_of_impact??null});
    }
  }
  world.free();
}
await writeFile('docs/world/quality-v2/shelters/collision-fixture.json',JSON.stringify({type:'GLB shell shape-cast fixture; no locomotion evidence',results},null,2)+'\n');
console.log(`${results.filter(x=>x.pass).length}/${results.length} actual GLB shell fixtures pass`);
if(results.some(x=>!x.pass)){console.log(results.filter(x=>!x.pass));process.exitCode=1;}
