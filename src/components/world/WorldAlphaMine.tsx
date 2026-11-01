import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { CanvasTexture, Color, FileLoader, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, Vector3 } from 'three';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ALPHA_FACTORS, type AlphaFactorId } from './alpha-mine-data';
import { ALPHA_MINE_ORIGIN, mineLocalToWorld } from './alpha-mine-layout';
import { beginMineAction, cancelMineAction, mineActor, mineCanReach, mineNotice, resetMineVeins, useAlphaMineStore, type MinePoint } from './alpha-mine-state';
import { useMineManifest, type MineManifest } from './alpha-mine-assets';
import { releaseMineOnline, requestMineBacktest, useMineOnline } from './alpha-mine-online';
import WorldMinePool from './WorldMinePool';
import { factorOreSource } from './alpha-mine-ore';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { parkAudio } from './WorldParkAudio';
import WorldAlphaMineFoundation from './WorldAlphaMineFoundation';
import { mineSurfaceMaterial } from './WorldMineMaterial';
import { createPoolWaterMaterial } from './WorldPoolWater';
import { waterContacts } from './WorldWaterInteraction';
import { night } from './WorldNight';
import { windUniforms } from './WorldWind';
import type { WorldContent } from './types';

const jsonLoader = (loader: FileLoader<unknown>) => { loader.setResponseType('json'); };
const oreFactor = (id: AlphaFactorId) => ALPHA_FACTORS.find(f => f.id === id)!;
function cloneVisual(source: Object3D) {
  const root = source.clone(true);
  root.traverse(o => { if (o instanceof Mesh) {
    o.castShadow = true; o.receiveShadow = true;
    o.userData = /floor|deck|ramp|surface/i.test(o.name) ? { surface:true, assetId:'alpha-mine' } : { solid:true, occluder:true, assetId:'alpha-mine' };
  } });
  return root;
}
function useOre(source: Object3D, id: AlphaFactorId) {
  const object = useMemo(() => {
    const root = cloneVisual(factorOreSource(source,id));
    root.position.set(0,0,0);
    root.traverse(o => { if (o instanceof Mesh && !Array.isArray(o.material)) {
      const mat = (o.material as MeshStandardMaterial).clone();
      if (mat.name === 'ore_mineral') mat.color.set(oreFactor(id).color);
      o.material = mat;
    } });
    return root;
  }, [source,id]);
  useEffect(() => () => object.traverse(o => { if (o instanceof Mesh && !Array.isArray(o.material)) o.material.dispose(); }), [object]);
  return object;
}

