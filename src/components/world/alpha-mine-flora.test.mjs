import test from 'node:test';
import assert from 'node:assert/strict';
import {quarryFloraBanks,quarryFloraKind} from './alpha-mine-flora.ts';
import {ALPHA_MINE_ORIGIN} from './alpha-mine-layout.ts';

test('rosettes and stemmed flowers retain the 15-triangle grass budget and finite connected roots',()=>{
 const banks=quarryFloraBanks();
 for(const name of ['leaf','bloom']){
  const p=banks[name];assert.equal(p.length,15*3*3);assert.ok(p.every(Number.isFinite));
  for(let i=0;i<p.length;i+=9){
   const a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
   const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert.ok(Math.hypot(...cross)>1e-7,`${name} degenerate ${i/9}`);
  }
 }
 const ys=name=>banks[name].filter((_,i)=>i%3===1);
 assert.ok(Math.max(...ys('leaf'))<.2);assert.ok(Math.max(...ys('bloom'))>.35);
 assert.equal(Math.min(...ys('bloom')),0);assert.equal(banks.colour.length,banks.bloom.length);
});
test('quarry plants form all three silhouettes without changing plants elsewhere',()=>{
 const kinds=new Set();const [x,,z]=ALPHA_MINE_ORIGIN;
 for(let a=-20;a<20;a+=.7)for(let b=-45;b<0;b+=.7)kinds.add(quarryFloraKind(x+a,z+b));
 assert.deepEqual([...kinds].sort(),[0,1,2]);assert.equal(quarryFloraKind(60,20),0);
});
