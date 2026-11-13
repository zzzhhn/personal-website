import { CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Builder, cbox, bar, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactorySolid } from './factory-geometry.ts';
import type { FactoryModule } from './factory-game.ts';
import type { FactoryPoint } from './factory-layout.ts';
import { FACTORY_ASSEMBLY_CONTACT, FACTORY_ASSEMBLY_PICK, FACTORY_ASSEMBLY_IDLE } from './factory-operation.ts';
import { factoryBatchPosition, sampleFactoryRoute } from './factory-routing.ts';

type Palette = Record<'teal'|'steel'|'silver'|'dark'|'amber'|'cream', Surf>;
export const FACTORY_RETURN_RAIL = { x: [-25, 26.5], z: [-23.8, 18], top: 7.5 } as const;
export const FACTORY_RETURN_CARRY_Y = 6.2;
export const FACTORY_RETURN_HOME: FactoryPoint = [26, FACTORY_RETURN_CARRY_Y, -22.8];
export const FACTORY_RETURN_SPEED = { horizontal: 3.2, vertical: 1.8, reformSeconds: 1.2 } as const;
export type FactoryReturnPhase = 'fetch'|'pickup'|'clamp'|'lift'|'traverse'|'lower'|'reform'|'retract'|'home'|'done'
  |'clear-fetch'|'clear-pickup'|'clear-lift'|'clear-carry'|'clear-seat'|'clear-retract'|'clear-home'
  |'restore-fetch'|'restore-pickup'|'restore-lift'|'restore-carry'|'restore-seat'|'restore-retract'|'restore-home';
export interface FactoryReturnLeg {
  phase: Exclude<FactoryReturnPhase, 'done'>;
  path: FactoryPoint[];
  seconds: number;
  actuator: 'return'|'assembly';
  assemblyModule: FactoryModule|null;
  assemblyAttached: boolean;
}
export interface FactoryReturnPlan {
  module: FactoryModule;
  source: FactoryPoint;
  blankPosition: FactoryPoint;
  legs: FactoryReturnLeg[];
  duration: number;
  temporaryModules: FactoryModule[];
}
export interface FactoryReturnPose {
  phase: FactoryReturnPhase;
  /** Manufactured module anchor; after reform, use blankPosition instead. */
  part: FactoryPoint;
  /** Tool anchor uses the same datum as the manufactured module. */
  tool: FactoryPoint;
  blankPosition: FactoryPoint;
  attached: boolean;
  blankVisible: boolean;
  jawClosure: number;
  /** Apply these module positions only for plan.temporaryModules. The original
   * assembly hoist temporarily places obstructing shell/frame on their carriers.
   * Shell stays on its carrier; retained frame restores after wheel return. */
  temporary: Record<FactoryModule, FactoryPoint>;
  assemblyTool: FactoryPoint;
  assemblyModule: FactoryModule|null;
  assemblyAttached: boolean;
}
export const factoryReturnSource = (module: FactoryModule, seated: boolean): FactoryPoint =>
  [...(seated ? FACTORY_ASSEMBLY_CONTACT : FACTORY_ASSEMBLY_PICK[module])];
const copy = (to: FactoryPoint, from: readonly number[]) => {
  to[0] = from[0]; to[1] = from[1]; to[2] = from[2];
};
const length = (path: readonly FactoryPoint[]) => path.slice(1).reduce((n, p, i) =>
  n + Math.hypot(...p.map((v, k) => v - path[i][k])), 0);

/** Make once per operation. A dedicated bridge carries the load, never the old
 * eastern dispatch belt. This crane stays below both the sawtooth roof and the
 * original assembly crane. Pass the actual seated modules from the game. Shell
 * is cleared before frame/wheels, then frame before wheels. The original hoist
 * puts them on their real outfeed carriers, not in ungrounded parking positions.
 * Shell remains there, matching the unassembled post-rework state. Frame is
 * restored only after wheel return has finished and the return crane is parked.
 * The caller owns the reform visual: replace only the selected manufactured
 * module with its raw blank when blankVisible becomes true, then commit after
 * retract. Both representations have exactly the same anchor at that handoff;
 * the raw blank's underside then meets the existing batching deck.
 *
 * SOURCE-ONLY CANDIDATE, NOT RUNTIME INTEGRATED: no closed reclaim housing is
 * provided, so a direct manufactured-part/raw-blank swap remains visually
 * abrupt. Existing .8 m staging-pocket spacing was authored for raw blanks;
 * clearance for a returned wheel assembly and neighbouring blanks is unverified.
 * Do not interpret route/contact tests as reclaim-process or runtime acceptance. */