function MineVein({ manifest, index, source, ore }: { manifest: MineManifest; index: number; source: Object3D; ore: Object3D }) {
  const m = manifest.veins[index], factor = ALPHA_FACTORS[index], s = useAlphaMineStore(), v = s.veins[factor.id];
  const visual=useMemo(()=>{
    const root=cloneVisual(source),materials=new Map<MeshStandardMaterial,MeshStandardMaterial>(),mineral:{material:MeshStandardMaterial;color:MeshStandardMaterial['color']}[]=[];
    root.traverse(o=>{if(o instanceof Mesh&&!Array.isArray(o.material)&&o.material instanceof MeshStandardMaterial){
      const authored=o.material;
      if(!materials.has(authored)){
        const copy=/AM_vein_host/.test(authored.name)?mineSurfaceMaterial(authored,m.socket):authored.clone();
        materials.set(authored,copy);
        if(/AM_mineral_/.test(authored.name))mineral.push({material:copy,color:authored.color.clone()});
      }
      o.material=materials.get(authored)!;
    }});
    return {root,materials:[...materials.values()],mineral};
  },[source,m.socket]);
  const root=visual.root;
  useEffect(()=>()=>visual.materials.forEach(m=>m.dispose()),[visual]);
  useEffect(()=>{for(const slot of visual.mineral){
    // A continuous, quiet seam is visible before scanning; its productive pocket
    // gains its identity colour only after the detector has identified it.
    slot.material.color.copy(slot.color);
    if(!v.revealed)slot.material.color.lerp(new Color('#92917e'),.90);
  }},[visual,v.revealed]);
  const rock = useOre(ore,factor.id);
  const activeState=v.hits>=3?'open':v.hits>0?'cracked':'intact';
  const contract=manifest.dynamicAssets.veins.roots[m.id], stateNames=contract.states;
  const socket=useMemo(()=>{
    root.updateWorldMatrix(true,true);
    const node=root.getObjectByName(contract.stateImpactSockets[activeState]);
    if(!node) throw new Error(`Missing mine contact socket: ${m.id} ${activeState}`);
    const local=root.worldToLocal(node.getWorldPosition(new Vector3()));
    return mineLocalToWorld([m.socket[0]+local.x,m.socket[1]+local.y,m.socket[2]+local.z]);
  },[root,contract,m,activeState]);
  const oreRest=mineLocalToWorld(m.oreRest);
  useEffect(() => {
    for (const [name,node] of Object.entries(stateNames)) { const o=root.getObjectByName(node); if(o) o.visible=name===(v.hits>=3?'open':v.hits>0?'cracked':'intact'); }
  }, [root,stateNames,v.hits]);
  const depleted = v.hits >= 3, target = depleted ? oreRest : socket;
  useInteractable({ id:`alpha-mine-${m.id}`, position:target, radius:depleted?.78:v.revealed?1.3:2.1, kind:'exhibit',
    label: depleted ? { zh:`拾起${factor.label}`, en:`Pick up ${factor.labelEn}` } : !s.equipped ? {zh:'先在入口取工具',en:'Collect the tools at the entrance'} : !v.revealed ? {zh:'辨认这条矿线',en:'Read this seam'} : {zh:`挥镐 · ${v.hits}/3`,en:`Chip the seam · ${v.hits}/3`},
    enabled: () => !useAlphaMineStore.getState().carried && !useAlphaMineStore.getState().veins[factor.id].collected && mineCanReach(target, depleted?.8:v.revealed?1.35:2.2),
    onInteract: () => {
      if (!s.equipped) { mineNotice('工具在入口左边的架上。','The tool rack is on the left of the entrance.'); return; }
      beginMineAction(depleted?'pickup':v.revealed?'strike':'scan',target,factor.id);
    },
  });
  return <group name={`alpha-mine-${m.id}`}>
    <group position={m.socket}><primitive object={root} /></group>
    {depleted && !v.collected && <group position={m.oreRest}><primitive object={rock} /></group>}
  </group>;
}

function MineRack({ manifest, detector, pickaxe }: { manifest: MineManifest; detector: Object3D; pickaxe: Object3D }) {
  const equipped = useAlphaMineStore(s=>s.equipped);
  const tools = useMemo(() => [cloneVisual(detector),cloneVisual(pickaxe)], [detector,pickaxe]);
  const target=useMemo(()=>{
    detector.updateWorldMatrix(true,true);
    const node=detector.getObjectByName('grip_R');
    const grip=node ? detector.worldToLocal(node.getWorldPosition(new Vector3())) : new Vector3();
    const p=manifest.toolRack.detectorSocket;
    return mineLocalToWorld([p[0]+grip.x,p[1]+grip.y,p[2]+grip.z]);
  },[detector,manifest]);
  useInteractable({ id:'alpha-mine-tools',position:target,radius:.85,kind:'exhibit',
    label:equipped?{zh:'开始新一轮勘探',en:'Begin a fresh exploration'}:{zh:'取探测器和镐',en:'Collect detector & pickaxe'},
    onInteract:()=>{ if(equipped) resetMineVeins(); else { parkAudio.cue('scan',.35); beginMineAction('equip',target); } },
  });
  return !equipped ? <>{tools.map((o,i)=><group key={i} position={i?manifest.toolRack.pickaxeSocket:manifest.toolRack.detectorSocket}><primitive object={o}/></group>)}</> : null;
}

