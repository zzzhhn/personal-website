import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coasterFrame, coasterSupports, coasterWorld, COASTER_LENGTH, COASTER_TUNNEL, COASTER_INVERSION, COASTER_GATE_Z } from './coaster-track.ts';
import { INTENT_STATIONS } from './intent-stations.ts';
import { bakeIntentNight, INTENT_LAMP_POINTS } from './intent-lighting.ts';
import { addCoasterLandscape } from './coaster-landscape.ts';
import type { Vec3 } from '../types';

export const COASTER_PALETTE = { steel: '#526b79', dark: '#273e4e', rail: '#c2ccd1', concrete: '#a9aaa1', copper: '#c38c50', cyan: '#69dedb', gold: '#ffcc83', white: '#d9ddd5' };
const P = COASTER_PALETTE;
export class CoasterBatch {
  parts: BufferGeometry[] = [];
  readonly lightingOrigin: Vec3;
  constructor(lightingOrigin: Vec3 = [0, 0, 0]) { this.lightingOrigin = lightingOrigin; }
  add(geometry: BufferGeometry, color: string, matrix?: Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    const c = new Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(colors, 3)); bakeIntentNight(g, this.lightingOrigin); this.parts.push(g);
  }
  box(position: Vec3, size: Vec3, color: string, rotation?: Quaternion) {
    const segments = size.map(v => Math.min(16, Math.max(1, Math.ceil(v / 4)))) as Vec3;
    this.add(new BoxGeometry(...size, ...segments), color, new Matrix4().compose(new Vector3(...position), rotation ?? new Quaternion(), new Vector3(1, 1, 1)));
  }
  beam(a: Vec3, b: Vec3, radius: number, color: string, sides = 6) {
    const start = new Vector3(...a), end = new Vector3(...b), d = end.clone().sub(start);
    if (d.lengthSq() < .00001) return;
    this.add(new CylinderGeometry(radius, radius, d.length(), sides, 1), color,
      new Matrix4().compose(start.add(end).multiplyScalar(.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()), new Vector3(1, 1, 1)));
  }
  housing(position: Vec3, size: Vec3, color: string) {
    const [w, h, d] = size, cut = Math.min(.65, h * .2, w * .15), shape = new Shape();
    shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2); shape.lineTo(w / 2, h / 2 - cut);
    shape.lineTo(w / 2 - cut, h / 2); shape.lineTo(-w / 2 + cut, h / 2); shape.lineTo(-w / 2, h / 2 - cut); shape.closePath();
    this.add(new ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), color, new Matrix4().makeTranslation(position[0], position[1], position[2] - d / 2));
  }
  finish() {
    const g = mergeGeometries(this.parts, false) ?? new BufferGeometry();
    this.parts.forEach(p => p.dispose()); this.parts.length = 0;
    g.computeBoundingSphere(); return g;
  }
}
const tuple = (v: Vector3) => v.toArray() as Vec3;
export interface CoasterCollider { position: Vec3; half: Vec3; surface?: boolean }
export function createCoasterStructure(detailed: boolean) {
  const steel = new CoasterBatch(), glow = new CoasterBatch(), colliders: CoasterCollider[] = [];
  const steps = detailed ? 800 : 280;
  for (let i = 0; i < steps; i++) {
    const a = coasterFrame(i / steps), b = coasterFrame((i + 1) / steps);
    for (const offset of [-.78, .78]) steel.beam(tuple(a.point.clone().addScaledVector(a.side, offset)), tuple(b.point.clone().addScaledVector(b.side, offset)), .11, P.rail);
    if (i % 3 === 0) steel.beam(tuple(a.point.clone().addScaledVector(a.side, -1)), tuple(a.point.clone().addScaledVector(a.side, 1)), .09, P.copper);
    if (i % 4 === 0) {
      const c = coasterFrame((i + 4) / steps);
      const spine = (f: ReturnType<typeof coasterFrame>) => f.point.clone().addScaledVector(f.up, -Math.min(.42, Math.max(.15, f.point.y - 1.45)));
      const spineA = spine(a), spineB = spine(c);
      steel.beam(tuple(spineA), tuple(spineB), .3, P.dark, 4);
      steel.beam(tuple(a.point.clone().addScaledVector(a.side, -.75)), tuple(spineB), .065, P.steel, 4);
    }
    if (i % 8 !== 7) for (const side of [-1, 1]) {
      const lightA = a.point.clone().addScaledVector(a.side, side * .98).addScaledVector(a.up, -.12);
      const lightB = b.point.clone().addScaledVector(b.side, side * .98).addScaledVector(b.up, -.12);
      const tint = Math.abs(i / steps - COASTER_INVERSION.top) < .025 ? '#ed7bb6' : '#37dce8';
      for (const axis of ['side', 'up'] as const) {
        const vertices = [lightA.clone().addScaledVector(a[axis], -.12), lightB.clone().addScaledVector(b[axis], -.12), lightB.clone().addScaledVector(b[axis], .12), lightA.clone().addScaledVector(a[axis], .12)];
        const order = axis === 'side' ? [0, 2, 1, 0, 3, 2] : side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        const strip = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(order.flatMap(v => vertices[v].toArray())), 3));
        strip.computeVertexNormals(); glow.add(strip, tint);
      }
    }
  }
  for (const { a, b, top } of coasterSupports(detailed)) {
    for (const p of [a, b]) {
      steel.beam([p.x, 1.2, p.z], tuple(p), .38, P.steel);
      steel.housing([p.x, 1.4, p.z], [2.1, .8, 2.1], P.concrete);
      colliders.push({ position: [p.x, (p.y + 1.2) / 2, p.z], half: [.38, (p.y - 1.2) / 2, .38] }, { position: [p.x, 1.4, p.z], half: [1.05, .4, 1.05] });
    }
    steel.beam(tuple(a), tuple(b), .3, P.dark);
    if (top.y > 9) {
      steel.beam([a.x, 1.6, a.z], tuple(b), .15, P.steel);
      steel.beam([b.x, 1.6, b.z], tuple(a), .15, P.steel);
    }
  }
  addArchitecture(steel, glow, colliders, detailed);
  addTunnel(steel, glow, detailed);
  const art = addCoasterLandscape(steel, glow, colliders, detailed);
  return { steel: steel.finish(), glow: glow.finish(), colliders, art };
}