export function createFactoryReturnPlan(module: FactoryModule, source = factoryReturnSource(module, true),
  seatedModules: readonly FactoryModule[] = ['frame', 'wheels']): FactoryReturnPlan {
  const [x0, x1] = FACTORY_RETURN_RAIL.x, [z0, z1] = FACTORY_RETURN_RAIL.z;
  if (source.some(v => !Number.isFinite(v)) || source[0] < x0 + .6 || source[0] > x1 - .6 ||
    source[2] < z0 + .75 || source[2] > z1 - .75 || source[1] < .12 || source[1] >= FACTORY_RETURN_CARRY_Y)
    throw new RangeError('Return source is outside the supported crane envelope');
  const blankPosition = factoryBatchPosition(module), high: FactoryPoint = [source[0], FACTORY_RETURN_CARRY_Y, source[2]];
  const endHigh: FactoryPoint = [blankPosition[0], FACTORY_RETURN_CARRY_Y, blankPosition[2]];
  const atFixture = source.every((v, i) => Math.abs(v - FACTORY_ASSEMBLY_CONTACT[i]) < 1e-6);
  const temporaryModules: FactoryModule[] = [];
  if (atFixture && module !== 'shell' && seatedModules.includes('shell')) temporaryModules.push('shell');
  if (atFixture && module === 'wheels' && seatedModules.includes('frame')) temporaryModules.push('frame');
  const legs: FactoryReturnLeg[] = [];
  const leg = (phase: FactoryReturnLeg['phase'], path: FactoryPoint[], speed: number,
    actuator: FactoryReturnLeg['actuator'] = 'return', assemblyModule: FactoryModule|null = null, assemblyAttached = false) =>
    legs.push({ phase, path, seconds: Math.max(.001, length(path) / speed), actuator, assemblyModule, assemblyAttached });
  let assemblyAt: FactoryPoint = [...FACTORY_ASSEMBLY_IDLE];
  const moveTemporary = (temporary: FactoryModule, restore: boolean) => {
    const start = restore ? FACTORY_ASSEMBLY_PICK[temporary] : FACTORY_ASSEMBLY_CONTACT;
    const end = restore ? FACTORY_ASSEMBLY_CONTACT : FACTORY_ASSEMBLY_PICK[temporary];
    const startHigh: FactoryPoint = [start[0], 3.4, start[2]], endHigh: FactoryPoint = [end[0], 3.4, end[2]];
    const prefix = restore ? 'restore' : 'clear';
    leg(`${prefix}-fetch`, [assemblyAt, [start[0], 3.4, assemblyAt[2]], startHigh], FACTORY_RETURN_SPEED.horizontal, 'assembly', temporary);
    leg(`${prefix}-pickup`, [startHigh, [...start]], FACTORY_RETURN_SPEED.vertical, 'assembly', temporary);
    leg(`${prefix}-lift`, [[...start], startHigh], FACTORY_RETURN_SPEED.vertical, 'assembly', temporary, true);
    leg(`${prefix}-carry`, [startHigh, [end[0], 3.4, start[2]], endHigh], FACTORY_RETURN_SPEED.horizontal, 'assembly', temporary, true);
    leg(`${prefix}-seat`, [endHigh, [...end]], FACTORY_RETURN_SPEED.vertical, 'assembly', temporary, true);
    leg(`${prefix}-retract`, [[...end], endHigh], FACTORY_RETURN_SPEED.vertical, 'assembly', temporary);
    assemblyAt = endHigh;
  };
  const parkAssembly = (phase: 'clear-home'|'restore-home') => {
    leg(phase, [assemblyAt, [FACTORY_ASSEMBLY_IDLE[0], 3.4, assemblyAt[2]], [...FACTORY_ASSEMBLY_IDLE]], FACTORY_RETURN_SPEED.horizontal, 'assembly');
    assemblyAt = [...FACTORY_ASSEMBLY_IDLE];
  };
  temporaryModules.forEach(temporary => moveTemporary(temporary, false));
  if (temporaryModules.length) parkAssembly('clear-home');
  leg('fetch', [[...FACTORY_RETURN_HOME], [source[0], FACTORY_RETURN_CARRY_Y, FACTORY_RETURN_HOME[2]], high], FACTORY_RETURN_SPEED.horizontal);
  leg('pickup', [high, [...source]], FACTORY_RETURN_SPEED.vertical);
  legs.push({ phase: 'clamp', path: [[...source], [...source]], seconds: .35, actuator: 'return', assemblyModule: null, assemblyAttached: false });
  leg('lift', [[...source], high], FACTORY_RETURN_SPEED.vertical);
  leg('traverse', [high, [source[0], FACTORY_RETURN_CARRY_Y, -4], [-24, FACTORY_RETURN_CARRY_Y, -4], endHigh], FACTORY_RETURN_SPEED.horizontal);
  leg('lower', [endHigh, [...blankPosition]], FACTORY_RETURN_SPEED.vertical);
  legs.push({ phase: 'reform', path: [[...blankPosition], [...blankPosition]], seconds: FACTORY_RETURN_SPEED.reformSeconds, actuator: 'return', assemblyModule: null, assemblyAttached: false });
  leg('retract', [[...blankPosition], endHigh], FACTORY_RETURN_SPEED.vertical);
  leg('home', [endHigh, [FACTORY_RETURN_HOME[0], FACTORY_RETURN_CARRY_Y, endHigh[2]], [...FACTORY_RETURN_HOME]], FACTORY_RETURN_SPEED.horizontal);
  if (temporaryModules.includes('frame')) {
    moveTemporary('frame', true);
    parkAssembly('restore-home');
  }
  return { module, source: [...source], blankPosition, legs, duration: legs.reduce((n, l) => n + l.seconds, 0), temporaryModules };
}

