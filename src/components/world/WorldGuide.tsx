import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, SkinnedMesh, Vector3, type AnimationAction, type Bone, type Group, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useWorldStore } from './store';
import { GuideStopStep } from './WorldGuideStop';
import { GuidePhaseModel, PhaseGate } from './WorldGuidePhase';

export interface WorldGuideMotion { speedMps: number; grounded: boolean; facing: number; targetSpeedMps?: number }
export interface WorldGuideProps extends WorldGuideMotion { visible: boolean; readMotion?: () => WorldGuideMotion; fallback?: ReactNode }
let decoder: DRACOLoader | null = null;
const withDecoder = (loader: GLTFLoader) => {
  decoder ??= new DRACOLoader().setDecoderPath('/assets/world/draco/');
  loader.setDRACOLoader(decoder);
};
let readActor: (() => Record<string, unknown>) | null = null;
export const worldGuideDebug = () => readActor?.() ?? { moving: false, running: false, airborne: false, animation: null, animationTime: null, loaded: false };

class GuideBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[world-guide] G24 could not load', error); }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children; }
}

function guideFeet(scene: Object3D) {
  const feet = new Map<'left' | 'right', Bone>();
  scene.traverse(o => { if (o instanceof SkinnedMesh) for (const bone of o.skeleton.bones) {
    if (/^foot[._]?L$/.test(bone.name)) feet.set('left', bone);
    if (/^foot[._]?R$/.test(bone.name)) feet.set('right', bone);
  } });
  return feet;
}

