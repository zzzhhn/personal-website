import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coasterDistanceAt, coasterFrame, coasterSupports, coasterWorld, COASTER_LENGTH } from './coaster-track.ts';
import { INTENT_STATIONS } from './intent-stations.ts';
import type { Vec3 } from '../types';

export const COASTER_PALETTE = { steel: '#596b76', dark: '#253641', rail: '#bec8ca', concrete: '#7d817e', copper: '#bd8a60', cyan: '#80d5ce', gold: '#e9bd68', white: '#e5e8df' };
const P = COASTER_PALETTE;
export class CoasterBatch {
  parts: BufferGeometry[] = [];
  add(geometry: BufferGeometry, color: string, matrix?: Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    const c = new Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(colors, 3)); this.parts.push(g);
  }
  box(position: Vec3, size: Vec3, color: string, rotation?: Quaternion) {
    this.add(new BoxGeometry(...size), color, new Matrix4().compose(new Vector3(...position), rotation ?? new Quaternion(), new Vector3(1, 1, 1)));
  }
  beam(a: Vec3, b: Vec3, radius: number, color: string, sides = 6) {
    const start = new Vector3(...a), end = new Vector3(...b), d = end.clone().sub(start);
    if (d.lengthSq() < .00001) return;
    this.add(new CylinderGeometry(radius, radius, d.length(), sides, 1), color,
      new Matrix4().compose(start.add(end).multiplyScalar(.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()), new Vector3(1, 1, 1)));
  }
  finish() {
    const g = mergeGeometries(this.parts, false) ?? new BufferGeometry();
    this.parts.forEach(p => p.dispose()); this.parts.length = 0;
    g.computeBoundingSphere(); return g;
  }
}
const tuple = (v: Vector3) => v.toArray() as Vec3;
export function createCoasterStructure(detailed: boolean) {
  const steel = new CoasterBatch(), glow = new CoasterBatch();
  const box = (p: Vec3, size: Vec3, c: string) => steel.box(coasterWorld(p), size, c);
  const beam = (a: Vec3, b: Vec3, r: number, c = P.steel) => steel.beam(coasterWorld(a), coasterWorld(b), r, c);
  const steps = detailed ? 480 : 200;
  for (let i = 0; i < steps; i++) {
    const a = coasterFrame(i / steps), b = coasterFrame((i + 1) / steps);
    for (const offset of [-.78, .78]) steel.beam(tuple(a.point.clone().addScaledVector(a.side, offset)), tuple(b.point.clone().addScaledVector(b.side, offset)), .11, P.rail);
    if (i % 3 === 0) steel.beam(tuple(a.point.clone().addScaledVector(a.side, -1)), tuple(a.point.clone().addScaledVector(a.side, 1)), .09, P.copper);
    if (i % 7 === 0) glow.beam(tuple(a.point.clone().addScaledVector(a.side, -.94)), tuple(b.point.clone().addScaledVector(b.side, -.94)), .045, P.cyan, 4);
  }
  for (const { a, b, top } of coasterSupports(detailed)) {
    for (const p of [a, b]) {
      steel.beam([p.x, 1.12, p.z], tuple(p), .25, P.steel);
      steel.box([p.x, 1.2, p.z], [1.35, .3, 1.35], P.concrete);
    }
    steel.beam(tuple(a), tuple(b), .23, P.dark);
    if (top.y > 6) {
      steel.beam([a.x, 1.3, a.z], tuple(b), .12, P.steel);
      steel.beam([b.x, 1.3, b.z], tuple(a), .12, P.steel);
    }
  }
  // Solid forecourt and flat station apron; main island terrain supplies the rest of the ground.
  box([0, .04, 38], [70, .08, 12], P.concrete);
  box([-3, .04, 23], [11, .08, 17], P.concrete);
  box([0, .05, 32], [9, .06, 12], P.dark);
  for (const x of [-9.6, 2.4]) for (const z of [16, 29]) beam([x, .1, z], [x, 5.5, z], .22);
  box([-3.6, 5.5, 22.5], [14, .25, 16], P.dark);
  beam([-10, 5.5, 15], [3, 5.5, 30], .14, P.copper);
  for (const x of [-34, 34]) {
    box([x, 1.25, -5], [.3, 2.5, 74], P.dark);
    for (let z = -42; z <= 32; z += 6) box([x, 1.8, z], [.45, 3.6, .45], P.steel);
  }
  box([0, 1.25, -42], [68, 2.5, .3], P.dark);
  for (const x of [-19.5, 19.5]) box([x, 1.25, 32], [29, 2.5, .3], P.dark);
  for (const x of [-5.2, 5.2]) box([x, 3.3, 32], [.8, 6.6, .8], P.steel);
  box([0, 6.4, 32], [11.4, 1.2, 1], P.dark);
  for (const x of [-5.65, 5.65]) glow.box(coasterWorld([x, 3.5, 32.52]), [.1, 5.3, .08], P.cyan);
  // Crest screen conceals the drop from the climbing train without hiding the island behind it.
  box([-2, 30, -35], [6, 2.8, .25], P.dark);
  for (const x of [-5, 1]) beam([x, .1, -35], [x, 31.4, -35], .32);
  if (detailed) {
    addTunnel(steel, glow);
    for (const station of INTENT_STATIONS) {
      const [x, , z] = station.origin;
      box([x, .6, z], [7, 1.2, 3.4], P.dark);
      box([x, 1.25, z], [7.3, .15, 3.7], P.steel);
      for (const side of [-3.3, 3.3]) beam([x + side, 0, z - 1.4], [x + side, 3.1, z - 1.4], .1);
      box([x, 3, z - 1.4], [7.2, .9, .14], P.dark);
    }
  }
  return { steel: steel.finish(), glow: glow.finish() };
}

function addTunnel(steel: CoasterBatch, glow: CoasterBatch) {
  const start = coasterDistanceAt(68), end = coasterDistanceAt(79), count = 12;
  const bayLength = (end - start) * COASTER_LENGTH / count;
  for (let i = 0; i <= count; i++) {
    const f = coasterFrame(start + (end - start) * i / count);
    const p = (side: number, up: number) => tuple(f.point.clone().addScaledVector(f.side, side).addScaledVector(f.up, up));
    for (const side of [-2.5, 2.5]) {
      steel.beam(p(side, -.4), p(side, 3.8), .14, P.steel);
      glow.beam(p(side * .92, .2), p(side * .92, 3.5), .045, i % 3 ? P.cyan : P.gold, 4);
      if (i < count) steel.box(p(side, 1.25), [bayLength, 2.6, .14], P.dark, f.rotation);
    }
    steel.beam(p(-2.5, 3.8), p(2.5, 3.8), .16, P.steel);
    glow.beam(p(-2.3, 3.5), p(2.3, 3.5), .045, i % 3 ? P.cyan : P.gold, 4);
    if (i < count) steel.box(p(0, 3.85), [bayLength, .15, 5.1], P.dark, f.rotation);
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
  const b = new CoasterBatch();
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