function addTunnel(steel: CoasterBatch, glow: CoasterBatch, detailed: boolean) {
  const { start, end } = COASTER_TUNNEL, count = detailed ? 18 : 9;
  const bayLength = (end - start) * COASTER_LENGTH / count;
  for (let i = 0; i <= count; i++) {
    const f = coasterFrame(start + (end - start) * i / count);
    const p = (side: number, up: number) => tuple(f.point.clone().addScaledVector(f.side, side).addScaledVector(f.up, up));
    for (const side of [-3, 3]) {
      steel.beam(p(side, -.4), p(side, 4.25), .22, P.steel);
      glow.beam(p(side * .92, .2), p(side * .92, 4.1), .075, i % 3 ? P.cyan : P.gold, 4);
      if (i < count) steel.box(p(side, 1.5), [bayLength, 3.1, .3], i % 3 ? P.concrete : P.steel, f.rotation);
    }
    steel.beam(p(-3, 4.25), p(3, 4.25), .22, P.steel);
    glow.beam(p(-2.76, 4.1), p(2.76, 4.1), .075, i % 3 ? P.cyan : P.gold, 4);
    if (i < count) steel.box(p(0, 4.5), [bayLength, .45, 6.4], P.dark, f.rotation);
  }
}

function addArchitecture(steel: CoasterBatch, glow: CoasterBatch, colliders: CoasterCollider[], detailed: boolean) {
  const box = (p: Vec3, size: Vec3, color: string, solid = false, surface = false) => {
    steel.box(coasterWorld(p), size, color);
    if (solid) colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3, surface });
  };
  const housing = (p: Vec3, size: Vec3, color: string, solid = true) => {
    steel.housing(coasterWorld(p), size, color);
    if (solid) colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3 });
  };
  const light = (p: Vec3, size: Vec3, color = P.gold) => glow.box(coasterWorld(p), size, color);
  const beam = (a: Vec3, b: Vec3, radius: number, color = P.steel) => steel.beam(coasterWorld(a), coasterWorld(b), radius, color);
  // Warm, deep station frontage. The central aisle and actual boarding apron stay level.
  box([0, .04, 60.5], [110, .08, 9], P.concrete, true, true);
  box([-2, .04, 41.5], [18, .08, 23], P.concrete, true, true);
  box([0, .04, 55], [10, .08, 8], P.concrete, true, true);
  housing([-2, 6.8, 41.5], [18, 1.2, 23], P.dark);
  for (const x of [-10, 6]) for (const z of [31, x < 0 ? 43 : 51]) {
    housing([x, 3.1, z], [1.1, 6.2, 1.1], P.white);
    light([x - Math.sign(x) * .58, 3.8, z], [.08, 1.8, .5], P.gold);
  }
  housing([10, 3.1, 43], [5.5, 6.2, 14], P.white);
  housing([-14.5, 2.7, 35], [5, 5.4, 8], P.concrete);
  for (const z of [34, 39, 44, 49]) {
    light([-5, 5.9, z], [5, .15, .25]);
    box([7.17, 2.7, z], [.15, 1.6, 2.8], P.dark);
    light([7.06, 3.25, z], [.06, .3, 2.5], P.cyan);
  }
  box([-2, 7.55, 40], [9, .3, 6], P.steel);
  housing([10, 6.6, 43], [3.8, .8, 8], P.dark, false);
  // Dominant 44 m service tower beside the first crest, with real equipment mass.
  housing([-40, 22, -32], [7, 44, 9], P.white);
  housing([-44.2, 18, -33], [2, 36, 6], P.dark);
  housing([-40, 3, -25.8], [12, 6, 4], P.concrete);
  for (const y of [5, 15, 28, 41]) {
    box([-40, y, -26.95], [8.5, 1, 2.3], P.steel);
    light([-38.3, y + 1.5, -27.43], [.24, 2.1, .1]);
    light([-41.2, y + 2.7, -27.43], [.22, 1.3, .1], P.cyan);
  }
  light([-40, 44.3, -32], [.35, .6, .35]);
  // A tangible equipment house inside the descending helix, plus a separate rear power block.
  housing([-36, 5.4, 13], [9, 10.8, 9], P.white);
  housing([-36, 11.3, 13], [10.2, 1, 10.2], P.dark);
  housing([-35, 12.6, 13], [3.5, 1.6, 3.5], P.steel, false);
  housing([3, 3.8, -43], [10, 7.6, 8], P.concrete);
  housing([3, 8.1, -43], [10.8, 1, 8.8], P.dark);
  for (const x of [-39.5, -32.5]) light([x, 8.7, 17.58], [.3, 2.8, .1], P.cyan);
  for (let i = 0; i < 5; i++) {
    box([-36, 4.2 + i * .48, 17.58], [4.5, .18, .14], P.dark);
    box([3, 3 + i * .45, -38.94], [5, .16, .12], P.dark);
  }
  beam([-30.8, 1.2, 10], [-30.8, 8.7, 10], .42, P.copper);
  beam([-30.8, 8.7, 10], [-33, 8.7, 10], .42, P.copper);
  // Layered service structure is staff-only; closed stair access distinguishes it from the route to the ride.
  const deck = (p: Vec3, size: Vec3) => {
    box(p, size, P.concrete, true, true);
    const [x, y, z] = p, [w, , d] = size;
    for (const sx of [-1, 1]) beam([x + sx * w / 2, y + 1.2, z - d / 2], [x + sx * w / 2, y + 1.2, z + d / 2], .055, P.copper);
    for (let at = -d / 2; at <= d / 2; at += 3) for (const sx of [-1, 1]) beam([x + sx * w / 2, y, z + at], [x + sx * w / 2, y + 1.2, z + at], .055, P.copper);
  };
  deck([-51, 15.5, -5], [2.4, .45, 38]);
  deck([-47.7, 15.5, -24], [9, .45, 2.4]);
  deck([-44.5, 15.5, 14], [15.4, .45, 2.4]);
  for (const z of [-23, -8, 7]) housing([-51, 7.75, z], [.7, 15.5, .7], P.steel);
  for (let i = 0; i < 16; i++) box([-38.5 + i * .24, 15.3 - i * .23, 14], [.35, .2, 2], P.steel);
  // Fence remains visually open so the station, tower and lower track read from the entrance.
  for (const x of [-54, 54]) {
    for (const y of [1, 2.7]) beam([x, y, -64], [x, y, COASTER_GATE_Z], .08);
    colliders.push({ position: coasterWorld([x, 1.6, -4]), half: [.15, 1.6, 60] });
    for (let z = -64; z <= COASTER_GATE_Z; z += 5) housing([x, 1.6, z], [.32, 3.2, .32], P.concrete, false);
  }
  for (const z of [-64, COASTER_GATE_Z]) for (const side of [-1, 1]) {
    const centre = side * 29.5, width = 49;
    for (const y of [1, 2.7]) beam([centre - width / 2, y, z], [centre + width / 2, y, z], .08);
    colliders.push({ position: coasterWorld([centre, 1.6, z]), half: [width / 2, 1.6, .15] });
    for (let x = centre - width / 2; x <= centre + width / 2; x += 4) housing([x, 1.6, z], [.32, 3.2, .32], P.concrete, false);
  }
  for (const x of [-5.8, 5.8]) {
    housing([x, 3.3, COASTER_GATE_Z], [1.6, 6.6, 1.8], P.white);
    light([x, 3.5, COASTER_GATE_Z + .92], [.25, 2.3, .1], P.cyan);
  }
  housing([0, 6.4, COASTER_GATE_Z], [13.2, 1.3, 2], P.dark);
  // Three visibly different workstations share an accessible counter height.
  for (const station of INTENT_STATIONS) {
    const [x, , z] = station.origin;
    housing([x, .65, z], [7, 1.3, 3.4], P.concrete, false);
    box([x, 1.32, z], [7.3, .16, 3.6], P.dark);
    for (const dx of [-3.65, 3.65]) housing([x + dx, 2, z - 1.4], [.4, 4, .4], P.steel);
    housing([x, 3.85, z - 1.4], [7.8, 1.1, .65], P.dark);
    light([x, 3.2, z - 1.05], [6.8, .12, .16]);
    if (station.id === 'route') {
      housing([x - 4.7, 2.5, z - .7], [1.3, 5, 1.6], P.white);
      for (const y of [2.3, 3.2, 4.1]) light([x - 4.7, y, z + .13], [.8, .22, .1], P.cyan);
    } else if (station.id === 'press') {
      housing([x, 4.65, z - 1.4], [4, .5, 2], P.copper, false);
      for (const dx of [-4.3, 4.3]) housing([x + dx, 1.2, z - .5], [.8, 2.4, 2.5], P.white);
    } else {
      housing([x, 4.6, z - .4], [8.3, .5, 3.3], P.copper, false);
      housing([x + 4.4, .65, z], [1.3, 1.3, 1.4], P.white);
    }
  }
  // Rear fence has no guest exit; the only gate is on the forecourt.
  for (const y of [1, 2.7]) beam([-5, y, -64], [5, y, -64], .08);
  colliders.push({ position: coasterWorld([0, 1.6, -64]), half: [5, 1.6, .15] });
  if (detailed) {
    for (const x of [-43, -37]) for (const y of [8, 20, 33]) {
      box([x, y, -27.4], [.7, 2, .2], P.dark);
      light([x, y + .7, -27.25], [.45, .18, .12]);
    }
    for (let i = 0; i < 6; i++) box([8.5 + i * .6, 6.9, 43], [.25, .35, 5.5], P.rail);
    for (const x of [-41, -31]) beam([x, 12, 8], [x, 12, 18], .07, P.copper);
    for (const z of [8, 18]) beam([-41, 12, z], [-31, 12, z], .07, P.copper);
    // Ladder is fenced staff access, not an implied guest route.
    for (const x of [-52, -51]) beam([x, .2, -23], [x, 15.7, -23], .08);
    for (let y = .4; y < 15.6; y += .5) beam([-52, y, -23], [-51, y, -23], .06);
    housing([-51.5, 1.8, -22.6], [1.5, 3.6, .2], P.dark);
  }
  for (const p of INTENT_LAMP_POINTS) {
    const [x, y, z] = p; housing([x, y / 2, z], [.4, y, .4], P.dark);
    light([x, y - .45, z], [.22, .7, .22]);
    housing([x, .2, z], [1.1, .4, 1.1], P.concrete);
  }
}