/** Allocation-free sampling. Pass linear elapsed/duration, not per-leg easing.
 * No manufactured part travels unattached; no raw blank moves after release. */
export function sampleFactoryReturn(plan: FactoryReturnPlan, progress: number, out: FactoryReturnPose) {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  let time = normalized * plan.duration;
  copy(out.tool, FACTORY_RETURN_HOME); copy(out.assemblyTool, FACTORY_ASSEMBLY_IDLE);
  copy(out.temporary.frame, FACTORY_ASSEMBLY_CONTACT); copy(out.temporary.wheels, FACTORY_ASSEMBLY_CONTACT);
  copy(out.temporary.shell, FACTORY_ASSEMBLY_CONTACT);
  out.assemblyModule = null; out.assemblyAttached = false;
  out.blankVisible = false;
  let leg = plan.legs[plan.legs.length - 1];
  for (const candidate of plan.legs) {
    leg = candidate;
    // A summed duration can lose a few ulps when individual legs are subtracted.
    // At the committed endpoint every actuator must use its authored endpoint,
    // rather than an almost-one interpolation that changes exact saved poses.
    const completed = normalized === 1 || time >= candidate.seconds;
    const t = completed ? 1 : time / candidate.seconds;
    sampleFactoryRoute(candidate.path, t, candidate.actuator === 'return' ? out.tool : out.assemblyTool);
    out.assemblyModule = candidate.assemblyModule;
    out.assemblyAttached = candidate.assemblyAttached;
    if (candidate.actuator === 'assembly' && candidate.assemblyModule && candidate.assemblyAttached)
      copy(out.temporary[candidate.assemblyModule], out.assemblyTool);
    if (!completed) break;
    if (candidate.phase === 'reform') out.blankVisible = true;
    time -= candidate.seconds;
  }
  out.phase = normalized >= 1 ? 'done' : leg.phase;
  const t = out.phase === 'done' ? 1 : Math.min(1, time / leg.seconds);
  out.attached = out.phase === 'lift' || out.phase === 'traverse' || out.phase === 'lower' || out.phase === 'reform';
  out.jawClosure = out.phase === 'clamp' ? t : out.attached ? 1 : 0;
  copy(out.blankPosition, plan.blankPosition);
  copy(out.part, out.attached ? out.tool : out.blankVisible ? plan.blankPosition : plan.source);
  return out;
}

