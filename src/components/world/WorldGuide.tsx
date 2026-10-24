import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, BufferAttribute, Color, LoopOnce, LoopRepeat, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type AnimationAction, type Bone, type Group, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorldStore } from './store';
import { GuideSlopeFit, GuideStopStep, skinnedWorldPoint, type SlopeProbe } from './WorldGuideStop';
import { GuideInertializer, GuidePhaseModel, PhaseGate, type InertialHalflives } from './WorldGuidePhase';

export interface WorldGuideMotion {
  speedMps: number; grounded: boolean; facing: number; targetSpeedMps?: number;
  /** Movement intent from input (WorldActors): no keys / WASD / WASD+Shift. */
  intent?: 'idle' | 'walk' | 'run';
  /** Rigid-body vertical speed (m/s); drives the air pose (rise -> apex -> fall). */
  verticalSpeedMps?: number;
  /** Increments on every real take-off (the frame the jump velocity is set). */
  jumpSeq?: number;
  /** Static walkable ground under (x, z), cast down from fromY; used by the stance slope fit. */
  probeGround?: SlopeProbe;
}
export interface WorldGuideProps extends WorldGuideMotion { visible: boolean; readMotion?: () => WorldGuideMotion; fallback?: ReactNode }
/** v3 clip set (CMU-retargeted Walk/Run/Sprint, one-shot jump phases); see docs/world/quality-v3/guide. */
const GAITS = ['Walk', 'Run', 'Sprint'];
const LOOPS = new Set(['Idle', ...GAITS]);
const REQUIRED = ['Idle', ...GAITS, 'JumpStart', 'JumpAir', 'RunJumpStart', 'RunJumpAir', 'Land'];
/** Horizontal speed at take-off from which the running jump is used (spec 1.4). */
const RUNJUMP_SPEED = 2.5;
/** Standing landing length and the time after which movement may interrupt it (spec 1.4). */
const LAND_DURATION = .3, LAND_LOCK = .12;
/** Moving landing: additive spine compression length and peak pitch (rad) at 5 m/s impact. */
const LAND_ADD = .15, LAND_PITCH = .14;
/** A walk-off / terrain lip shorter than this keeps the gait (no air pose for a one-frame hop). */
const FALL_GRACE = .15;
/** Out-of-band playback (spec 1.2: 0.85-1.2) switches gait at once instead of waiting for a phase match. */
const RATE_LO = .7, RATE_HI = 1.25;
/** Below this measured speed a decelerating gait hands over to Idle (stop step places the feet). */
const STOP_SPEED = .6;
const _landQ = new Quaternion();
/** QA A/B only (?qa=1&guideXfade=1): the old crossfade switch, to measure what inertialization changed. */
const CROSSFADE_AB = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1' && new URLSearchParams(window.location.search).get('guideXfade') === '1';
/** Inertialization half-lives (s) per switch kind: legs decay faster than the upper body so a new
 * clip's foot contacts take over within ~2 frames of 60 Hz while the torso settles over ~0.2 s. */
const INERT: Record<string, InertialHalflives> = {
  gait: { legs: .05, body: .09, pelvisPos: .06, planted: .012 },
  start: { legs: .03, body: .06, pelvisPos: .04, planted: .012 },
  air: { legs: .06, body: .08, pelvisPos: .06 },
  land: { legs: .04, body: .08, pelvisPos: .05, planted: .012 },
  idle: { legs: .06, body: .12, pelvisPos: .08, planted: .012 },
};
let decoder: DRACOLoader | null = null;
const withDecoder = (loader: GLTFLoader) => {
  decoder ??= new DRACOLoader().setDecoderPath('/assets/world/draco/');
  loader.setDRACOLoader(decoder);
};
let readActor: (() => Record<string, unknown>) | null = null;

/** QA frame recorder (worldGuideRecord): per rendered frame, model-space joint positions (for pose-jump
 * metrics) and world-space rigid-sole vertices near the ground (for stance slip). Off unless started. */