export function createCoasterCar() {
  const b = new CoasterBatch();
  b.box([0, .27, 0], [2.9, .35, 1.85], P.copper);
  b.box([1.25, .65, 0], [.35, .55, 1.8], P.dark);
  b.box([0, .64, 0], [1.1, .16, 1.22], P.dark);
  b.box([-.53, 1.05, 0], [.18, .85, 1.25], P.dark);
  for (const side of [-.85, .85]) {
    b.box([-.1, .75, side], [2.6, .35, .15], P.steel);
    b.beam([.7, .5, side], [.7, 1.22, side], .065, P.rail);
    for (const x of [-1, 1]) b.beam([x, .08, side - .15], [x, .08, side + .15], .26, P.dark);
  }
  b.beam([.7, 1.22, -.85], [.7, 1.22, .85], .065, P.rail);
  b.box([1.46, .7, 0], [.03, .12, 1.2], P.cyan);
  return b.finish();
}

export function createIntentMicroBase(id: 'route' | 'press' | 'visitor', passed: readonly string[] = []) {
  const b = new CoasterBatch(coasterWorld(INTENT_STATIONS.find(s => s.id === id)!.origin));
  if (id === 'route') {
    for (const z of [-.5, .2, .85]) b.beam([-2.6, 1.4, z], [2.6, 1.4, z], .035, P.rail);
    for (const x of [-1.9, 0, 1.9]) b.box([x, 1.52, .85], [.65, .18, .65], P.concrete);
    b.beam([-1.9, 1.55, .85], [-1.9, 2.35, .85], .12, P.white);
    b.box([0, 1.78, .85], [.7, .6, .65], P.copper);
    b.beam([1.6, 1.5, .85], [1.6, 2.1, .85], .06, P.steel);
    b.beam([2.2, 1.5, .85], [2.2, 2.1, .85], .06, P.steel);
    b.beam([1.6, 2.1, .85], [2.2, 2.1, .85], .06, P.steel);
    for (let i = 0; i < 4; i++) b.box([-1.8 + i * 1.2, 1.43, -1], [.65, .15, .4], P.dark);
    for (let i = 0; i < 3; i++) {
      b.box([-.7 + i * .7, 1.55, -1], [.35, .1, .32], passed.includes('T1') ? P.cyan : P.steel);
      if (passed.includes('T2')) b.beam([-1.9 + i * 1.9, 1.58, .5], [-1.9 + i * 1.9, 1.58, .78], .07, P.cyan);
    }
    if (passed.includes('T6')) b.box([-.7, 1.65, -1], [.5, .1, .12], P.gold);
    if (passed.includes('T5')) b.beam([-.4, 1.43, -.5], [.4, 1.43, .2], .065, P.cyan);
  } else if (id === 'press') {
    for (const x of [-1.55, 1.55]) {
      b.box([x, 1.5, 0], [1.5, .3, 1.9], P.concrete);
      for (const side of [-.65, .65]) b.box([x + side, 2, -.25], [.15, 1, .3], P.copper);
      b.box([x, 2.4, -.25], [1.6, .18, .35], P.dark);
    }
    b.beam([-2.2, 2, -.25], [-.9, 2, -.25], .32, P.steel);
    b.box([1.55, 1.9, -.25], [1.2, .18, .9], P.steel);
  } else {
    b.box([-.8, 1.8, -.2], [.65, 1.1, .45], P.copper);
    b.add(new CylinderGeometry(.3, .35, .55, 5), P.white, new Matrix4().makeTranslation(-.8, 2.6, -.2));
    b.beam([-.95, 1.5, -.2], [-1.1, 1.28, .3], .11, P.dark);
    b.beam([-.6, 1.5, -.2], [-.35, 1.28, .3], .11, P.dark);
    b.box([1, 1.45, .25], [1.3, .18, 1.3], P.copper);
    b.beam([1.6, 1.5, .25], [1.6, 2.45, .25], .07, P.steel);
    b.beam([1.6, 2.45, .25], [1, 2.45, .25], .07, P.steel);
    b.box([-.1, 1.47, .8], [.8, .05, .5], P.white);
    for (let i = 0; i < 3; i++) b.box([-.1, 1.5, .63 + i * .15], [.6, .015, .04], passed.includes('T7') ? P.cyan : P.dark);
  }
  if (id !== 'visitor') {
    b.beam([-2.9, 1.4, 1.4], [-2.9, 1.7, 1.4], .19, P.copper);
    b.box([-2.9, 1.72, 1.4], [.5, .06, .18], P.white);
  }
  return b.finish();
}