export function createFactoryReturnPose(): FactoryReturnPose {
  return { phase: 'fetch', part: [0, 0, 0], tool: [0, 0, 0], blankPosition: [0, 0, 0], attached: false, blankVisible: false,
    jawClosure: 0, temporary: { frame: [0, 0, 0], wheels: [0, 0, 0], shell: [0, 0, 0] },
    assemblyTool: [0, 0, 0], assemblyModule: null, assemblyAttached: false };
}

/** Merge this geometry with the static factory before baking. Every runway is
 * column-supported; the X bridge below travels on these two Z runways. Column
 * bays avoid press casing/line throats and the visitor graph's outer aisles.
 * No materials, textures, lights or collision registration are owned here. */
export function buildFactoryReturnGeometry(P: Palette) {
  const b = new Builder(), solids: FactorySolid[] = [];
  const box = (at: V3, size: V3, surface: Surf, solid = false) => {
    cbox(b, at, size, surface, .015);
    if (solid) solids.push({ at, size });
  };
  const rail = FACTORY_RETURN_RAIL, centreZ = (rail.z[0] + rail.z[1]) / 2, spanZ = rail.z[1] - rail.z[0];
  for (const x of rail.x) {
    for (const z of [rail.z[0], -17, -4, 8, rail.z[1]]) {
      box([x, .25, z], [.7, .26, .7], P.dark, true);
      box([x, 3.78, z], [.34, 6.82, .34], P.teal, true);
      for (const direction of [-1, 1]) if (z + direction * .9 > rail.z[0] && z + direction * .9 < rail.z[1])
        bar(b, [x, 6.25, z], [x, 7.1, z + direction * .9], .1, P.steel, 6);
    }
    box([x, 7.23, centreZ], [.16, .4, spanZ], P.teal);
    for (const y of [7.01, 7.45]) box([x, y, centreZ], [.55, .1, spanZ], P.teal);
    // Flush-running strip top is the exact 7.5 m wheel tangent.
    box([x, 7.48, centreZ], [.24, .04, spanZ], P.silver);
    for (const z of rail.z) box([x, 7.65, z], [.55, .3, .14], P.dark);
  }
  const geometry = b.build();
  return { geometry, solids, triangles: b.triangles };
}

/** Jaw inner faces touch existing module surfaces. The frame's rack is gripped
 * above retained wheels; wheel jaws close on outer tyre faces; shell jaws meet
 * side skin. No carrier is picked up or carried through the assembly fixture. */
export const FACTORY_RETURN_GRIP = {
  // The .013 m vertical rack bars at X=+/-.18 expose X=+/-.193.
  frame: { head: .75, jawX: .208, jawY: .54, jawHeight: .07, jawDepth: .5 },
  wheels: { head: .54, jawX: .34, jawY: .205, jawHeight: .24, jawDepth: .85 },
  shell: { head: .75, jawX: .265, jawY: .45, jawHeight: .2, jawDepth: .62 },
} as const;

/** Visible mechanical attachment for sampleFactoryReturn. Caller adds the
 * group once, updates it from the same sampled pose as the part, and disposes
 * once. Shared jaw/rope geometry; no per-frame allocation. */
