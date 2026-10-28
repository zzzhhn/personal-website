import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BoxGeometry } from 'three';
import { createCoasterStructure } from './coaster-geometry.ts';
import { lightsTouchingPart } from './intent-lighting-cull.ts';

test('light broad phase keeps crossing and tangent sources in original order, including translated parts',()=>{
  const g=new BoxGeometry(2,2,2),origin=[30,8,-50];
  const sources=[{p:[30,8,-50],radius:1},{p:[33,8,-50],radius:2},{p:[36,8,-50],radius:2},
    {p:[30,5,-50],radius:2},{p:[30,8,-54],radius:2}];
  assert.deepEqual(lightsTouchingPart(g,origin,sources),[sources[0],sources[1],sources[3]]);g.dispose();
});

// Captured from 884a9f4 before introducing broad-phase light rejection. Includes
// every position, normal, colour and nightRadiance byte of both complete LODs.
const expected=[['eafe6ac11a235b8ed225772eb127ac85504caad087d48a810fbbd80ad234e3d5','57b44999b9fdd096967eee4f3acf21593a299e4f1d4e53680391a03e81854a57'],
 ['5787c83c63fe6c774e2568f15f920e244f854f1cbcbcebf1a6970157dc14fde5','87623ca640d7f11cb63360a3d11c0838b97cc7171335f14f27cdf4a14242e825']];
test('complete far and near park lighting/render attributes remain byte-identical',()=>{
  for(const detailed of [false,true]){
    const start=performance.now(),data=createCoasterStructure(detailed),ms=performance.now()-start;
    for(const [i,name] of ['steel','glow'].entries()){
      const g=data[name],hash=createHash('sha256');
      for(const key of Object.keys(g.attributes).sort())hash.update(new Uint8Array(g.attributes[key].array.buffer));
      if(g.index)hash.update(new Uint8Array(g.index.array.buffer));
      assert.equal(hash.digest('hex'),expected[Number(detailed)][i],`${name} ${detailed}`);g.dispose();
    }
    console.log(JSON.stringify({detailed,buildMs:ms,colliders:data.colliders.length}));
  }
});