function poolShelf(manifest: MineManifest, index: number): MinePoint {
  return [manifest.basin.center[0]+(index-1)*.85,.77,manifest.basin.center[2]+4.6];
}
function PoolShelf({ manifest, index, ore }: { manifest: MineManifest; index: number; ore: Object3D }) {
  const factor=ALPHA_FACTORS[index], recovered=useAlphaMineStore(s=>s.recovered.includes(factor.id));
  const anchor=poolShelf(manifest,index), rock=useOre(ore,factor.id);
  useInteractable({id:`alpha-mine-recovery-${index}`,position:mineLocalToWorld(anchor),radius:.78,kind:'exhibit',
    label:{zh:`取回${factor.label}`,en:`Retrieve ${factor.labelEn}`},enabled:()=>useAlphaMineStore.getState().recovered.includes(factor.id)&&!useAlphaMineStore.getState().carried,
    onInteract:()=>beginMineAction('pickup',mineLocalToWorld(anchor),factor.id),
  });
  return <group>
    <mesh position={[anchor[0],.3,anchor[2]]} castShadow receiveShadow><boxGeometry args={[.7,.6,.55]}/><meshStandardMaterial color="#70634d" roughness={.9}/></mesh>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,interactable:`alpha-mine-recovery-${index}`}}><CuboidCollider args={[.35,.3,.275]} position={[anchor[0],.3,anchor[2]]}/></RigidBody>
    {recovered&&<group position={anchor}><primitive object={rock}/></group>}
  </group>;
}
function PoolBay({ manifest, bay }: { manifest: MineManifest; bay: 0|1 }) {
  const carried=useAlphaMineStore(s=>s.carried), basin=manifest.basin, offset=bay===0?-1.15:1.15;
  const factorId=useAlphaMineStore(s=>s.bays[bay]);
  const status=useMineOnline(s=>factorId?s.factors[factorId].status:'idle');
  const anchor: MinePoint=[basin.center[0]+offset,.83,basin.center[2]+3.35];
  const target=mineLocalToWorld([basin.impact[0]+offset*.45,basin.waterY,basin.impact[2]]);
  useInteractable({id:`alpha-mine-pool-${bay}`,position:mineLocalToWorld(anchor),radius:1.2,kind:'exhibit',
    label:carried?{zh:`投入 ${bay?'B':'A'} 位 · 替换此处结果`,en:`Cast into ${bay?'B':'A'} · replace this result`}:status==='ready'?{zh:'检视回测池',en:'Inspect results'}:status==='error'?{zh:'重试这块矿石的回测',en:'Retry this ore’s backtest'}:status==='loading'?{zh:'矿石正在回测',en:'Backtest in progress'}:{zh:'带一块矿石来试试',en:'Bring an ore to test'},
    onInteract:()=>{const s=useAlphaMineStore.getState(),id=s.carried,existing=s.bays[bay];
      if(id)beginMineAction('deposit',target,id,bay);
      else if(existing&&useMineOnline.getState().factors[existing].status==='ready'){
        useAlphaMineStore.setState({selectedBay:bay});useWorldStore.setState({poolInspect:true});
      }
      else if(existing&&useMineOnline.getState().factors[existing].status==='error')void requestMineBacktest(existing,true);
      else if(existing)mineNotice('矿石仍在池中，正在等待线上回测。','Your ore is in the pool; the online calculation is pending.');
      else mineNotice('先采出矿石，或从池边回收台取一块。','Mine an ore, or retrieve one from a pool shelf.');},
  });
  return <group name={`alpha-mine-pool-marker-${bay}`} position={anchor}>
    <mesh position={[0,-.46,0]} castShadow><boxGeometry args={[.08,.74,.08]}/><meshStandardMaterial color="#75664d" roughness={.8}/></mesh>
    <mesh rotation={[-.25,0,0]} castShadow><boxGeometry args={[.48,.36,.07]}/><meshStandardMaterial color="#9c855c" metalness={.45} roughness={.48}/></mesh>
    <PoolLetter letter={bay?'B':'A'}/>
  </group>;
}
function PoolLetter({letter}:{letter:string}) {
  const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#c5b48b';ctx.fillRect(0,0,128,128);ctx.fillStyle='#253e39';ctx.textAlign='center';ctx.font='600 85px Georgia';ctx.fillText(letter,64,94);
    const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;},[letter]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={[0,0,.041]} rotation={[-.25,0,0]}><planeGeometry args={[.4,.3]}/><meshStandardMaterial map={texture} roughness={.82}/></mesh>;
}

