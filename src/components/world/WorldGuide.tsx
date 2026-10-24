import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, BufferAttribute, Color, LoopOnce, LoopPingPong, LoopRepeat, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type AnimationAction, type Bone, type Group, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorldStore } from './store';
import { GuideSlopeFit, GuideStopStep, skinnedWorldPoint, type SlopeProbe } from './WorldGuideStop';
import { GuideInertializer, GuidePhaseModel, PhaseGate, type InertialHalflives } from './WorldGuidePhase';
import { guideSkinEvidence } from './WorldGuideEvidence';

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
export interface WorldGuideMotion {
  /** Seat from store.seat; the body (group) is already at seat.position (WorldActors). */
  seat?: { position: [number, number, number]; yaw: number } | null;
  /** Vehicle transition: 'enter' while stepping in (guide fades out toward `door`), 'exit' while stepping out. */
  vehicle?: { phase: 'enter' | 'exit'; t: number; door: [number, number, number] } | null;
  /** Hidden by the caller (driving, after the enter transition). */
  hidden?: boolean;
}
export interface WorldGuideProps extends WorldGuideMotion { visible: boolean; readMotion?: () => WorldGuideMotion; fallback?: ReactNode }
/** v3 clip set (CMU-retargeted Walk/Run/Sprint, one-shot jump phases); see docs/world/quality-v3/guide. */
const GAITS = ['Walk', 'Run', 'Sprint'];
const LOOPS = new Set(['Idle', ...GAITS, 'SitIdle']);
const REQUIRED = ['Idle', ...GAITS, 'JumpStart', 'JumpAir', 'RunJumpStart', 'RunJumpAir', 'Land'];
/** v3d measured extras (optional: an older GLB without them keeps the v3c behaviour). */
const EXTRAS = ['SitDown', 'SitIdle', 'StandUp', 'TurnL', 'TurnR', 'IdleLook'];
/** Seated buttock underside above the soles in SitIdle (tools/world/guide/out/sit_measure.json, fresh import). */
const SIT_BUTTOCK = .263;
/** Seated buttock centre ahead of the root (+X) in SitIdle (same file); the root moves back by it. */
const SIT_FORWARD = -.456; // measured rear hip -0.226 m, supported 0.23 m toward the seat's front edge
/** A body yaw change of at least this much from a standstill plays a measured turn-in-place step. */
const TURN_MIN = .8;
/** Idle variation: a measured look-around after this many seconds standing (randomised within the range). */
const IDLE_VARY: [number, number] = [5, 9];
/** Vehicle enter/exit: visible step toward / away from the door with a short fade (<= 0.8 s total). */
export const VEHICLE_TRANSITION_S = .7;
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
  interaction: { legs: .075, body: .12, pelvisPos: .09 },
};
let decoder: DRACOLoader | null = null;
const withDecoder = (loader: GLTFLoader) => {
  decoder ??= new DRACOLoader().setDecoderPath('/assets/world/draco/');
  loader.setDRACOLoader(decoder);
};
let readActor: (() => Record<string, unknown>) | null = null;
let readSkin: ((topology: boolean) => unknown) | null = null;

/** QA frame recorder (worldGuideRecord): per rendered frame, model-space joint positions (for pose-jump
 * metrics) and world-space rigid-sole vertices near the ground (for stance slip). Off unless started. */
const recorder: { on: boolean; skin: boolean; frames: unknown[]; max: number } = { on: false, skin: false, frames: [], max: 4000 };
export const worldGuideRecord = (cmd: 'start' | 'stop' | 'take', max = 4000) => {
  if (cmd === 'start') { recorder.on = true; recorder.skin = false; recorder.frames = []; recorder.max = max; return true; }
  if (cmd === 'stop') { recorder.on = false; return recorder.frames.length; }
  const out = recorder.frames; recorder.frames = []; return out;
};
/** QA read (behind the runtime's debug query). actor('record:start'|'record:stop'|'record:take') drives
 * the per-frame recorder through the existing debug entry, without a new WorldActors field. */