export function buildFactoryReturnHoist(P: Palette) {
  const group = new Group(), bridge = new Group(), trolley = new Group(), head = new Group();
  group.name = 'factory-return-hoist'; bridge.name = 'return-moving-bridge';
  trolley.name = 'return-trolley'; head.name = 'return-module-gripper';
  group.add(bridge, trolley, head);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3 });
  const geometries: Array<ReturnType<Builder['build']>> = [];
  const add = (parent: Group, b: Builder) => {
    const geometry = b.build(); geometries.push(geometry);
    const mesh = new Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  };
  const beam = new Builder(), rail = FACTORY_RETURN_RAIL, centreX = (rail.x[0] + rail.x[1]) / 2, spanX = rail.x[1] - rail.x[0];
  for (const z of [-.4, .4]) {
    cbox(beam, [centreX, 7.86, z], [spanX, .4, .14], P.amber, .015);
    for (const y of [7.64, 8.06]) cbox(beam, [centreX, y, z], [spanX, .08, .34], P.amber, .015);
  }
  for (const x of rail.x) {
    cbox(beam, [x, 7.85, 0], [.64, .22, 1.4], P.teal, .02);
    for (const z of [-.5, .5]) bar(beam, [x - .15, 7.62, z], [x + .15, 7.62, z], .12, P.silver, 12);
  }
  add(bridge, beam);
  const cart = new Builder();
  cbox(cart, [0, 8.375, 0], [1.15, .15, 1.2], P.teal, .025);
  cbox(cart, [0, 8.6, 0], [.7, .28, .8], P.cream, .025);
  for (const x of [-.35, .35]) for (const z of [-.4, .4])
    bar(cart, [x - .1, 8.2, z], [x + .1, 8.2, z], .1, P.silver, 12);
  for (const x of [-.3, .3]) cbox(cart, [x, 7.94, 0], [.08, .6, .6], P.teal, .01);
  cbox(cart, [0, 7.66, 0], [.65, .16, .5], P.steel, .015);
  add(trolley, cart);
  const grip = new Builder();
  cbox(grip, [0, 0, 0], [.62, .12, .94], P.amber, .02);
  cbox(grip, [0, .12, 0], [.32, .12, .4], P.teal, .02);
  add(head, grip);
  const jawBuilder = new Builder();
  cbox(jawBuilder, [0, 0, 0], [1, 1, 1], P.steel);
  const jawGeometry = jawBuilder.build(), ropeGeometry = new CylinderGeometry(.022, .022, 1, 6);
  const ropeMaterial = new MeshStandardMaterial({ color: '#596966', roughness: .5, metalness: .5 });
  geometries.push(jawGeometry, ropeGeometry);
  const jaws = [-1, 1].map(() => { const mesh = new Mesh(jawGeometry, material); head.add(mesh); return mesh; });
  const arms = [-1, 1].map(() => { const mesh = new Mesh(jawGeometry, material); head.add(mesh); return mesh; });
  const ropes = [-1, 1].map(() => { const mesh = new Mesh(ropeGeometry, ropeMaterial); group.add(mesh); return mesh; });
  let disposed = false;
  function update(pose: FactoryReturnPose, module: FactoryModule) {
    if (disposed) return;
    const [x, y, z] = pose.tool, spec = FACTORY_RETURN_GRIP[module], headY = y + spec.head;
    bridge.position.z = z; trolley.position.set(x, 0, z); head.position.set(x, headY, z);
    const opening = .12 * (1 - pose.jawClosure), armTop = -.06, jawTop = spec.jawY - spec.head + spec.jawHeight / 2;
    for (let i = 0; i < 2; i++) {
      const mesh = jaws[i];
      mesh.position.set((i ? 1 : -1) * (spec.jawX + opening), spec.jawY - spec.head, 0);
      mesh.scale.set(.03, spec.jawHeight, spec.jawDepth);
    }
    for (let i = 0; i < 2; i++) {
      const mesh = arms[i];
      mesh.position.set((i ? 1 : -1) * (spec.jawX + opening), (armTop + jawTop) / 2, 0);
      mesh.scale.set(.03, Math.max(.01, armTop - jawTop), .1);
    }
    const bottom = headY + .18, top = 7.58;
    for (let i = 0; i < 2; i++) {
      const mesh = ropes[i];
      mesh.position.set(x + (i ? 1 : -1) * .13, (top + bottom) / 2, z);
      mesh.scale.y = Math.max(.01, top - bottom);
    }
  }
  const idle = createFactoryReturnPose(); copy(idle.tool, FACTORY_RETURN_HOME); update(idle, 'shell');
  return { group, bridge, trolley, head, jaws, update, dispose() {
    if (disposed) return;
    disposed = true; geometries.forEach(geometry => geometry.dispose()); material.dispose(); ropeMaterial.dispose();
  } };
}
