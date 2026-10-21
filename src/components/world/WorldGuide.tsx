import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, SkinnedMesh, Vector3, type AnimationAction, type Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useWorldStore } from './store';

export interface WorldGuideProps { speedMps: number; grounded: boolean; visible: boolean; facing: number; fallback?: ReactNode }
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

function GuideModel({ speedMps, grounded, visible, facing }: WorldGuideProps) {
  const gltf = useLoader(GLTFLoader, '/assets/world/guide/G24.glb', withDecoder) as GLTF;
  const group = useRef<Group>(null);
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
    return { scene, mixer, actions, soles, solePoint:new Vector3(), rootPoint:new Vector3() };
  }, [gltf]);
  const state = useRef({ current: 'Idle', speed: 0, grounded, visible, airSeconds: 0, landing: 0, time: 0 });
  useEffect(() => () => { rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene); }, [rig]);
  useEffect(() => {
    const v = new Vector3();
    const read = () => {
      const s = state.current;
      const soles: Record<string, { minY: number; position: number[] } | null> = { left: null, right: null };
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
        }
      });
      return { loaded: true, moving: s.speed > .12, running: s.current === 'Run', airborne: !s.grounded,
        animation: s.current, animationTime: rig.actions[s.current].time, animationTimeScale: rig.actions[s.current].getEffectiveTimeScale(),
        mixerTime: rig.mixer.time, speedMps: s.speed, visible: s.visible, root: group.current?.getWorldPosition(v).toArray() ?? null, soleCorrection:group.current?.position.y??0, soles };
    };
    readActor = read;
    return () => { if (readActor === read) readActor = null; };
  }, [rig]);
  useFrame((_, delta) => {
    const world = useWorldStore.getState();
    const s = state.current;
    s.visible = visible;
    if (world.paused || world.shot || !visible) return;
    const dt = Math.min(delta, .08);
    // Use measured velocity directly. A wall contact must stop the stride, even with W held.
    s.speed = speedMps;
    const justLanded = grounded && !s.grounded;
    if (!grounded) s.airSeconds += dt;
    else if (justLanded) { s.landing = s.airSeconds > .12 && speedMps < .3 ? .4 : 0; s.airSeconds = 0; }
    s.grounded = grounded;
    s.landing = Math.max(0, s.landing - dt);
    const desired = !grounded ? 'Jump' : s.landing > 0 ? 'Land' : speedMps > 2.4 ? 'Run' : speedMps > .12 ? 'Walk' : 'Idle';
    if (desired !== s.current) {
      const from = rig.actions[s.current], to = rig.actions[desired];
      to.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (['Walk', 'Run'].includes(desired) && ['Walk', 'Run'].includes(s.current)) to.time = (from.time / from.getClip().duration) * to.getClip().duration;
      from.crossFadeTo(to, desired === 'Jump' ? .055 : .10, false);
      s.current = desired;
    }
    const action = rig.actions[s.current];
    action.setEffectiveTimeScale(s.current === 'Walk' ? Math.max(.01, speedMps / 1.5) : s.current === 'Run' ? Math.max(.01, speedMps / 4.2) : 1);
    rig.mixer.update(dt); s.time += dt;
    if (group.current) {
      const difference = Math.atan2(Math.sin(facing - group.current.rotation.y), Math.cos(facing - group.current.rotation.y));
      group.current.rotation.y += Math.max(-dt * 12, Math.min(dt * 12, difference));
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
