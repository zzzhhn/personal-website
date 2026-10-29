import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { thrillFrame } from './coaster-thrill-frame.ts';
import { THRILL_CREST, THRILL_ELEMENTS, THRILL_LENGTH } from './coaster-thrill-layout.ts';
import type { CoasterBatch } from './coaster-geometry.ts';
import type { ThrillSupport } from './coaster-thrill-supports.ts';

const giant = THRILL_ELEMENTS[0];
export const COASTER_STRUCTURE_SAMPLE = { start: THRILL_CREST - 12 / THRILL_LENGTH, end: giant.end + 12 / THRILL_LENGTH };
export const inCoasterStructureSample = (u: number) => u >= COASTER_STRUCTURE_SAMPLE.start && u <= COASTER_STRUCTURE_SAMPLE.end;
export type TrackContact = { vertices: Float32Array; indices: Uint32Array };
type Frame = ReturnType<typeof thrillFrame>;
type Ring = { u: number; frame: Frame };
type Profile = (ring: Ring) => number[][];
const at = (f: Frame, side: number, up: number) => f.point.clone().addScaledVector(f.side, side).addScaledVector(f.up, up);
export function coasterSpineProfile({ u, frame }: Ring) {
  const edge = Math.min(u - COASTER_STRUCTURE_SAMPLE.start, COASTER_STRUCTURE_SAMPLE.end - u) * THRILL_LENGTH / 12;
  const t = Math.max(0, Math.min(1, edge)), blend = t * t * (3 - 2 * t);
  const depth = Math.min(.42, Math.max(.15, frame.point.y - 1.45));
  const width = .212 + (.44 - .212) * blend;
  const top = -depth + .212 + (-.15 + depth - .212) * blend;
  const bottom = -depth - .212 + (-1.2 + depth + .212) * blend;
  return [[width, top], [-width, top], [-width, bottom], [width, bottom]];
}

/** Shared rings replace separately capped chords. Sample silhouette is identical in both LODs. */
export function coasterRailRings(detailed: boolean, start: number, end: number) {
  const sample = inCoasterStructureSample((start + end) / 2), step = detailed || sample ? 1.05 : 4;
  const tolerance = detailed || sample ? .01 : .02, rings: Ring[] = [{ u: start, frame: thrillFrame(start) }];
  const probes = [[-.89, 0], [.89, 0], [-.44, -1.2], [.44, -1.2]];
  const split = (a: Ring, b: Ring, depth = 0) => {
    const m = { u: (a.u + b.u) / 2, frame: thrillFrame((a.u + b.u) / 2) };
    const error = Math.max(...[.25, .5, .75].flatMap(t => {
      const f = t === .5 ? m.frame : thrillFrame(a.u + (b.u - a.u) * t);
      return probes.map(([side, up]) => at(f, side, up)
        .distanceTo(at(a.frame, side, up).lerp(at(b.frame, side, up), t)));
    }));
    if (depth < 20 && ((b.u - a.u) * THRILL_LENGTH > step || error > tolerance)) {
      split(a, m, depth + 1); split(m, b, depth + 1);
    } else rings.push(b);
  };
  split(rings[0], { u: end, frame: thrillFrame(end) });
  return rings;
}

export function coasterRailSpans(detailed: boolean) {
  const boundaries = [0, COASTER_STRUCTURE_SAMPLE.start, COASTER_STRUCTURE_SAMPLE.end, 1];
  return boundaries.slice(0, -1).map((start, i) => coasterRailRings(detailed, start, boundaries[i + 1]));
}

export function sweepCoasterSection(rings: Ring[], profile: Profile) {
  const positions: number[] = [], indices: number[] = [], sides = profile(rings[0]).length;
  // Duplicate each section edge to retain a crisp box section but smooth longitudinal normals.
  for (const r of rings) {
    const p = profile(r);
    for (let j = 0; j < sides; j++) for (const k of [j, (j + 1) % sides]) positions.push(...at(r.frame, p[k][0], p[k][1]).toArray());
  }
  const stride = sides * 2;
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * stride + j * 2, b = a + 1, c = a + stride, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  for (const end of [0, rings.length - 1]) for (let j = 1; j < sides - 1; j++) {
    const a = end * stride, b = a + j * 2, c = a + (j + 1) * 2;
    indices.push(...(end ? [a, c, b] : [a, b, c]));
  }
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** The sample's visible faces are also its physical faces, in one bounded static trimesh. */
export function addCoasterRailSections(steel: CoasterBatch, detailed: boolean, spans = coasterRailSpans(detailed)) {
  const vertices: number[] = [], indices: number[] = [];
  const add = (g: BufferGeometry, colour: string, solid: boolean) => {
    if (solid) {
      const offset = vertices.length / 3;
      vertices.push(...g.attributes.position.array);
      if (g.index) for (const i of g.index.array) indices.push(i + offset);
      else for (let i = 0; i < g.attributes.position.count; i++) indices.push(i + offset);
    }
    steel.add(g, colour);
  };
  for (let section = 0; section < 3; section++) {
    const rings = spans[section], solid = section === 1;
    for (const side of [-.78, .78]) add(sweepCoasterSection(rings, () => Array.from({ length: 6 }, (_, j) =>
      [side + .11 * Math.cos(j * Math.PI / 3), .11 * Math.sin(j * Math.PI / 3)])), '#c2ccd1', solid);
    add(sweepCoasterSection(rings, coasterSpineProfile), '#273e4e', solid);
  }
  const count = Math.ceil((COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * THRILL_LENGTH / 2.1);
  for (let i = 1; i < count; i++) {
    const u = COASTER_STRUCTURE_SAMPLE.start + (COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * i / count;
    const frame = thrillFrame(u), profile = coasterSpineProfile({ u, frame });
    const box = (a: Vector3, b: Vector3, width: number, colour: string) => {
      const d = b.clone().sub(a), rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
      add(new BoxGeometry(width, d.length(), width).applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(.5), rotation, new Vector3(1, 1, 1))), colour, true);
    };
    add(new BoxGeometry(.24, .2, 1.9).applyMatrix4(new Matrix4().compose(at(frame, 0, -.21), frame.rotation, new Vector3(1, 1, 1))), '#aa9173', true);
    for (const side of [-1, 1]) box(at(frame, side * .78, -.21), at(frame, side * profile[0][0] * .8, profile[2][1] + .14), .18, '#526b79');
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) } satisfies TrackContact;
}

export function addCoasterSampleNodes(steel: CoasterBatch, supports: ThrillSupport[], contact: TrackContact) {
  const vertices = Array.from(contact.vertices), indices = Array.from(contact.indices);
  const add = (g: BufferGeometry, colour: string) => {
    const offset = vertices.length / 3;
    vertices.push(...g.attributes.position.array);
    for (const i of g.index!.array) indices.push(i + offset);
    steel.add(g, colour);
  };
  for (const support of supports) if (inCoasterStructureSample(support.u)) for (const [i, p] of [support.a, support.b].entries()) {
    add(new CylinderGeometry(.82, .82, .7, 8).translate(p.x, p.y - .35, p.z), '#98a7aa');
    add(new BoxGeometry(1.6, .15, 1.6).translate(p.x, support.beams[i].a.y + 1.05, p.z), '#273e4e');
  }
  contact.vertices = new Float32Array(vertices); contact.indices = new Uint32Array(indices);
}