function MineLooseOre({ source }: { source: Object3D }) {
  const s=useAlphaMineStore(), holder=useRef<Group>(null);
  const id=s.action?.kind==='deposit'?s.action.factorId:s.dropped?.factorId;
  const rock=useOre(source,id ?? 'REVERSAL_5');
  useInteractable(s.dropped?{id:'alpha-mine-dropped',position:s.dropped.position,radius:.8,kind:'exhibit',label:{zh:'拾回矿石',en:'Retrieve the ore'},onInteract:()=>{
    const drop=useAlphaMineStore.getState().dropped; if(drop) beginMineAction('pickup',drop.position,drop.factorId);
  }}:null);
  useFrame(()=>{
    const group=holder.current; if(!group) return;
    const now=useAlphaMineStore.getState(), a=now.action;
    if(a?.kind==='deposit' && a.contact) {
      const t=Math.max(0,Math.min(1,(a.elapsed-.48)/(a.duration-.48)));
      group.visible=true;
      group.position.set(a.origin[0]+(a.target[0]-a.origin[0])*t-ALPHA_MINE_ORIGIN[0],a.origin[1]+(a.target[1]-a.origin[1])*t+(a.bay===undefined?.1:1.25)*Math.sin(Math.PI*t)-ALPHA_MINE_ORIGIN[1],a.origin[2]+(a.target[2]-a.origin[2])*t-ALPHA_MINE_ORIGIN[2]);
      group.rotation.set(t*2.4,t*1.3,0);
    } else if(now.dropped) {
      group.visible=true; group.position.set(now.dropped.position[0]-ALPHA_MINE_ORIGIN[0],now.dropped.position[1]-ALPHA_MINE_ORIGIN[1],now.dropped.position[2]-ALPHA_MINE_ORIGIN[2]); group.rotation.set(0,0,0);
    } else group.visible=false;
  });
  return <group ref={holder} visible={false}><primitive object={rock}/></group>;
}

function MineInformation({ experienceId }: { experienceId?: string }) {
  useInteractable(experienceId?{id:'alpha-mine-experience',position:mineLocalToWorld([5.8,1,-1.9]),radius:1.5,kind:'sign',label:{zh:'WorldQuant BRAIN · 实习经历',en:'WorldQuant BRAIN · experience'},onInteract:()=>useWorldStore.setState({card:{kind:'experience',id:experienceId}})}:null);
  const zh=useWorldStore(s=>s.lang)==='zh';
  return <MineSign position={[5.8,0,-1.9]} title="WORLDQUANT BRAIN" detail={zh?'因子勘探 · 研究经历':'Factor quarry · research experience'} />;
}