export const worldGuideDebug = (cmd?: string, max?: number): Record<string, unknown> | unknown[] | number | boolean => {
  if (cmd === 'record:start') return worldGuideRecord('start', max);
  if (cmd === 'record:skin') { worldGuideRecord('start', max); recorder.skin = true; return true; }
  if (cmd === 'record:stop') return worldGuideRecord('stop');
  if (cmd === 'record:take') return worldGuideRecord('take') as unknown[];
  if (cmd === 'skin:topology' || cmd === 'skin:pose') return readSkin?.(cmd === 'skin:topology') as Record<string, unknown>;
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
      action.setLoop(once ? LoopOnce : clip.name === 'SitIdle' ? LoopPingPong : LoopRepeat, once ? 1 : Infinity);
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
    const extras = EXTRAS.every(n => actions[n]);
    // measured heading curves of the turn clips (rad, one per frame), for the visual turn timing
    const yawCurve: Record<string, number[]> = {};
    for (const clip of gltf.animations) { const y = (clip.userData as { yawCurve?: number[] }).yawCurve; if (y) yawCurve[clip.name] = y; }
    // the measured look-around (IdleLook) is a full gesture: loop once and hold nothing
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
      b.userData.leanAxis = new Vector3(1, 0, 0).applyQuaternion(scene.getWorldQuaternion(new Quaternion())).applyQuaternion(inv).normalize();
      spineBones.push(b);
    } });
    return { scene, mixer, actions, soles, feet, phaseSamples, durations, phase, gate:new PhaseGate(.4), design, contact, slope:new GuideSlopeFit(scene), spineBones, inert:new GuideInertializer(scene), extras, yawCurve,
      materials: (() => { const m: MeshStandardMaterial[] = []; scene.traverse(o => { if (o instanceof Mesh) for (const x of [o.material].flat()) if (!m.includes(x as MeshStandardMaterial)) m.push(x as MeshStandardMaterial); }); return m; })(),
      rootOff: new Vector3(), rootOffVel: new Vector3(), rootOffFrom: new Vector3(), lastWorld: new Vector3(), baseWorld: new Vector3(), vehOff: new Vector3(),
      solePoint:new Vector3(), rootPoint:new Vector3(), recPoint:new Vector3(), inverseRoot:new Matrix4(), motionPoint:new Vector3(), previousMotionPoint:new Vector3(), hasMotionSample:false };
  }, [gltf]);
  const state = useRef({ current: 'Idle', speed: 0, grounded: initialGrounded, visible, airSeconds: 0, landing: 0, time: 0,
    pending: '', pendingTime: 0, phaseGateTimeouts: 0, jumpSeq: -1, jumpKind: '' as '' | 'Jump' | 'RunJump', takeoffSpeed: 0,
    vy: 0, vyPeak: 0, airPhase: 0, blocked: 0, sat: false, turn: null as null | { clip: string; from: number; to: number; t: number }, idleT: 0, idleNext: IDLE_VARY[0] + Math.random() * (IDLE_VARY[1] - IDLE_VARY[0]), shownYaw: 0, yawInit: false, fade: 1, sitDrop: 0, groundY: NaN, prevSeated: false, seatChangeT: 9, lastSeat: null as null | { position: [number, number, number]; yaw: number }, hasLast: false, lean: 0, pitch: 0, prevFacing: 0, prevSpeed: 0, faded: 1, vehPhase: '', lastLand: '', landSpeed: 0, landT: 0, rateOut: 0, slopeOn: false });
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
      const observedMotion = readMotion?.();
      const seatSurface = observedMotion?.seat;
      const bootSurface = { left: { vertices: 0, minClearance: Infinity }, right: { vertices: 0, minClearance: Infinity } };
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
          if (seatSurface && observedMotion?.probeGround) {
            const hit = observedMotion.probeGround(v.x, v.z, seatSurface.position[1] + .35);
            if (hit) { bootSurface[side].vertices++; bootSurface[side].minClearance = Math.min(bootSurface[side].minClearance, v.y - hit.y); }
          }
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
        root: group.current?.getWorldPosition(v).toArray() ?? null, soleCorrection:group.current?.position.y??0, soles, contactVertices,
        bootSurface: seatSurface ? bootSurface : null };
    };
    readActor = read;
    const skin = (topology: boolean) => group.current ? guideSkinEvidence(group.current, topology) : null;
    readSkin = skin;
    return () => { if (readActor === read) readActor = null; if (readSkin === skin) readSkin = null; };
  }, [rig]);
  useFrame((_, delta) => {
    const world = useWorldStore.getState();
    const s = state.current;
    const motion = readMotion?.() ?? { speedMps: initialSpeed, grounded: initialGrounded, facing: initialFacing } as WorldGuideMotion;
    const shown = visible && !motion.hidden;
    const resumed = shown && !s.visible;
    if (group.current) group.current.visible = shown;
    if (!shown && s.visible) { stop.current?.cancel('hidden'); rig.inert.reset(); s.hasLast = false; }
    s.visible = shown;
    if (world.paused || world.shot || !shown) return;
    const dt = Math.max(1e-6, Math.min(delta, .08));
    const { speedMps, grounded, facing, targetSpeedMps } = motion;
    group.current?.updateWorldMatrix(true, false);
    group.current?.getWorldPosition(rig.motionPoint);
    const moved = Math.hypot(rig.motionPoint.x-rig.previousMotionPoint.x, rig.motionPoint.z-rig.previousMotionPoint.z);
    let travel = rig.hasMotionSample && moved < 1 ? moved : speedMps * dt;
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
    // ---- v3d states on top of the locomotion choice (all measured clips, inertialized switches)
    const seat = motion.seat ?? null;
    if (seat) s.lastSeat = seat;
    let shownYaw = facing, shownYawOverride: number | null = null;
    // Root offset: WorldActors snaps the body to the seat point on sit and back to a free spot on stand-up.
    // The shown guide keeps its place across that jump and covers it on foot (walk at <= 1.6 m/s), so
    // nothing teleports on screen. Horizontal only; height is handled by the seat blend below.
    const base = group.current?.parent ? group.current.parent.getWorldPosition(rig.baseWorld) : null;
    if (base) {
      // only the seat snaps (sit: body -> seat point; stand: seat -> free spot) are walked; any other jump
      // (respawn, fixture, vehicle exit) is a cut and resets the offset
      const jump = Math.hypot(base.x - rig.lastWorld.x, base.z - rig.lastWorld.z);
      if (!!seat !== s.prevSeated) s.seatChangeT = 0; else s.seatChangeT += dt;
      // the store flag and the physics snap can land on different rendered frames
      const seatSnap = s.seatChangeT < .3;
      if (s.hasLast && (jump > .3 || (seatSnap && jump > .001))) {
        if (seatSnap && jump < 2.5 && !motion.vehicle) { rig.rootOff.x += rig.lastWorld.x - base.x; rig.rootOff.z += rig.lastWorld.z - base.z; }
        else rig.rootOff.set(0, 0, 0);
      }
      s.prevSeated = !!seat;
      rig.lastWorld.copy(base); s.hasLast = true;
      if (!seat && !/^Sit|^StandUp/.test(s.current) && grounded && !motion.vehicle) s.groundY = base.y;
    }
    let approach = false;
    {
      const len = Math.hypot(rig.rootOff.x, rig.rootOff.z);
      const standing = s.current === 'StandUp' && rig.actions.StandUp && rig.actions.StandUp.time < rig.actions.StandUp.getClip().duration - 1e-3;
      if (len > .02 && !standing && !CROSSFADE_AB) {
        if (intent !== 'idle' && !seat) { const k = Math.exp(-dt / .12); rig.rootOff.x *= k; rig.rootOff.z *= k; }
        else {
          const step = Math.min(len, 1.6 * dt);
          shownYawOverride = Math.atan2(rig.rootOff.z, -rig.rootOff.x);   // facing the way the guide walks (toward the body)
          rig.rootOff.x -= rig.rootOff.x / len * step; rig.rootOff.z -= rig.rootOff.z / len * step;
          travel = step; approach = true;
        }
      } else if (len <= .02) rig.rootOff.set(0, 0, 0);
    }
    if (rig.extras && !CROSSFADE_AB) {
      const act = (n: string) => rig.actions[n], done = (n: string) => s.current === n && act(n).time >= act(n).getClip().duration - 1e-3;
      if (seat) {
        // seated: SitDown (0.58 s) -> SitIdle (loop) while store.seat holds
        desired = approach && s.current !== 'SitDown' && s.current !== 'SitIdle' ? 'Walk'
          : s.current === 'SitDown' && !done('SitDown') ? 'SitDown' : s.current === 'SitDown' || s.current === 'SitIdle' ? 'SitIdle' : 'SitDown';
        s.sat = true; s.turn = null;
      } else if (s.sat) {
        // standing up: StandUp plays out unless movement interrupts after half of it
        const half = s.current === 'StandUp' && act('StandUp').time > act('StandUp').getClip().duration * .5;
        if (s.current !== 'StandUp') desired = 'StandUp';
        else if (done('StandUp') || (half && intent !== 'idle')) { s.sat = false; }
        else desired = 'StandUp';
      }
      // turn in place: a large heading change from a standstill (WorldActors turns the capsule first, A3).
      // The shown body follows the measured turn's own yaw curve, scaled to the actual angle, so the feet
      // step with the turn instead of the whole body spinning on planted boots.
      if (!s.yawInit) { s.shownYaw = facing; s.yawInit = true; }
      const dYaw = Math.atan2(Math.sin(facing - s.shownYaw), Math.cos(facing - s.shownYaw));
      if (!seat && !s.sat && !approach && grounded && !s.turn && Math.abs(dYaw) > TURN_MIN && speedMps < .3 && (desired === 'Idle' || isGait(desired))) {
        s.turn = { clip: dYaw > 0 ? 'TurnL' : 'TurnR', from: s.shownYaw, to: facing, t: 0 };
      }
      if (s.turn) {
        const tr = s.turn; tr.to = facing;
        const curve = rig.yawCurve[tr.clip], n = curve?.length ?? 0, dur = act(tr.clip).getClip().duration;
        // play the turn at up to 2x so a quick key turn is not a slow ceremonial pivot (body stays <= 0.6 s behind)
        const total = Math.atan2(Math.sin(tr.to - tr.from), Math.cos(tr.to - tr.from));
        const rate = Math.min(2, Math.max(1, dur / .6));
        tr.t = Math.min(dur, tr.t + dt * rate);
        act(tr.clip).setEffectiveTimeScale(0); act(tr.clip).time = tr.t;
        const k = n > 1 ? curve[Math.min(n - 1, Math.round(tr.t / dur * (n - 1)))] / (curve[n - 1] || 1) : tr.t / dur;
        shownYaw = tr.from + total * Math.min(1, Math.max(0, k));
        // leave the turn when it is finished or the player starts moving off (the gait takes the yaw at once)
        // The capsule only turns in place while it is held still (WorldActors turn-before-move); the moment it
        // moves off, the gait takes over at the real heading (inertialized), so no planted foot is dragged.
        if (tr.t >= dur - 1e-3 || speedMps > .3 || !grounded || seat) { s.turn = null; shownYaw = facing; }
        else desired = tr.clip;
      }
      // idle variation: after 5-9 s of standing still, one measured look-around (100STYLE), then back to Idle
      if (desired === 'Idle' && s.current === 'Idle') { s.idleT += dt; if (s.idleT > s.idleNext) { desired = 'IdleLook'; s.idleT = 0; s.idleNext = IDLE_VARY[0] + Math.random() * (IDLE_VARY[1] - IDLE_VARY[0]); } }
      else if (desired === 'Idle' && s.current === 'IdleLook' && !done('IdleLook')) desired = 'IdleLook';
      else if (desired !== 'Idle') s.idleT = 0;
    }
    // ---- vehicle enter / exit (<= 0.8 s): a visible walk/run step between the player spot and the door
    // anchor (WorldActors: car body + door offset), fading out into / in from the car. No physics involved.
    const vt = motion.vehicle ?? null;
    rig.vehOff.set(0, 0, 0);
    if (vt && group.current?.parent) {
      // Enter and exit use different door frames, separated by a hidden driving state. An outgoing
      // walk velocity is not a valid extrapolation for the next door's first pose (whose fade starts at 0).
      if (s.vehPhase !== vt.phase) rig.inert.reset();
      const base = group.current.parent.getWorldPosition(rig.baseWorld);
      const dx = vt.door[0] - base.x, dz = vt.door[2] - base.z, dist = Math.hypot(dx, dz);
      const e = vt.t * vt.t * (3 - 2 * vt.t), k = vt.phase === 'enter' ? e : 1 - e;
      const prevX = s.vehPhase ? rig.vehOff.x : 0;
      rig.vehOff.set(dx * k, 0, dz * k);
      travel = dist * Math.abs(6 * vt.t * (1 - vt.t)) * dt / Math.max(.35, Math.min(.8, .25 + dist / 4.5)); void prevX;
      shownYaw = vt.phase === 'enter' ? Math.atan2(-dz, dx) : Math.atan2(dz, -dx);
      const v = travel / dt;
      desired = v > 2.2 ? 'Run' : v > .2 ? 'Walk' : 'Idle';
      // fade: entering vanishes over the last 45 %, exiting appears over the first 40 %
      s.faded = vt.phase === 'enter' ? 1 - Math.min(1, Math.max(0, (vt.t - .55) / .45)) : Math.min(1, vt.t / .4);
      s.vehPhase = vt.phase; s.turn = null;
    } else { s.faded = 1; s.vehPhase = ''; }
    if (approach && !seat && !s.sat && grounded && (desired === 'Idle' || desired === 'IdleLook')) desired = 'Walk';
    if (shownYawOverride !== null && (desired === 'Walk' || isGait(desired))) shownYaw = shownYawOverride;
    // SitDown: the guide arrives facing away from the seat's front over the first 0.25 s (seat.yaw is the
    // sitting heading, WorldActors already set facing to it)
    s.shownYaw = shownYaw;
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
        const interaction = EXTRAS.includes(desired) || EXTRAS.includes(s.current);
        rig.inert.begin(INERT[interaction ? 'interaction' : desired.endsWith('Start') ? 'start' : desired.endsWith('Air') ? 'air' : desired === 'Land' ? 'land' : isGait(desired) ? 'gait' : 'idle'],
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
    // Door-step animation has its own moving visual root; a world-space stop anchor from the previous
    // door frame would cross the legs. Resume the ordinary stop helper after the door transition.
    if (vt) stop.current?.cancel('vehicle-door-frame');
    else stop.current?.preUpdate({ animation:s.current, grounded, speedMps, facing: shownYaw, visible: shown, wantsMove: CROSSFADE_AB ? undefined : intent !== 'idle' });
    rig.inert.capture();
    rig.mixer.update(dt); s.time += dt;
    rig.inert.apply(dt);
    if (group.current) {
      group.current.rotation.y = shownYaw;
      // Seated: the body (group) stands at seat.position (WorldActors). The measured sit puts the buttock
      // SIT_BUTTOCK above the soles; the seat point is the buttock contact, so the visual drops by that much
      // (soles then rest below the seat on the floor / dangle for a high seat, never inside the seat).
      // Root height while sitting: from the ground (feet planted) to seatY - SIT_BUTTOCK (buttock on the seat
      // point) during the hip descent of SitDown, and back during StandUp. A seat higher than the measured
      // 0.316 m leaves the short TABS legs dangling (never inside the seat); a lower one keeps the feet on the
      // ground (the root never goes below the ground it stood on).
      const sitting = s.current === 'SitDown' || s.current === 'SitIdle' || s.current === 'StandUp';
      const frac = (n: string) => Math.min(1, rig.actions[n].time / rig.actions[n].getClip().duration);
      const sstep = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
      const sitW = s.current === 'SitIdle' ? 1 : s.current === 'SitDown' ? sstep((frac('SitDown') - .35) / .6) : s.current === 'StandUp' ? 1 - sstep(frac('StandUp') / .6) : 0;
      const st = seat ?? s.lastSeat;
      s.sitDrop = 0;
      // walking to the seat (the body already sits at the seat point): feet stay on the ground they left
      if (approach && seat && Number.isFinite(s.groundY) && group.current.parent) s.sitDrop = group.current.parent.getWorldPosition(rig.baseWorld).y - s.groundY;
      if (sitting && st && Number.isFinite(s.groundY)) {
        const rootY = Math.max(s.groundY, s.groundY + (st.position[1] - SIT_BUTTOCK - s.groundY) * sitW);
        s.sitDrop = (group.current.parent ? group.current.parent.getWorldPosition(rig.baseWorld).y : rootY) - rootY;
      }
      group.current.updateWorldMatrix(true, true);
      const baseY = group.current.getWorldPosition(rig.rootPoint).y - group.current.position.y;
      // Moving landing: short additive spine/chest compression (<= 0.15 s, spec 1.4), no foot change.
      if (s.lastLand === 'moving-entered' || s.lastLand === 'moving') {
        s.landT = (s.landT ?? 0) + dt;
        const k = Math.min(1, s.landSpeed / 5) * Math.sin(Math.PI * Math.min(1, s.landT / LAND_ADD));
        if (s.landT >= LAND_ADD) { s.lastLand = ''; s.landT = 0; }
        else for (const b of rig.spineBones) b.quaternion.multiply(_landQ.setFromAxisAngle(b.userData.landAxis, LAND_PITCH * k));
      } else s.landT = 0;
      // Running turn lean and accel/brake pitch (additive spine/chest, visual only). Centripetal a = v * yaw
      // rate; lean = atan(a / g) * 0.5, <= 14 deg; pitch from the speed change, <= 6 deg. Smoothed 0.12 s.
      {
        const yawRate = Math.atan2(Math.sin(facing - s.prevFacing), Math.cos(facing - s.prevFacing)) / dt;
        const accel = (speedMps - s.prevSpeed) / dt;
        s.prevFacing = facing; s.prevSpeed = speedMps;
        const moving = grounded && isGait(s.current) && speedMps > 1.5;
        const leanT = moving ? Math.max(-.24, Math.min(.24, .5 * Math.atan(speedMps * yawRate / 9.81))) : 0;
        const pitchT = moving ? Math.max(-.1, Math.min(.1, .012 * accel)) : 0;
        const a = 1 - Math.exp(-dt / .12);
        s.lean += (leanT - s.lean) * a; s.pitch += (pitchT - s.pitch) * a;
        if (Math.abs(s.lean) > 1e-3 || Math.abs(s.pitch) > 1e-3) for (const b of rig.spineBones) {
          b.quaternion.multiply(_landQ.setFromAxisAngle(b.userData.leanAxis, -s.lean * .5));
          b.quaternion.multiply(_landQ.setFromAxisAngle(b.userData.landAxis, s.pitch * .5));
        }
      }
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
      s.slopeOn = grounded && !s.current.endsWith('Air') && !s.current.endsWith('Start') && !/^Sit|^StandUp/.test(s.current) && !s.vehPhase;
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
      group.current.position.y=grounded&&Number.isFinite(minSole)&&!s.sitDrop?Math.min(.025,Math.max(0,.0015-minSole)):0;
      // seat alignment (see SIT_BUTTOCK) and the vehicle step offset, in the parent (body) frame
      group.current.position.y -= s.sitDrop;
      // The buttock moves forward inside the baked sit; compensate continuously with the hip descent.
      // Using sitDrop as a boolean also shifted the approach walk and popped 15.4 cm at its boundary.
      const back = SIT_FORWARD * sitW;
      group.current.position.x = rig.vehOff.x + rig.rootOff.x - back * Math.cos(shownYaw);
      group.current.position.z = rig.vehOff.z + rig.rootOff.z + back * Math.sin(shownYaw);
      // the body rotation is fixed (enabledRotations off), so world offsets equal parent-frame offsets
      // dithered (alpha-hash) fade: opaque depth-sorted pixels, so the inside of the helmet/body never shows
      // through as it would with blended transparency
      const fadeOn = s.faded < .999;
      for (const m of rig.materials) {
        if (m.alphaHash !== fadeOn) { m.alphaHash = fadeOn; m.needsUpdate = true; }
        m.opacity = s.faded;
      }
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
        recorder.frames.push({ t: +s.time.toFixed(4), wallTime: performance.now()/1000, cut: resumed, dt: +dt.toFixed(4), anim: s.current, at: +rig.actions[s.current].time.toFixed(4), ts: +rig.actions[s.current].getEffectiveTimeScale().toFixed(3), grounded, speed: +speedMps.toFixed(3), facing: +facing.toFixed(4),
          ...(recorder.skin ? { skin: guideSkinEvidence(group.current), actor: { animation: s.current, animationTime: rig.actions[s.current].time } } : {}),
          root: rootW.toArray().map(v => +v.toFixed(4)), joints, soles, inert: [+res.angle.toFixed(4), +res.pelvis.toFixed(4)], switches: rig.inert.switches,
          contact: rig.slope.legs.left && [+rig.slope.legs.left.contact.toFixed(2), +rig.slope.legs.right.contact.toFixed(2)], lift: +group.current.position.y.toFixed(4), veh: motion.vehicle ? [motion.vehicle.phase, +motion.vehicle.t.toFixed(3)] : null, fade: +s.faded.toFixed(3), sitDrop: +s.sitDrop.toFixed(4), off: [+rig.rootOff.x.toFixed(3), +rig.rootOff.z.toFixed(3)], shownYaw: +shownYaw.toFixed(3), slope: rig.slope.debug(), stepping: stop.current ? (() => { const d = stop.current!.debug(); return [d.left.stepping ? 1 : 0, d.right.stepping ? 1 : 0, d.state]; })() : null });
      }
    }
  });
  return <group ref={group} name="world-guide-G24" visible={visible} userData={{ assetId: 'G24', rig: 'custom-L1' }}><primitive object={rig.scene} /></group>;
}
export default function WorldGuide(props: WorldGuideProps) {
  return <GuideBoundary fallback={props.fallback}><Suspense fallback={props.fallback ?? null}><GuideModel {...props} /></Suspense></GuideBoundary>;
}
