import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Color,Group,Mesh,MeshStandardMaterial,PerspectiveCamera,Scene,Vector4} from 'three';
import {ClubWaterCapture,applyPoolCaustics,clubWaterDebug,waterCaptureSize} from './WorldClubWaterCapture.ts';
import {clubWaterUniforms} from './WorldClubWaterShader.ts';

function fixture(){
  const scene=new Scene(),club=new Group(),excluded=new Mesh(),water=new Mesh(),basin=new Mesh();club.name='djc-beach-club';
  scene.add(club,excluded);club.add(water,basin);basin.layers.enable(3);
  const camera=new PerspectiveCamera(50,1.6,.1,600);camera.position.set(68,7,35);camera.lookAt(68,1.35,55);camera.updateMatrixWorld();scene.updateMatrixWorld();
  const uniforms=clubWaterUniforms(),capture=new ClubWaterCapture(uniforms),background=new Color('#abbccd');scene.background=background;
  const renderer={target:null,color:new Color('#102030'),alpha:.8,viewport:new Vector4(1,2,800,500),scissor:new Vector4(3,4,500,300),scissorTest:true,
    shadowMap:{autoUpdate:true,needsUpdate:true},xr:{enabled:false},autoClear:false,info:{autoReset:true,render:{calls:0,triangles:0}},renders:[],
    getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},getClearAlpha(){return this.alpha;},
    getClearColor(c){return c.copy(this.color);},setClearColor(c,a){this.color.set(c);this.alpha=a;},
    getViewport(v){return v.copy(this.viewport);},setViewport(v){this.viewport.copy(v);},
    getScissor(v){return v.copy(this.scissor);},setScissor(v){this.scissor.copy(v);},
    getScissorTest(){return this.scissorTest;},setScissorTest(v){this.scissorTest=v;},getSize(v){return v.set(800,500);},
    state:{buffers:{depth:{setMask(){}}}},clear(){},
    render(s,c){assert.equal(this.shadowMap.autoUpdate,false);assert.equal(this.shadowMap.needsUpdate,false);
      if(s===scene){assert.equal(water.visible,false);assert.ok(c.layers.test(basin.layers));assert.ok(!c.layers.test(excluded.layers));}
      this.renders.push({s,c,target:this.target});this.info.render.calls++;this.info.render.triangles+=20;},
  };
  clubWaterDebug.enabled=true;
  return{scene,club,excluded,water,basin,camera,uniforms,capture,renderer,background};
}
test('pool captures only local objects, reuses targets, caps updates and freezes while paused',()=>{
  const f=fixture(),run=t=>f.capture.render(f.renderer,f.scene,f.camera,f.water,t,false);
  run(0);assert.equal(f.renderer.renders.length,3);assert.equal(f.uniforms.uOptics.value,1);
  const targets=f.renderer.renders.map(r=>r.target);
  run(.01);assert.equal(f.renderer.renders.length,3);
  run(.06);assert.equal(f.renderer.renders.length,5,'reflection has its own lower rate');
  run(.06);assert.equal(f.renderer.renders.length,5,'paused demand frames do not recapture');
  f.uniforms.uNight.value=1;run(.06);assert.equal(f.renderer.renders.length,8,'one demand capture after a lighting edit');
  assert.equal(f.renderer.renders[5].target,targets[0]);assert.equal(f.renderer.renders[6].target,targets[1]);
  assert.equal(f.basin.layers.mask,1|8);assert.equal(f.scene.background,f.background);
  assert.equal(f.renderer.target,null);assert.equal(f.renderer.alpha,.8);assert.equal(f.renderer.autoClear,false);
  assert.equal(f.renderer.shadowMap.autoUpdate,true);assert.equal(f.renderer.shadowMap.needsUpdate,true);
  f.camera.position.set(500,7,500);f.camera.updateMatrixWorld();run(1);assert.equal(f.uniforms.uOptics.value,0);assert.equal(f.renderer.renders.length,8);
  f.capture.dispose();
});
test('a failed auxiliary render restores the main renderer, object visibility and all layers',()=>{
  const f=fixture(),before=f.renderer.viewport.clone();f.renderer.render=()=>{throw new Error('capture failed');};
  assert.throws(()=>f.capture.render(f.renderer,f.scene,f.camera,f.water,0,false),/capture failed/);
  assert.equal(f.water.visible,true);assert.equal(f.scene.background,f.background);assert.equal(f.basin.layers.mask,9);
  assert.equal(f.renderer.shadowMap.autoUpdate,true);assert.equal(f.renderer.shadowMap.needsUpdate,true);assert.equal(f.renderer.info.autoReset,true);
  assert.equal(f.renderer.scissorTest,true);assert.ok(f.renderer.viewport.equals(before));assert.equal(f.renderer.target,null);
  f.capture.dispose();
});
test('capture target budgets remain bounded in portrait and ultrawide windows',()=>{
  for(const aspect of [.25,.5,1,16/9,4])for(const high of [false,true]){
    const [w,h]=waterCaptureSize(aspect,high);assert.ok(w<=1024&&h<=1024&&h>=128);assert.equal(w,high?1024:768);
  }
});
test('basin material patch preserves and restores the existing compile hook',()=>{
  const material=new MeshStandardMaterial();let count=0;const original=()=>count++;material.onBeforeCompile=original;
  const restore=applyPoolCaustics(material,clubWaterUniforms());
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
  material.onBeforeCompile(shader,{});assert.equal(count,1);assert.ok(shader.uniforms.uCaustics);
  restore();assert.equal(material.onBeforeCompile,original);material.dispose();
});
