import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createIbdSigns } from './ibd-signs.ts';
import { IBD_STATIONS, ibdStation } from './ibd-yard-layout.ts';

function fixture(lang='zh') {
  const paint=[],ctx={fillRect(...a){paint.push(['rect',...a]);},fillText(...a){paint.push(['text',...a]);}};
  const canvas={width:0,height:0,getContext(kind){assert.equal(kind,'2d');return ctx;}};
  return {data:createIbdSigns(canvas,lang),paint,canvas};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);

test('relocating cargo moves only its placard and never repaints or reallocates the atlas',()=>{
  const {data,paint}=fixture(),g=data.geometry,p=g.getAttribute('position'),original=p.array.slice();
  const uv=g.getAttribute('uv'),normal=g.getAttribute('normal'),index=g.index,textureVersion=data.texture.version;
  const painted=paint.length,front=(7+IBD_STATIONS.findIndex(s=>s.id==='coil-front'))*4;
  try {
    assert.equal(data.updateMoved(['coil-front']),true);
    const moved=ibdStation('coil-front',['coil-front']);
    close((p.getX(front)+p.getX(front+1))/2,moved.at[0]);
    close((p.getY(front)+p.getY(front+2))/2,.31);
    close(p.getZ(front),moved.at[2]-.35);
    for(let i=0;i<original.length;i++) {
      const changed=i>=front*3&&i<(front+4)*3&&i%3===0;
      close(p.array[i],original[i]-(changed?8:0));
    }
    assert.equal(p.version,1); assert.equal(data.updateMoved(['coil-front','coil-rear']),false);
    assert.equal(data.updateMoved(['coil-front-new-supply']),false); assert.equal(p.version,1);
    assert.equal(data.geometry,g); assert.equal(g.getAttribute('uv'),uv); assert.equal(g.getAttribute('normal'),normal);
    assert.equal(g.index,index); assert.equal(data.material.map,data.texture);
    assert.equal(data.texture.version,textureVersion); assert.equal(paint.length,painted);
  } finally {data.dispose();}
});

test('restarting a batch returns the placard exactly and keeps its culling sphere valid',()=>{
  const {data}=fixture(),p=data.geometry.getAttribute('position'),original=p.array.slice();
  try {
    for(let round=0;round<20;round++) {
      data.updateMoved(['coil-front']);
      for(let i=0;i<p.count;i++) assert.ok(new Vector3().fromBufferAttribute(p,i).distanceTo(data.geometry.boundingSphere.center)<=data.geometry.boundingSphere.radius+1e-5);
      assert.equal(data.updateMoved([]),true); assert.deepEqual(p.array,original);
      assert.equal(data.updateMoved([]),false);
    }
  } finally {data.dispose();}
});

test('both languages retain all signs, atlas crops, and a single indexed batch',()=>{
  for(const lang of ['zh','en']) {
    const {data,paint,canvas}=fixture(lang);
    try {
      assert.equal(canvas.width,1024);assert.equal(canvas.height,1024);
      assert.equal(data.geometry.getAttribute('position').count,100);assert.equal(data.geometry.index.count/3,50);
      assert.equal(paint.filter(c=>c[0]==='text').length,50);
      assert.ok(paint.some(c=>c[1]===(lang==='zh'?'物资清点场':'INVENTORY YARD')));
      assert.ok(paint.some(c=>c[1]===(lang==='zh'?'前卷检验位':'Front coil')));
      for(const value of data.geometry.getAttribute('uv').array)assert.ok(value>=0&&value<=1);
      data.updateMoved(['coil-front']);
    } finally {data.dispose();}
  }
});

test('unmount releases the retained geometry, material and texture',()=>{
  const {data}=fixture(),disposed=[];
  for(const key of ['geometry','material','texture'])data[key].addEventListener('dispose',()=>disposed.push(key));
  data.updateMoved(['coil-front']);data.dispose();assert.deepEqual(disposed,['geometry','material','texture']);
});