function GuideModel({ speedMps: initialSpeed, grounded: initialGrounded, visible, facing: initialFacing, readMotion }: WorldGuideProps) {
  const gltf = useLoader(GLTFLoader, '/assets/world/guide/G24.glb', withDecoder) as GLTF;
  const group = useRef<Group>(null);
  const stop = useRef<GuideStopStep | null>(null);
  const rig = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const soles: { mesh: SkinnedMesh; indices: number[] }[] = [];
    scene.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return;
      const joints=o.geometry.getAttribute('skinIndex'), weights=o.geometry.getAttribute('skinWeight');
      if(!joints||!weights)return;
      const indices:number[]=[];
      for(let i=0;i<joints.count;i++) {
        const ids=[joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)];
        const ws=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
        if(ids.reduce((sum,id,k)=>sum+(/^foot[._]?[LR]$/.test(o.skeleton.bones[id]?.name??'')?ws[k]:0),0)>.98)indices.push(i);
      }
      if(indices.length)soles.push({mesh:o,indices});
    });
    const mixer = new AnimationMixer(scene);
    const actions = Object.fromEntries(gltf.animations.map(clip => {
      const action = mixer.clipAction(clip);
      const once = clip.name === 'Jump' || clip.name === 'Land';
      action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      return [clip.name, action];
    })) as Record<string, AnimationAction>;
    for (const name of ['Idle', 'Walk', 'Run', 'Jump', 'Land']) if (!actions[name]) throw new Error(`G24 missing ${name} animation`);
    actions.Idle.play();
    const feet = guideFeet(scene);
    const probe = clone(gltf.scene), probeFeet = guideFeet(probe), probeMixer = new AnimationMixer(probe);
    const probeSoles: {mesh:SkinnedMesh; index:number; side:'left'|'right'}[]=[];
    probe.traverse(o=>{if(o instanceof SkinnedMesh){
      const joints=o.geometry.getAttribute('skinIndex'),weights=o.geometry.getAttribute('skinWeight');
      if(!joints||!weights)return;
      for(let i=0;i<joints.count;i++)for(const side of ['left','right'] as const){
        const ids=[joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)];
        const ws=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
        const name=side==='left'?/^foot[._]?L$/:/^foot[._]?R$/;
        if(ids.reduce((sum,id,k)=>sum+(name.test(o.skeleton.bones[id]?.name??'')?ws[k]:0),0)>.98)
          probeSoles.push({mesh:o,index:i,side});
      }
    }});
    const phaseSamples: Record<string, { time: number; left: Vector3; right: Vector3; soleMin:Record<'left'|'right',number> }[]> = {};
    const durations: Record<string, number> = {};
    const soleProbe=new Vector3();
    for (const name of ['Walk', 'Run']) {
      const clip = gltf.animations.find(c => c.name === name)!;
      durations[name] = clip.duration;
      probeMixer.stopAllAction(); probeMixer.clipAction(clip).reset().play();
      phaseSamples[name] = [];
      for (let i = 0; i < 72; i++) {
        const time = clip.duration * i / 72;
        probeMixer.setTime(time); probe.updateMatrixWorld(true);
        const left = probe.worldToLocal(probeFeet.get('left')!.getWorldPosition(new Vector3()));
        const right = probe.worldToLocal(probeFeet.get('right')!.getWorldPosition(new Vector3()));
        const soleMin={left:Infinity,right:Infinity};
        for(const {mesh,index,side} of probeSoles){
          mesh.skeleton.update();soleProbe.fromBufferAttribute(mesh.geometry.getAttribute('position'),index);
          mesh.applyBoneTransform(index,soleProbe);soleProbe.applyMatrix4(mesh.matrixWorld);probe.worldToLocal(soleProbe);
          soleMin[side]=Math.min(soleMin[side],soleProbe.y);
        }
        phaseSamples[name].push({ time, left, right, soleMin });
      }
    }
    probeMixer.stopAllAction(); probeMixer.uncacheRoot(probe);
    const query = new URLSearchParams(window.location.search);
    const phase = query.get('qa') === '1' && query.get('qaPhase') === '1'
      ? GuidePhaseModel.fromGLTF(gltf, { authoredSpeed:{ Walk:1.5, Run:4.2 } }) : null;
    return { scene, mixer, actions, soles, feet, phaseSamples, durations, phase, gate:new PhaseGate(.4),
      solePoint:new Vector3(), rootPoint:new Vector3(), motionPoint:new Vector3(), previousMotionPoint:new Vector3(), hasMotionSample:false };
  }, [gltf]);
  const state = useRef({ current: 'Idle', speed: 0, grounded: initialGrounded, visible, airSeconds: 0, landing: 0, time: 0,
    pending: '', pendingTime: 0, phaseGateTimeouts: 0 });
  useEffect(() => () => { rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene); }, [rig]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('qa') !== '1' || query.get('qaStop') !== '1' || !group.current) return;
    const candidate = new GuideStopStep(rig.scene, gltf, { anchor: group.current });
    stop.current = candidate;
    return () => { candidate.dispose(); if (stop.current === candidate) stop.current = null; };
  }, [rig, gltf]);
  useEffect(() => {
    const v = new Vector3();
    const read = () => {
      const s = state.current;
      const soles: Record<string, { minY: number; position: number[] } | null> = { left: null, right: null };
      const contactVertices: Record<string, { id: string; position: number[] }[]> = { left: [], right: [] };
      const rootY = group.current?.getWorldPosition(v).y ?? Infinity;
      const physicalSoleY = rootY - (group.current?.position.y ?? 0);
      // QA reads deformed boot vertices, not just ankle bones or a guessed sole offset.
      rig.scene.updateMatrixWorld(true);
      rig.scene.traverse(o => {
        if (!(o instanceof SkinnedMesh)) return;
        o.skeleton.update();
        const p = o.geometry.getAttribute('position'), joints = o.geometry.getAttribute('skinIndex'), weights = o.geometry.getAttribute('skinWeight');
        if (!p || !joints || !weights) return;
        for (let i = 0; i < p.count; i++) {
          // GLTFLoader sanitizes dots in bone names, and exported influence order is not
          // guaranteed. Identify a rigid sole by total foot weight, never slot zero alone.
          const ids = [joints.getX(i), joints.getY(i), joints.getZ(i), joints.getW(i)];
          const ws = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
          const footWeights = { left: 0, right: 0 };
          ids.forEach((id, k) => { const name = o.skeleton.bones[id]?.name ?? '';
            if (/^foot[._]?L$/.test(name)) footWeights.left += ws[k];
            if (/^foot[._]?R$/.test(name)) footWeights.right += ws[k]; });
          const side = footWeights.right > footWeights.left ? 'right' : 'left';
          if (footWeights[side] < .98) continue;
          v.fromBufferAttribute(p, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld);
          if (!soles[side] || v.y < soles[side]!.minY) soles[side] = { minY: v.y, position: v.toArray() };
          // Keep stable vertex identities: the lowest corner can change during a toe
          // roll, so comparing only successive minimum points would invent foot slip.
          // These are QA candidates near the collider's foot plane, not IK anchors.
          if (s.grounded && v.y <= physicalSoleY + .006)
            contactVertices[side].push({ id: `${o.uuid}:${i}`, position: v.toArray() });
        }
      });
      return { loaded: true, moving: s.speed > .12, running: s.current === 'Run', airborne: !s.grounded,
        animation: s.current, animationTime: rig.actions[s.current].time, animationTimeScale: rig.actions[s.current].getEffectiveTimeScale(),
        mixerTime: rig.mixer.time, speedMps: s.speed, visible: s.visible, phaseGateTimeouts:s.phaseGateTimeouts,
        pendingAnimation:s.pending, pendingSeconds:s.pendingTime, stopPrototype:!!stop.current, stop:stop.current?.debug()??null,
        phasePrototype:!!rig.phase, phasePrediction:rig.gate.last, phaseWaitLimit:rig.phase?rig.gate.maxWait:null,
        root: group.current?.getWorldPosition(v).toArray() ?? null, soleCorrection:group.current?.position.y??0, soles, contactVertices };
    };
    readActor = read;
    return () => { if (readActor === read) readActor = null; };
  }, [rig]);
  useFrame((_, delta) => {
    const world = useWorldStore.getState();
    const s = state.current;
    s.visible = visible;
    if (!visible) stop.current?.cancel('hidden');
    if (world.paused || world.shot || !visible) return;
    const dt = Math.max(1e-6, Math.min(delta, .08));
    const { speedMps, grounded, facing, targetSpeedMps } = readMotion?.() ?? { speedMps: initialSpeed, grounded: initialGrounded, facing: initialFacing, targetSpeedMps:undefined };
    group.current?.updateWorldMatrix(true, false);
    group.current?.getWorldPosition(rig.motionPoint);
    const moved = Math.hypot(rig.motionPoint.x-rig.previousMotionPoint.x, rig.motionPoint.z-rig.previousMotionPoint.z);
    const travel = rig.hasMotionSample && moved < 1 ? moved : speedMps * dt;
    rig.previousMotionPoint.copy(rig.motionPoint); rig.hasMotionSample = true;
    // Use measured velocity directly. A wall contact must stop the stride, even with W held.
    s.speed = speedMps;
    const justLanded = grounded && !s.grounded;
    if (!grounded) s.airSeconds += dt;
    else if (justLanded) { s.landing = s.airSeconds > .12 && speedMps < .3 ? .4 : 0; s.airSeconds = 0; }
    s.grounded = grounded;
    s.landing = Math.max(0, s.landing - dt);
    const desired = !grounded ? 'Jump' : s.landing > 0 ? 'Land' : speedMps > 2.4 ? 'Run' : speedMps > .12 ? 'Walk' : 'Idle';
    const locomotionSwitch = desired !== s.current && !!rig.phaseSamples[desired] && !!rig.phaseSamples[s.current] && grounded;
    if (!locomotionSwitch) rig.gate.clear();
    if (desired !== s.current) {
      const from = rig.actions[s.current], to = rig.actions[desired];
      let entry: number | null = null, canSwitch = true;
      if (rig.phase && locomotionSwitch) {
        const sources = ['Walk','Run'].filter(name => rig.actions[name].isRunning() && rig.actions[name].getEffectiveWeight()>1e-4)
          .map(name => ({clip:name,time:rig.actions[name].time,weight:rig.actions[name].getEffectiveWeight()}));
        const target = targetSpeedMps ?? (desired === 'Run' ? 4.2 : 1.8);
        const speedEnd = target+(speedMps-target)*Math.exp(-12*.1);
        const result = rig.gate.request(desired,dt,()=>rig.phase!.findEntry({sources,target:desired,speed:speedMps,speedEnd,fade:.1,timing:'contact'}));
        canSwitch=result.switchNow;entry=result.entry;
        s.pending=rig.gate.pending??'';s.pendingTime=rig.gate.pendingSeconds;s.phaseGateTimeouts=rig.gate.timeouts;
      } else if (rig.phaseSamples[desired] && s.grounded) {
        rig.scene.updateWorldMatrix(true, true);
        const left = rig.scene.worldToLocal(rig.feet.get('left')!.getWorldPosition(new Vector3()));
        const right = rig.scene.worldToLocal(rig.feet.get('right')!.getWorldPosition(new Vector3()));
        if (rig.phaseSamples[s.current]) {
          const sourceIndex=Math.floor((from.time%rig.durations[s.current])/rig.durations[s.current]*72)%72;
          const sourceSample=rig.phaseSamples[s.current][sourceIndex];
          const side=sourceSample.soleMin.left<=sourceSample.soleMin.right?'left':'right',foot=side==='left'?left:right;
          const stanceAt = (name: string, time: number) => {
            const samples = rig.phaseSamples[name], duration = rig.durations[name];
            const index = ((time % duration + duration) % duration) / duration * samples.length;
            const i = Math.floor(index), alpha = index-i;
            // Heel/toe roll raises the ankle while the sole remains planted.
            // Ankle height alone incorrectly rejects every fast Walk support window.
            return samples[i].soleMin[side]*(1-alpha)+samples[(i+1)%samples.length].soleMin[side]*alpha <= .006;
          };
          const sourceScale=travel/(dt*(s.current==='Walk'?1.5:4.2));
          const targetScale=travel/(dt*(desired==='Walk'?1.5:4.2));
          // An equal-distance swing pose is not a planted-foot match. Both clips
          // must retain the same support foot through the entire 0.1 s blend.
          const holdsStance=(name:string,time:number,scale:number)=>[0,.025,.05,.075,.1].every(t=>stanceAt(name,time+t*scale));
          let bestDistance=.012;
          if(holdsStance(s.current,from.time,sourceScale))
            for(const sample of rig.phaseSamples[desired]) {
              if(!holdsStance(desired,sample.time,targetScale))continue;
              const distance=Math.hypot(sample[side].x-foot.x,sample[side].z-foot.z);
              if(distance<=bestDistance){bestDistance=distance;entry=sample.time;}
            }
          if(s.pending!==desired){s.pending=desired;s.pendingTime=0;}
          if(entry===null){s.pendingTime+=dt;canSwitch=s.pendingTime>=.2;if(canSwitch)s.phaseGateTimeouts++;}
        }
        // Start from Idle (or bounded timeout): preserve the nearest two-ankle pose.
        // Timeouts are exposed in QA, never hidden as a successful planted match.
        let best = Infinity;
        if(entry===null && canSwitch)for (const sample of rig.phaseSamples[desired]) {
          const score = sample.left.distanceToSquared(left) + sample.right.distanceToSquared(right);
          if (score < best) { best = score; entry = sample.time; }
        }
      }
      if(canSwitch){
        to.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
        if(entry!==null)to.time=entry;
        from.crossFadeTo(to, desired === 'Jump' ? .055 : .10, false);
        s.current = desired;s.pending='';s.pendingTime=0;
      }
    } else {s.pending='';s.pendingTime=0;}
    // Match stride distance to the displayed body displacement, including fixed-step
    // physics interpolation. Velocity × display dt is a different clock during hitches.
    // The fading source action must follow that clock too: its feet still contribute
    // to the displayed pose for the entire crossfade, including deceleration.
    rig.actions.Walk.setEffectiveTimeScale(rig.phase ? rig.phase.timeScale('Walk',rig.actions.Walk.time,travel,dt,'contact') : travel / (dt * 1.5));
    rig.actions.Run.setEffectiveTimeScale(rig.phase ? rig.phase.timeScale('Run',rig.actions.Run.time,travel,dt,'contact') : travel / (dt * 4.2));
    stop.current?.preUpdate({ animation:s.current, grounded, speedMps, facing, visible });
    rig.mixer.update(dt); s.time += dt;
    if (group.current) {
      group.current.rotation.y = facing;
      stop.current?.solve(dt);
      // Blending two valid leg poses can shorten the planted leg. Correct only that small
      // visual blend dip using actual deformed soles; physics and airborne motion stay intact.
      // The 2.5 cm bound prevents this from concealing an invalid rig or replacing slope IK.
      group.current.updateWorldMatrix(true,true);
      const rootY=group.current.getWorldPosition(rig.rootPoint).y;
      let minSole=Infinity;
      for(const {mesh,indices} of rig.soles) {
        mesh.skeleton.update();
        const positions=mesh.geometry.getAttribute('position');
        for(const i of indices) {
          rig.solePoint.fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,rig.solePoint);
          rig.solePoint.applyMatrix4(mesh.matrixWorld);minSole=Math.min(minSole,rig.solePoint.y-rootY);
        }
      }
      group.current.position.y=grounded&&Number.isFinite(minSole)?Math.min(.025,Math.max(0,.0015-minSole)):0;
    }
  });
  return <group ref={group} name="world-guide-G24" visible={visible} userData={{ assetId: 'G24', rig: 'custom-L1' }}><primitive object={rig.scene} /></group>;
}
export default function WorldGuide(props: WorldGuideProps) {
  return <GuideBoundary fallback={props.fallback}><Suspense fallback={props.fallback ?? null}><GuideModel {...props} /></Suspense></GuideBoundary>;
}
