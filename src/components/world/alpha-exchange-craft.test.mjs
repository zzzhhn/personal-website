import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3,BufferGeometry,Float32BufferAttribute } from 'three';
import { exchangeChamferBox,exchangeSurface,exchangeCraftMaterial,bakeExchangeWorklights } from './alpha-exchange-craft.ts';

test('single chamfer preserves support bounds, closed outward faces and a finite 44-triangle budget',()=>{
  for(const size of [[.78,.62,.62],[3.4,.16,1.3],[.14,.2,.12]]){
    const g=exchangeChamferBox(size),p=g.getAttribute('position'),edges=new Map();
    assert.equal(p.count/3,44);g.computeBoundingBox();
    size.forEach((v,i)=>assert.ok(Math.abs(g.boundingBox.max.getComponent(i)-v/2)<1e-6));
    for(let i=0;i<p.count;i+=3){
      const points=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,i+j));
      const n=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      assert.ok(n.length()>1e-8);assert.ok(n.dot(points[0].clone().add(points[1]).add(points[2]))>0);
      for(let j=0;j<3;j++){
        const key=[points[j],points[(j+1)%3]].map(v=>v.toArray().map(x=>x.toFixed(6)).join(',')).sort().join('/');
        edges.set(key,(edges.get(key)??0)+1);
      }
    }
    assert.ok([...edges.values()].every(n=>n===2),'every edge has exactly two incident triangles');g.dispose();
  }
  assert.throws(()=>exchangeChamferBox([1,0,1]));assert.throws(()=>exchangeChamferBox([1,1,1],NaN));
});
test('stone, walnut and brass separate surface response while retaining shared night emission',()=>{
  assert.deepEqual(exchangeSurface('#dfd2ba'),[.86,0]);assert.deepEqual(exchangeSurface('#5a4230'),[.68,0]);
  assert.deepEqual(exchangeSurface('#b8975a'),[.46,.55]);
  const m=exchangeCraftMaterial(),shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>'};
  m.onBeforeCompile(shader,{});assert.ok(shader.uniforms.uParkNight);
  assert.match(shader.fragmentShader,/totalEmissiveRadiance/);assert.match(shader.fragmentShader,/roughnessFactor=vExchangeSurface.x/);
  assert.match(shader.fragmentShader,/metalnessFactor=vExchangeSurface.y/);assert.equal(m.vertexColors,true);m.dispose();
});
test('worklight baking reaches the horizontal worktop but not the floor, monitor shell or distant stone',()=>{
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute([2.4,1.05,-16.5,2.4,0,-16.5,2.4,1.4,-16.5,0,1.05,-20,2.4,1.05,-16.5],3));
  g.setAttribute('normal',new Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0,0,0,1],3));
  g.setAttribute('aEmit',new Float32BufferAttribute(new Float32Array(15),3));bakeExchangeWorklights(g);
  const e=g.getAttribute('aEmit');assert.ok(e.getY(0)>.6&&e.getY(0)<.7);assert.equal(e.getX(0),0);
  for(let i=1;i<5;i++)assert.equal(e.getY(i),0);g.dispose();
});
test('clearing hood wash reaches the cabinet and press, but not the route, stairs, or cabinet back',()=>{
  const points=[[10.8,3,-27.3],[11.7,1.52,-26.38],[11.7,.45,-26],[14.4,3,-27],[11.7,3,-28],[10.8,3,-27.76]];
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(points.flat(),3));
  g.setAttribute('normal',new Float32BufferAttribute([[0,0,1],[0,1,0],[0,1,0],[0,1,0],[0,0,1],[0,0,-1]].flat(),3));
  g.setAttribute('aEmit',new Float32BufferAttribute(new Float32Array(18),3));bakeExchangeWorklights(g);
  const e=g.getAttribute('aEmit');assert.ok(e.getY(0)>.2);assert.ok(e.getY(1)>.05);
  for(let i=2;i<6;i++)assert.equal(e.getY(i),0);g.dispose();
});
