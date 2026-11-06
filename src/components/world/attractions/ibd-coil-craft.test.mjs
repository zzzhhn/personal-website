import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildIbdCoil, buildIbdStatic } from './ibd-yard-geometry.ts';

import { ibdCraftOptions } from './ibd-craft-options.ts';
import { IBD_GEOMETRY_BUDGET } from './ibd-geometry-budget.ts';

test('production craft defaults retain the accepted static geometry budget',()=>{
  const data=buildIbdStatic({separateCraftShells:true,...ibdCraftOptions(null)});
  try{assert.ok(data.geometry.index.count/3<IBD_GEOMETRY_BUDGET.static);}finally{data.geometry.dispose();data.craftShellGeometry?.dispose();}
});

test('moving wooden cradle supports the barrel without entering its actual surface',()=>{
  const geometry=buildIbdCoil(false),material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(geometry,material);
  const role=geometry.getAttribute('aMat');let minGap=Infinity;
  try {
    for(const sign of [-1,1])for(let x=1.02;x<1.5;x+=.02){
      const hits=new Raycaster(new Vector3(sign*x,-3,0),new Vector3(0,1,0),0,3).intersectObject(mesh);
      const wood=hits.filter(h=>role.getW(h.face.a)===-3).map(h=>h.point.y);
      const steel=hits.filter(h=>role.getW(h.face.a)===-2).map(h=>h.point.y);
      assert.ok(wood.length && steel.length,'both real support and barrel must be intersected');
      const gap=Math.min(...steel)-Math.max(...wood);
      assert.ok(gap>=-.0001,`support intersects barrel at ${sign*x}: ${gap}`);minGap=Math.min(minGap,gap);
    }
    assert.ok(minGap<.012,`support floats away from barrel: ${minGap}`);
  }finally{geometry.dispose();material.dispose();}
});

test('barrel machining coordinates stay continuous across the cylinder seam',()=>{
  const geometry=buildIbdCoil(false),role=geometry.getAttribute('aMat'),uv=geometry.getAttribute('aSuv'),index=geometry.index;
  try{for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    if(ids.some(id=>role.getW(id)!==-2))continue;
    const across=ids.map(id=>uv.getY(id));
    assert.ok(Math.max(...across)-Math.min(...across)<.3,'one barrel triangle spans an angular UV branch cut');
  }}finally{geometry.dispose();}
});