const recorder: { on: boolean; frames: unknown[]; max: number } = { on: false, frames: [], max: 4000 };
export const worldGuideRecord = (cmd: 'start' | 'stop' | 'take', max = 4000) => {
  if (cmd === 'start') { recorder.on = true; recorder.frames = []; recorder.max = max; return true; }
  if (cmd === 'stop') { recorder.on = false; return recorder.frames.length; }
  const out = recorder.frames; recorder.frames = []; return out;
};
/** QA read (behind the runtime's debug query). actor('record:start'|'record:stop'|'record:take') drives
 * the per-frame recorder through the existing debug entry, without a new WorldActors field. */
export const worldGuideDebug = (cmd?: string, max?: number): Record<string, unknown> | unknown[] | number | boolean => {
  if (cmd === 'record:start') return worldGuideRecord('start', max);
  if (cmd === 'record:stop') return worldGuideRecord('stop');
  if (cmd === 'record:take') return worldGuideRecord('take') as unknown[];
  return readActor?.() ?? { moving: false, running: false, airborne: false, animation: null, animationTime: null, loaded: false };
};

class GuideBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[world-guide] G24 could not load', error); }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children; }
}

/**
 * Draw-call budget (SESSION-RULES 5: character <= 6): the GLB keeps its 8 Art Lock materials (A6/QA
 * gates identify parts by material). At load, primitives whose materials differ ONLY in base colour
 * (same roughness 0.80-0.92 band, not metallic, no emission, opaque) are merged into one skinned mesh
 * with per-vertex colour = that material's base colour, so the shading is unchanged: jacket, sleeve,
 * pants, glove/boot and hip bag become 1 draw; helmet, visor and the cyan dot keep their own.
 * 8 -> 4 draws (plus shadow pass).
 */
