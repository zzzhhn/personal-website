import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Color,Group,Mesh,MeshStandardMaterial,PerspectiveCamera,Scene,Vector3,Vector4} from 'three';
import {ClubWaterCapture,applyPoolCaustics,clubWaterDebug,waterCaptureSize} from './WorldClubWaterCapture.ts';
import {clubWaterUniforms} from './WorldClubWaterShader.ts';

function fixture(budgeted=false){
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
  clubWaterDebug.enabled=true;clubWaterDebug.budgeted=budgeted;
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

test('budgeted captures suppress main-scene hooks, preserve underwater geometry, and restore reflection layers',()=>{
  const f=fixture(true),above=new Mesh(new BoxGeometry(),new MeshStandardMaterial()),guide=new Group(),body=new Mesh(new BoxGeometry(),new MeshStandardMaterial());
  above.position.set(68,5,55);f.club.add(above);guide.name='world-guide-G24';guide.position.set(68,1,55);guide.add(body);f.scene.add(guide);f.scene.updateMatrixWorld();
  let hooks=0;const hook=()=>hooks++;f.scene.onBeforeRender=hook;f.scene.onAfterRender=hook;
  const base=f.renderer.render;
  f.renderer.render=function(s,c){
    if(s===f.scene){s.onBeforeRender();s.onAfterRender();assert.ok(c.layers.test(body.layers));
      assert.equal(c.layers.test(above.layers),this.target.width===320,'above-water rigid mesh only appears in reflection');}
    if(s!==f.scene)assert.equal(s.children[0].geometry.index.count/3,8192);
    base.call(this,s,c);
  };
  f.capture.render(f.renderer,f.scene,f.camera,f.water,0,false,{now:0});
  assert.equal(hooks,0);assert.equal(f.scene.onBeforeRender,hook);assert.equal(f.scene.onAfterRender,hook);
  assert.equal(f.uniforms.uOptics.value,1);assert.deepEqual(clubWaterDebug.size,[640,400]);assert.equal(above.layers.mask,1);
  const projection=f.renderer.renders.find(r=>r.target.width===640).c.projectionMatrix;
  assert.notDeepEqual(projection.elements,f.camera.projectionMatrix.elements,'underwater refraction has an oblique clipping plane');
  const refractCamera=f.renderer.renders.find(r=>r.target.width===640).c;
  const clipY=y=>new Vector3(68,y,55).applyMatrix4(refractCamera.matrixWorldInverse).applyMatrix4(projection).z;
  assert.ok(clipY(1)<1&&clipY(1)>-1,'underwater floor remains inside the clipping range');
  assert.ok(clipY(2)<-1,'above-water surface lies before the oblique near plane');
  f.capture.dispose();above.geometry.dispose();above.material.dispose();body.geometry.dispose();body.material.dispose();
});

test('paused edits use the wall clock, stable and hidden frames do no additional work',()=>{
  const f=fixture(true),run=(time,now,flags={})=>f.capture.render(f.renderer,f.scene,f.camera,f.water,time,false,{now,...flags});
  run(0,0);run(.017,.017);assert.equal(f.renderer.renders.length,3);
  f.camera.position.x+=1;f.camera.updateMatrixWorld();run(.017,.018,{paused:true});
  const edited=f.renderer.renders.length;assert.equal(edited,5,'camera edit updates transmission and reflection without advancing animation');
  run(.017,1,{paused:true});const settled=f.renderer.renders.length;
  run(.017,2,{paused:true});assert.equal(f.renderer.renders.length,settled);
  f.uniforms.uNight.value=1;run(.017,2.001,{paused:true});assert.equal(f.renderer.renders.length,settled+3);
  run(3,3,{hidden:true});assert.equal(f.renderer.renders.length,settled+3);
  f.capture.dispose();
});

test('selection scans the island at most once per second and picks up streamed local children immediately',()=>{
  const f=fixture(true);for(let i=0;i<500;i++)f.excluded.add(new Group());
  const base=clubWaterDebug.totals.budgeted.visits;
  f.capture.render(f.renderer,f.scene,f.camera,f.water,0,false,{now:0});
  const first=clubWaterDebug.totals.budgeted.visits-base,late=new Mesh();f.club.add(late);
  let included=false;const render=f.renderer.render;f.renderer.render=function(s,c){if(s===f.scene)included ||= c.layers.test(late.layers);render.call(this,s,c);};
  const at=clubWaterDebug.totals.budgeted.visits;
  f.capture.render(f.renderer,f.scene,f.camera,f.water,.2,false,{now:.2});
  assert.ok(first>500);assert.ok(clubWaterDebug.totals.budgeted.visits-at<20);assert.ok(included);assert.equal(late.layers.mask,1);
  f.capture.dispose();
});

test('auxiliary failures restore hooks and repeated disconnect/connect cycles do not multiply resources',()=>{
  const baseline=clubWaterDebug.liveCaptures,f=fixture(true),hook=()=>{};f.scene.onBeforeRender=hook;
  const original=f.renderer.render;f.renderer.render=()=>{throw Error('failed');};
  assert.throws(()=>f.capture.render(f.renderer,f.scene,f.camera,f.water,0,false,{now:0}),/failed/);
  assert.equal(f.scene.onBeforeRender,hook);assert.equal(f.water.visible,true);assert.equal(f.basin.layers.mask,9);
  f.renderer.render=original;
  for(let i=0;i<5;i++){
    f.capture.dispose();f.capture.dispose();assert.equal(clubWaterDebug.liveCaptures,baseline);
    f.capture.connect();f.capture.render(f.renderer,f.scene,f.camera,f.water,i,false,{now:i});assert.equal(clubWaterDebug.liveCaptures,baseline+1);
  }
  f.capture.dispose();assert.equal(clubWaterDebug.liveCaptures,baseline);
});

test('paused daytime palette edits and intermediate night presets settle correctly, including quality changes',()=>{
  const f=fixture(true),run=(now,high=false,lightingSettled=true)=>f.capture.render(f.renderer,f.scene,f.camera,f.water,0,high,{now,paused:true,lightingSettled});
  run(0);f.uniforms.uWaterSkyTop.value.set('#ffffff');run(.001,false,false);
  assert.equal(f.renderer.renders.length,3,'transition stays capped despite a constant night amount');
  run(.002);assert.equal(f.renderer.renders.length,6,'final daytime palette gets a capture before sleeping');
  f.uniforms.uNight.value=.72;run(.003);assert.equal(f.renderer.renders.length,9,'evening preset does not require night to reach zero or one');
  run(.004,true);assert.deepEqual(clubWaterDebug.size,[1024,640]);assert.equal(f.renderer.renders.length,12);
  run(5,true);assert.equal(f.renderer.renders.length,12);f.capture.dispose();
});

test('tiny projected pools skip captures and baseline mode restores original target budgets',()=>{
  const f=fixture(true);f.capture.render(f.renderer,f.scene,f.camera,f.water,0,false,{now:0});
  f.water.geometry=new BoxGeometry(.001,.001,.001);f.water.position.set(68,1.35,55);f.water.updateMatrixWorld();
  f.capture.render(f.renderer,f.scene,f.camera,f.water,1,false,{now:1});assert.equal(f.renderer.renders.length,3);
  assert.ok(clubWaterDebug.coverage<.001);clubWaterDebug.budgeted=false;
  f.capture.render(f.renderer,f.scene,f.camera,f.water,1,false,{now:1});assert.deepEqual(clubWaterDebug.size,[768,480]);assert.equal(f.renderer.renders.length,6);
  f.capture.dispose();f.water.geometry.dispose();
});