function MineSign({ position, title, detail }: { position: MinePoint; title: string; detail: string }) {
  const texture=useMemo(()=>{
    const c=document.createElement('canvas'); c.width=512;c.height=192;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#e5dcc7';ctx.fillRect(0,0,512,192);ctx.fillStyle='#2b3d38';ctx.textAlign='center';
    ctx.font='600 32px Geist, sans-serif';ctx.fillText(title,256,78);ctx.font='24px "Songti SC", serif';ctx.fillText(detail,256,131);
    const tex=new CanvasTexture(c);tex.colorSpace=SRGBColorSpace;return tex;
  },[title,detail]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <group position={position}><mesh position={[0,.45,0]} castShadow><boxGeometry args={[.12,.9,.12]}/><meshStandardMaterial color="#675a46" roughness={.85}/></mesh><group position={[0,.95,0]} rotation={[-.12,0,0]}>
    <mesh castShadow><boxGeometry args={[1.8,.68,.12]}/><meshStandardMaterial color="#6f6148" roughness={.85}/></mesh>
    <mesh position={[0,0,.065]}><planeGeometry args={[1.66,.58]}/><meshStandardMaterial map={texture} roughness={.9}/></mesh>
  </group><RigidBody type="fixed" colliders={false} userData={{solid:true,interactable:'alpha-mine-sign'}}><CuboidCollider args={[.06,.45,.06]} position={[0,.45,0]}/><CuboidCollider args={[.9,.34,.06]} position={[0,.95,0]} rotation={[-.12,0,0]}/></RigidBody></group>;
}

function MineEffects() {
  const mesh=useRef<InstancedMesh>(null), age=useRef(2), seq=useRef(0), effect=useRef<ReturnType<typeof useAlphaMineStore.getState>['effect']>(null);
  const dummy=useMemo(()=>new Object3D(),[]);
  useFrame((_,delta)=>{
    const target=mesh.current, s=useWorldStore.getState();if(!target||s.paused||s.card||s.poolInspect||document.hidden)return;
    const next=useAlphaMineStore.getState().effect;
    if(next && next.seq!==seq.current){
      effect.current=next;seq.current=next.seq;age.current=0;(target.material as MeshStandardMaterial).color.set(next.kind==='splash'?'#a8d1c5':oreFactor(next.factorId).color);parkAudio.cue(next.kind==='splash'?'splash':'strike',.7);
      if(next.kind==='splash')waterContacts.emit({x:next.at[0],y:next.at[1],z:next.at[2],at:windUniforms.uWindTime.value,strength:.85,radius:.08,splash:.55});
    }
    age.current+=Math.min(.05,delta); const e=effect.current;
    target.visible=!!e&&age.current<.7;if(!target.visible||!e)return;
    const t=age.current;
    for(let i=0;i<14;i++){
      const angle=i*2.39996, speed=.35+(i%4)*.17;
      dummy.position.set(e.at[0]-ALPHA_MINE_ORIGIN[0]+Math.cos(angle)*speed*t,e.at[1]-ALPHA_MINE_ORIGIN[1]+(.6+(i%3)*.18)*t-2*t*t,e.at[2]-ALPHA_MINE_ORIGIN[2]+Math.sin(angle)*speed*t);
      dummy.scale.setScalar((1-t/.7)*(e.kind==='splash'?.6:1));dummy.rotation.set(i+t*2,i*.3,t);dummy.updateMatrix();target.setMatrixAt(i,dummy.matrix);
    }target.instanceMatrix.needsUpdate=true;
  });
  return <instancedMesh ref={mesh} args={[undefined,undefined,14]} visible={false} frustumCulled={false}><icosahedronGeometry args={[.045,0]}/><meshStandardMaterial color="#aeab8e" roughness={.82}/></instancedMesh>;
}

type Proxy = { vertices:number[];indices:number[] };
function MineWater({basin}:{basin:MineManifest['basin']}) {
  const material=useMemo(()=>createPoolWaterMaterial(ALPHA_MINE_ORIGIN[1]+basin.waterY),[basin.waterY]);
  useEffect(()=>()=>material.dispose(),[material]);
  useFrame(()=>{material.uniforms.uNight.value=night.value;});
  return <mesh position={[basin.center[0],basin.waterY,basin.center[2]]} rotation={[-Math.PI/2,0,0]}>
    <circleGeometry args={[basin.innerRadius,64]}/><primitive object={material} attach="material"/>
  </mesh>;
}
function MineAssets({ content }: { content: WorldContent }) {
  const manifest=useLoader(FileLoader,'/world/alpha-mine/layout.json',jsonLoader) as unknown as MineManifest;
  const proxy=useLoader(FileLoader,manifest.collisionAsset,jsonLoader) as unknown as {surface:Proxy;solid:Proxy};
  const gltfs=useLoader(GLTFLoader,[manifest.staticAsset,manifest.dynamicAssets.veins.url,manifest.dynamicAssets.ore.url,manifest.dynamicAssets.detector.url,manifest.dynamicAssets.pickaxe.url],withWorldAssetDecoder) as GLTF[];
  const scene=useMemo(()=>{
    const root=cloneVisual(gltfs[0].scene),materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
    root.traverse(o=>{if(o instanceof Mesh&&!Array.isArray(o.material)&&o.material instanceof MeshStandardMaterial&&/AM_(ground|stone|wood)/.test(o.material.name)){
      if(!materials.has(o.material))materials.set(o.material,mineSurfaceMaterial(o.material));
      o.material=materials.get(o.material)!;
    }});
    return {root,materials:[...materials.values()]};
  },[gltfs]);
  useEffect(()=>()=>scene.materials.forEach(m=>m.dispose()),[scene]);
  const colliders=useMemo(()=>Object.fromEntries(Object.entries(proxy).map(([k,p])=>[k,{vertices:new Float32Array(p.vertices),indices:new Uint32Array(p.indices)}])) as Record<'surface'|'solid',{vertices:Float32Array;indices:Uint32Array}>,[proxy]);
  const ore=gltfs[2].scene.getObjectByName(manifest.dynamicAssets.ore.root)!;
  const detector=gltfs[3].scene.getObjectByName(manifest.dynamicAssets.detector.root)!;
  const pickaxe=gltfs[4].scene.getObjectByName(manifest.dynamicAssets.pickaxe.root)!;
  const experience=content.experiences.en.find(v=>/worldquant/i.test(v.organization));
  useEffect(()=>{useMineManifest.setState({manifest});return()=>useMineManifest.setState({manifest:null});},[manifest]);
  const signalClock=useRef(0);
  useFrame((_,delta)=>{
    const w=useWorldStore.getState(),s=useAlphaMineStore.getState();
    const rests=[...manifest.veins.filter((v,i)=>s.veins[ALPHA_FACTORS[i].id].collected).map(v=>v.oreRest),...ALPHA_FACTORS.flatMap((f,i)=>s.recovered.includes(f.id)?[]:[poolShelf(manifest,i)])].map(mineLocalToWorld);
    mineActor.restTarget=rests.find(p=>mineCanReach(p,.8))??null;
    if(w.paused||w.card||w.poolInspect||document.hidden||!s.equipped||s.carried||s.action||!mineActor.available)return;
    let near=Infinity;
    for(let i=0;i<manifest.veins.length;i++){
      if(s.veins[ALPHA_FACTORS[i].id].collected)continue;
      const p=mineLocalToWorld(manifest.veins[i].socket),d=Math.hypot(p[0]-mineActor.position[0],(p[1]-mineActor.position[1])*2,p[2]-mineActor.position[2]);near=Math.min(near,d);
    }
    if(near>12)return;signalClock.current+=Math.min(.05,delta);
    if(signalClock.current>.45+near*.07){signalClock.current=0;parkAudio.cue('scan',.08+(1-near/12)*.14);}
  });
  return <group name="alpha-mine-attraction" position={ALPHA_MINE_ORIGIN}>
    <primitive object={scene.root}/>
    {(['surface','solid'] as const).map(kind=><RigidBody key={kind} name={`alpha-mine-${kind}`} type="fixed" colliders={false} userData={{[kind]:true,assetId:'alpha-mine'}}><TrimeshCollider args={[colliders[kind].vertices,colliders[kind].indices]} friction={.9} restitution={0}/></RigidBody>)}
    <MineRack manifest={manifest} detector={detector} pickaxe={pickaxe}/>
    {manifest.veins.map((v,i)=><MineVein key={v.id} manifest={manifest} index={i} source={gltfs[1].scene.getObjectByName(v.id)!} ore={ore}/>)}
    <MineWater basin={manifest.basin}/>
    <PoolBay manifest={manifest} bay={0}/><PoolBay manifest={manifest} bay={1}/>{ALPHA_FACTORS.map((f,i)=><PoolShelf key={f.id} manifest={manifest} index={i} ore={ore}/>)}<WorldMinePool manifest={manifest}/>
    <MineLooseOre source={ore}/><MineEffects/><MineInformation experienceId={experience?.startDate}/>
    <MineSign position={[3.8,0,-.6]} title="THE FACTOR QUARRY" detail="WORLDQUANT BRAIN"/>
  </group>;
}

class MineGuard extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.error('[alpha-mine] asset loading failed',error);mineNotice('矿场资源暂未加载完成，请刷新后再试。','Mine assets failed to load. Refresh to try again.');}
  render(){return this.state.failed?null:this.props.children;}
}
export default function WorldAlphaMine({content}:{content:WorldContent}) {
  useEffect(()=>{
    const release=parkAudio.retain();
    const unsubscribe=useWorldStore.subscribe((s,p)=>{if((s.paused&&!p.paused)||(s.card&&!p.card)||(s.poolInspect&&!p.poolInspect)||s.activeVehicle)cancelMineAction();});
    return()=>{release();unsubscribe();cancelMineAction();releaseMineOnline();mineActor.available=false;};
  },[]);
  return <><WorldAlphaMineFoundation/><MineGuard><Suspense fallback={null}><MineAssets content={content}/></Suspense></MineGuard></>;
}