function mergeGuideMaterials(scene: Object3D) {
  const skinned: SkinnedMesh[] = [];
  scene.traverse(o => { if (o instanceof SkinnedMesh) skinned.push(o); });
  const cloth = skinned.filter(m => {
    const mat = m.material as MeshStandardMaterial;
    return !Array.isArray(m.material) && mat.roughness >= .79 && mat.roughness <= .93 && mat.metalness === 0 && mat.emissive.getHex() === 0;
  });
  if (cloth.length < 2 || cloth.some(m => m.skeleton.bones[0] !== cloth[0].skeleton.bones[0] || m.parent !== cloth[0].parent)) return;
  const geos = cloth.map(m => {
    const g = m.geometry.clone(), c = (m.material as MeshStandardMaterial).color, n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) return;
  const base = cloth[0].material as MeshStandardMaterial;
  const mat = base.clone(); mat.name = 'guide_cloth_merged'; mat.vertexColors = true; mat.color = new Color(1, 1, 1); mat.roughness = .86;
  const mesh = new SkinnedMesh(merged, mat);
  mesh.name = 'G24_cloth'; mesh.bind(cloth[0].skeleton, cloth[0].bindMatrix);
  cloth[0].parent!.add(mesh);
  for (const m of cloth) m.removeFromParent();
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
    mergeGuideMaterials(scene);
    scene.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const soles: { mesh: SkinnedMesh; indices: number[]; sides: ('left' | 'right')[] }[] = [];
    scene.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return;
      const joints=o.geometry.getAttribute('skinIndex'), weights=o.geometry.getAttribute('skinWeight');
      if(!joints||!weights)return;
      const indices:number[]=[], sides:('left'|'right')[]=[];
      for(let i=0;i<joints.count;i++) {
        const ids=[joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)];
        const ws=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
        for (const [side, re] of [['left', /^foot[._]?L$/], ['right', /^foot[._]?R$/]] as const)
          if(ids.reduce((sum,id,k)=>sum+(re.test(o.skeleton.bones[id]?.name??'')?ws[k]:0),0)>.98){indices.push(i);sides.push(side);}
      }
      if(indices.length)soles.push({mesh:o,indices,sides});
    });
    const mixer = new AnimationMixer(scene);
    const actions = Object.fromEntries(gltf.animations.map(clip => {
      const action = mixer.clipAction(clip);
      const once = !LOOPS.has(clip.name);
      action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      return [clip.name, action];
    })) as Record<string, AnimationAction>;
    for (const name of REQUIRED) if (!actions[name]) throw new Error(`G24 missing ${name} animation`);
    // Design speeds come from the asset (armature extras clipDesignSpeedMps), not constants here.
    let design: Record<string, number> = { Walk: 1.5, Run: 3.6, Sprint: 6.2 };
    gltf.scene.traverse(o => { const raw = (o.userData as { clipDesignSpeedMps?: string }).clipDesignSpeedMps; if (raw) design = { ...design, ...JSON.parse(raw) }; });
    // Contact masks (frame-wise 0/1 per foot) for the slope fit's stance weight.
    const contact: Record<string, { L: number[]; R: number[]; frames: number }> = {};
    for (const clip of gltf.animations) {
      const u = clip.userData as { contactL?: number[]; contactR?: number[]; frames?: number };
      if (u.contactL && u.contactR) contact[clip.name] = { L: u.contactL, R: u.contactR, frames: u.frames ?? u.contactL.length - 1 };
    }
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
    for (const name of GAITS) {
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
    const phase = GuidePhaseModel.fromGLTF(gltf, { authoredSpeed:{ Walk:design.Walk, Run:design.Run, Sprint:design.Sprint }, clips:['Idle', ...GAITS] });
    // Bones for the moving-landing compression: pitch about each bone's local axis that maps to the
    // body's lateral axis in the bind pose (no local axis convention assumed).
    const spineBones: Bone[] = [];
    scene.updateMatrixWorld(true);
    const lateral = new Vector3(0, 0, 1);     // glTF +Z = character right; rotation about it pitches forward/back
    for (const re of [/^spine$/, /^chest$/]) scene.traverse(o => { if ((o as Bone).isBone && re.test(o.name)) {
      const b = o as Bone; const inv = b.getWorldQuaternion(new Quaternion()).invert();
      b.userData.landAxis = lateral.clone().applyQuaternion(scene.getWorldQuaternion(new Quaternion())).applyQuaternion(inv).normalize();
      spineBones.push(b);
    } });
    return { scene, mixer, actions, soles, feet, phaseSamples, durations, phase, gate:new PhaseGate(.4), design, contact, slope:new GuideSlopeFit(scene), spineBones, inert:new GuideInertializer(scene),
      solePoint:new Vector3(), rootPoint:new Vector3(), recPoint:new Vector3(), inverseRoot:new Matrix4(), motionPoint:new Vector3(), previousMotionPoint:new Vector3(), hasMotionSample:false };
  }, [gltf]);
  const state = useRef({ current: 'Idle', speed: 0, grounded: initialGrounded, visible, airSeconds: 0, landing: 0, time: 0,
    pending: '', pendingTime: 0, phaseGateTimeouts: 0, jumpSeq: -1, jumpKind: '' as '' | 'Jump' | 'RunJump', takeoffSpeed: 0,
    vy: 0, vyPeak: 0, airPhase: 0, blocked: 0, lastLand: '', landSpeed: 0, landT: 0, rateOut: 0, slopeOn: false });
  useEffect(() => () => { rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene); }, [rig]);
  useEffect(() => {
    // Fable's 2026-10-22 acceptance permits this visual stop step in normal play.
    if (!group.current) return;
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
      return { loaded: true, moving: s.speed > .12, running: s.current === 'Run' || s.current === 'Sprint', airborne: !s.grounded,
        jumpKind: s.jumpKind, airPhase: +s.airPhase.toFixed(3), lastLanding: s.lastLand, playbackRate: +s.rateOut.toFixed(3),
        designSpeedMps: rig.design, slope: rig.slope.debug(), slopeOn: s.slopeOn,
        animation: s.current, animationTime: rig.actions[s.current].time, animationTimeScale: rig.actions[s.current].getEffectiveTimeScale(),
        mixerTime: rig.mixer.time, speedMps: s.speed, visible: s.visible, phaseGateTimeouts:s.phaseGateTimeouts,
        pendingAnimation:s.pending, pendingSeconds:s.pendingTime, stopPrototype:!!stop.current, stop:stop.current?.debug()??null,
        budget:(()=>{let draws=0,tris=0;rig.scene.traverse(o=>{if(o instanceof Mesh&&o.visible){const g=o.geometry,m=o.material;draws+=Array.isArray(m)?m.length:1;tris+=(g.index?g.index.count:g.getAttribute('position').count)/3;}});return{draws,triangles:tris};})(),inert:{switches:rig.inert.switches,lastJump:rig.inert.lastJump,residual:rig.inert.residual()},phasePrototype:!!rig.phase, phasePrediction:rig.gate.last, phaseWaitLimit:rig.phase?rig.gate.maxWait:null,
        root: group.current?.getWorldPosition(v).toArray() ?? null, soleCorrection:group.current?.position.y??0, soles, contactVertices };
    };
    readActor = read;
    return () => { if (readActor === read) readActor = null; };
  }, [rig]);
  useFrame((_, delta) => {
    const world = useWorldStore.getState();
    const s = state.current;
    s.visible = visible;
    if (!visible) { stop.current?.cancel('hidden'); rig.inert.reset(); }
    if (world.paused || world.shot || !visible) return;
    const dt = Math.max(1e-6, Math.min(delta, .08));
    const motion = readMotion?.() ?? { speedMps: initialSpeed, grounded: initialGrounded, facing: initialFacing } as WorldGuideMotion;
    const { speedMps, grounded, facing, targetSpeedMps } = motion;
    group.current?.updateWorldMatrix(true, false);
    group.current?.getWorldPosition(rig.motionPoint);
    const moved = Math.hypot(rig.motionPoint.x-rig.previousMotionPoint.x, rig.motionPoint.z-rig.previousMotionPoint.z);
    const travel = rig.hasMotionSample && moved < 1 ? moved : speedMps * dt;
    rig.previousMotionPoint.copy(rig.motionPoint); rig.hasMotionSample = true;
    // Use measured velocity directly. A wall contact must stop the stride, even with W held.
    s.speed = speedMps;
    const vy = motion.verticalSpeedMps ?? 0;
    const D = rig.design;
    // Intent from input (WorldActors); fall back to the target speed when an older caller omits it.
    const intent = motion.intent ?? (targetSpeedMps === undefined ? (speedMps > .12 ? 'walk' : 'idle')
      : targetSpeedMps > (D.Run + D.Sprint) / 2 ? 'run' : targetSpeedMps > .1 ? 'walk' : 'idle');
    // ---- jump: a real take-off (jumpSeq++) starts JumpStart / RunJumpStart
    const seq = motion.jumpSeq;
    let takeoff = false;
    if (seq !== undefined) { if (s.jumpSeq < 0) s.jumpSeq = seq; else if (seq !== s.jumpSeq) { s.jumpSeq = seq; takeoff = true; } }
    else if (s.grounded && !grounded && vy > 1) takeoff = true;     // legacy callers without jumpSeq
    if (takeoff) {
      s.jumpKind = speedMps >= RUNJUMP_SPEED ? 'RunJump' : 'Jump';
      s.takeoffSpeed = speedMps; s.vyPeak = Math.max(vy, 3); s.airPhase = 0;
    }
    const justLanded = grounded && !s.grounded;
    if (!grounded) { s.airSeconds += dt; s.vyPeak = Math.max(s.vyPeak, vy); }
    else if (justLanded) {
      // Moving input at >= 2.5 m/s lands straight into the gait (+ a short additive compression);
      // otherwise a standing landing (Land) that movement can interrupt after LAND_LOCK.
      s.landSpeed = -s.vy;
      const moving = intent !== 'idle' && speedMps >= RUNJUMP_SPEED;
      s.landing = s.airSeconds > .12 && !moving ? LAND_DURATION : 0;
      s.lastLand = s.airSeconds > .12 ? (moving ? 'moving' : 'stand') : '';
      s.airSeconds = 0; s.jumpKind = '';
    }
    s.vy = vy;
    s.grounded = grounded;
    s.landing = Math.max(0, s.landing - dt);
    if (s.landing > 0 && s.landing < LAND_DURATION - LAND_LOCK && intent !== 'idle') s.landing = 0;
    const isGait = (n: string) => GAITS.includes(n);
    const gaitFor = CROSSFADE_AB ? () => {
      if (intent === 'idle') return speedMps > D.Run * .55 ? 'Run' : speedMps > .12 ? 'Walk' : 'Idle';
      if (intent === 'run') return speedMps > (D.Run + D.Sprint) / 2 ? 'Sprint' : speedMps > D.Walk * 1.35 ? 'Run' : 'Walk';
      return speedMps > D.Walk * 1.35 ? 'Run' : 'Walk';
    } : () => {
      // Gait from the commanded speed (input), not the measured one: a 0.3 s start or stop no longer
      // passes through two extra clip switches (Idle>Walk>Run, Run>Walk>Idle), each a leg pose change.
      // The shown gait slows with the body (travel-driven clip time) and hands over to Idle below
      // STOP_SPEED, where the stop step places the feet. Blocked by a wall (commanded but not moving) -> Idle.
      const target = targetSpeedMps ?? 0;
      if (intent === 'idle' || target < .1) return isGait(s.current) && speedMps > STOP_SPEED ? s.current : 'Idle';
      if (speedMps < .25 && s.blocked > .25) return 'Idle';
      if (intent === 'run') return target > (D.Run + D.Sprint) / 2 ? 'Sprint' : 'Run';
      return target > D.Walk * 1.35 ? 'Run' : 'Walk';
    };
    s.blocked = intent !== 'idle' && (targetSpeedMps ?? 0) > 1 && speedMps < .25 ? s.blocked + dt : 0;
    let desired = s.current;
    if (!grounded && !s.jumpKind && s.airSeconds < FALL_GRACE) desired = s.current.endsWith('Air') || s.current.endsWith('Start') ? gaitFor() : s.current;
    else if (!grounded) {
      const kind = s.jumpKind || 'Jump';
      const start = rig.actions[`${kind}Start`];
      const startDone = s.current === `${kind}Start` && start.time >= start.getClip().duration - 1e-4;
      desired = s.jumpKind && (s.current !== `${kind}Start` || !startDone) && s.current !== `${kind}Air` ? `${kind}Start` : `${kind}Air`;
      // Air pose phase from vertical speed: 0 = take-off speed (rising), .5 = apex, 1 = falling as fast
      // as it rose. Not clip time: any flight length shows a valid pose, nothing freezes.
      s.airPhase = Math.min(1, Math.max(0, .5 - .5 * vy / s.vyPeak));
    } else desired = s.landing > 0 ? 'Land' : gaitFor();
    const locomotionSwitch = desired !== s.current && isGait(desired) && isGait(s.current) && grounded;
    if (!locomotionSwitch) rig.gate.clear();
    if (desired !== s.current) {
      const from = rig.actions[s.current], to = rig.actions[desired];
      let entry: number | null = null, canSwitch = true;
      if (rig.phase && locomotionSwitch && CROSSFADE_AB) {
        const sources = GAITS.filter(name => rig.actions[name].isRunning() && rig.actions[name].getEffectiveWeight()>1e-4)
          .map(name => ({clip:name,time:rig.actions[name].time,weight:rig.actions[name].getEffectiveWeight()}));
        const target = targetSpeedMps ?? D[desired] ?? speedMps;
        const speedEnd = target+(speedMps-target)*Math.exp(-12*.1);
        const result = rig.gate.request(desired,dt,()=>rig.phase!.findEntry({sources,target:desired,speed:speedMps,speedEnd,fade:.1,timing:'contact'}));
        canSwitch=result.switchNow;entry=result.entry;
        // Accelerating/decelerating out of the clip's band: switch now at the best predicted entry
        // (counted as a timeout in QA) rather than over-speeding the current clip while waiting.
        const rate = isGait(s.current) ? speedMps / D[s.current] : 1;
        if (!canSwitch && (rate > RATE_HI || rate < RATE_LO) && rig.gate.last) { canSwitch = true; entry = rig.gate.last.time; rig.gate.timeouts++; rig.gate.clear(); s.phaseGateTimeouts = rig.gate.timeouts; }
        s.pending=rig.gate.pending??'';s.pendingTime=rig.gate.pendingSeconds;s.phaseGateTimeouts=rig.gate.timeouts;
      } else if (rig.phaseSamples[desired] && grounded) {
        // From Idle / Land / a landing: start the gait at the sample nearest to the displayed ankles,
        // so a moving landing lands on the matching foot instead of resetting the cycle.
        rig.scene.updateWorldMatrix(true, true);
        const left = rig.scene.worldToLocal(rig.feet.get('left')!.getWorldPosition(new Vector3()));
        const right = rig.scene.worldToLocal(rig.feet.get('right')!.getWorldPosition(new Vector3()));
        let best = Infinity;
        for (const sample of rig.phaseSamples[desired]) {
          const score = sample.left.distanceToSquared(left) + sample.right.distanceToSquared(right);
          if (score < best) { best = score; entry = sample.time; }
        }
      }
      if(canSwitch){
        to.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
        if(entry!==null)to.time=entry;
        if (desired.endsWith('Air')) { to.paused = true; to.time = s.airPhase * to.getClip().duration; }
        if (desired === 'Land') to.setEffectiveTimeScale(to.getClip().duration / LAND_DURATION);
        // Inertialized switch (spec 15.4): the new clip is at full weight at once; the on-screen pose
        // difference is stored and decays (WorldGuidePhase GuideInertializer). No crossfade.
        if (CROSSFADE_AB) { from.crossFadeTo(to, desired.endsWith('Start') || desired === 'Land' ? .05 : desired.endsWith('Air') ? .06 : .1, false); } else {
        from.stop();
        // contact of the destination clip at its entry frame (clip contact curves, as authored)
        const m = rig.contact[desired], fr = m ? Math.min(m.frames, Math.max(0, Math.round(to.time / to.getClip().duration * m.frames))) : 0;
        rig.inert.begin(INERT[desired.endsWith('Start') ? 'start' : desired.endsWith('Air') ? 'air' : desired === 'Land' ? 'land' : isGait(desired) ? 'gait' : 'idle'],
          { L: !!m && (m.L[fr] ?? 0) > .5, R: !!m && (m.R[fr] ?? 0) > .5 }); }
        if (!desired.endsWith('Air')) for (const n of ['JumpAir', 'RunJumpAir']) if (n !== desired) rig.actions[n].paused = false;
        s.current = desired;s.pending='';s.pendingTime=0;
        if (isGait(desired)) s.lastLand = s.lastLand === 'moving' ? 'moving-entered' : '';
      }
    } else {s.pending='';s.pendingTime=0;}
    if (s.current.endsWith('Air')) { const a = rig.actions[s.current]; a.paused = true; a.time = s.airPhase * a.getClip().duration; }
    // Match stride distance to the displayed body displacement, including fixed-step
    // physics interpolation. Velocity × display dt is a different clock during hitches.
    // The fading source action must follow that clock too: its feet still contribute
    // to the displayed pose for the entire crossfade, including deceleration.
    for (const g of GAITS) rig.actions[g].setEffectiveTimeScale(rig.phase ? rig.phase.timeScale(g,rig.actions[g].time,travel,dt,'contact') : travel / (dt * D[g]));
    // Playback rate of the shown gait relative to its authored speed (spec 1.2: 0.85-1.2 in steady motion).
    s.rateOut = isGait(s.current) ? speedMps / D[s.current] : 0;
    stop.current?.preUpdate({ animation:s.current, grounded, speedMps, facing, visible, wantsMove: CROSSFADE_AB ? undefined : intent !== 'idle' });
    rig.inert.capture();
    rig.mixer.update(dt); s.time += dt;
    rig.inert.apply(dt);
    if (group.current) {
      group.current.rotation.y = facing;
      group.current.updateWorldMatrix(true, true);
      const baseY = group.current.getWorldPosition(rig.rootPoint).y - group.current.position.y;
      // Moving landing: short additive spine/chest compression (<= 0.15 s, spec 1.4), no foot change.
      if (s.lastLand === 'moving-entered' || s.lastLand === 'moving') {
        s.landT = (s.landT ?? 0) + dt;
        const k = Math.min(1, s.landSpeed / 5) * Math.sin(Math.PI * Math.min(1, s.landT / LAND_ADD));
        if (s.landT >= LAND_ADD) { s.lastLand = ''; s.landT = 0; }
        else for (const b of rig.spineBones) b.quaternion.multiply(_landQ.setFromAxisAngle(b.userData.landAxis, LAND_PITCH * k));
      } else s.landT = 0;
      // Stance slope fit (spec 10.1) before the stop step; both share the 5 cm pelvis budget.
      const contact = { left: 0, right: 0 }, ahead = { left: 0, right: 0 };
      let wsum = 0;
      for (const [name, act] of Object.entries(rig.actions)) {
        const w = act.isRunning() ? act.getEffectiveWeight() : 0, m = rig.contact[name];
        if (w < 1e-3 || !m) continue;
        const fr = act.time / act.getClip().duration * m.frames, f = Math.min(m.frames, Math.max(0, Math.round(fr)));
        contact.left += w * (m.L[f] ?? 0); contact.right += w * (m.R[f] ?? 0); wsum += w;
        // stance within the next fade time (clip time advances at the effective time scale)
        const look = Math.ceil(rig.slope.tuning.fade * Math.max(0, act.getEffectiveTimeScale()) * m.frames / act.getClip().duration);
        const loop = LOOPS.has(name);
        let aL = 0, aR = 0;
        for (let k = 0; k <= look; k++) { const g = loop ? (f + k) % m.frames : Math.min(m.frames, f + k); aL = Math.max(aL, m.L[g] ?? 0); aR = Math.max(aR, m.R[g] ?? 0); }
        ahead.left += w * aL; ahead.right += w * aR;
      }
      if (wsum > 0) { contact.left /= wsum; contact.right /= wsum; ahead.left /= wsum; ahead.right /= wsum; }
      s.slopeOn = grounded && !s.current.endsWith('Air') && !s.current.endsWith('Start');
      rig.slope.solve(dt, s.slopeOn, motion.probeGround, baseY, contact, stop.current?.pelvisDrop ?? 0, ahead, group.current.position.y);
      if (stop.current) {
        stop.current.externalDrop = rig.slope.drop;
        stop.current.groundOffset = motion.probeGround ? (x, z) => rig.slope.offsetAt(motion.probeGround, baseY, x, z) : null;
      }
      stop.current?.solve(dt);
      // Blending two valid leg poses can shorten the planted leg. Correct only that small
      // visual blend dip using actual deformed soles; physics and airborne motion stay intact.
      // The 2.5 cm bound prevents this from concealing an invalid rig or replacing slope IK.
      group.current.updateWorldMatrix(true,true);
      const rootY=group.current.getWorldPosition(rig.rootPoint).y;
      let minSole=Infinity;
      for(const {mesh,indices,sides} of rig.soles) {
        mesh.skeleton.update();
        indices.forEach((i,k) => {
          const leg = rig.slope.legs[sides[k]];
          // On sloped ground (a probed plane exists) every foot is measured against its own ground, and only
          // planted feet may raise the body: a swing foot that is below the root plane only because the
          // ground falls away must not lift the whole guide (that lift floated the planted foot by 2.5 cm).
          const onSlope = leg.plane !== null;
          if (onSlope && leg.contact < .5) return;
          // world-space skinning from the bone matrices: the mesh's bindMatrixInverse is stale until the
          // next updateMatrixWorld, which offset applyBoneTransform by this frame's root move (vertical on a ramp)
          skinnedWorldPoint(mesh,i,rig.solePoint);
          // both branches measure the sole WITHOUT last frame's correction (rootY contains it; on a slope
          // it is subtracted explicitly), so the new correction replaces the old one instead of adding to it
          const ground = onSlope ? rig.slope.groundAt(sides[k], rig.solePoint.x, rig.solePoint.z) : null;
          minSole=Math.min(minSole,ground===null?rig.solePoint.y-rootY:rig.solePoint.y-group.current!.position.y-ground);
        });
      }
      group.current.position.y=grounded&&Number.isFinite(minSole)?Math.min(.025,Math.max(0,.0015-minSole)):0;
      if (recorder.on && recorder.frames.length < recorder.max) {
        group.current.updateWorldMatrix(true, true);
        const inv = rig.inverseRoot.copy(group.current.matrixWorld).invert();
        const joints: number[] = [];
        for (const b of rig.inert.bones) { b.getWorldPosition(rig.recPoint).applyMatrix4(inv); joints.push(+rig.recPoint.x.toFixed(4), +rig.recPoint.y.toFixed(4), +rig.recPoint.z.toFixed(4)); }
        const soles: number[][] = [];
        const rootW = group.current.getWorldPosition(rig.rootPoint);
        rig.soles.forEach(({ mesh, indices, sides }, mi) => indices.forEach((i, k) => {
          skinnedWorldPoint(mesh, i, rig.solePoint);
          const g = rig.slope.legs[sides[k]].plane ? rig.slope.groundAt(sides[k], rig.solePoint.x, rig.solePoint.z) : null;
          const h = g === null ? rig.solePoint.y - (rootW.y - group.current!.position.y) : rig.solePoint.y - g;
          if (h < .1) soles.push([(sides[k] === 'left' ? 0 : 1000000) + mi * 10000 + i, +rig.solePoint.x.toFixed(4), +rig.solePoint.z.toFixed(4), +h.toFixed(4)]);
        }));
        const res = rig.inert.residual();
        recorder.frames.push({ t: +s.time.toFixed(4), dt: +dt.toFixed(4), anim: s.current, at: +rig.actions[s.current].time.toFixed(4), ts: +rig.actions[s.current].getEffectiveTimeScale().toFixed(3), grounded, speed: +speedMps.toFixed(3), facing: +facing.toFixed(4),
          root: rootW.toArray().map(v => +v.toFixed(4)), joints, soles, inert: [+res.angle.toFixed(4), +res.pelvis.toFixed(4)], switches: rig.inert.switches,
          contact: rig.slope.legs.left && [+rig.slope.legs.left.contact.toFixed(2), +rig.slope.legs.right.contact.toFixed(2)], lift: +group.current.position.y.toFixed(4), slope: rig.slope.debug(), stepping: stop.current ? (() => { const d = stop.current!.debug(); return [d.left.stepping ? 1 : 0, d.right.stepping ? 1 : 0, d.state]; })() : null });
      }
    }
  });
  return <group ref={group} name="world-guide-G24" visible={visible} userData={{ assetId: 'G24', rig: 'custom-L1' }}><primitive object={rig.scene} /></group>;
}
export default function WorldGuide(props: WorldGuideProps) {
  return <GuideBoundary fallback={props.fallback}><Suspense fallback={props.fallback ?? null}><GuideModel {...props} /></Suspense></GuideBoundary>;
}
