import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three';
import { coasterRailSpans, coasterSpineProfile, COASTER_STRUCTURE_SAMPLE, inCoasterStructureSample } from './coaster-rail-section.ts';
import { thrillFrame } from './coaster-thrill-frame.ts';
import { THRILL_LENGTH } from './coaster-thrill-layout.ts';
import { coasterSupportBase, thrillSupports, type ThrillBeam } from './coaster-thrill-supports.ts';

type Surface = 'runningSteel' | 'coatedSteel' | 'jointSteel' | 'concrete';
type Point2 = readonly [number, number];
type Ring = ReturnType<typeof coasterRailSpans>[number][number];
type Part = { name: string; family: string; u?: number; vertexStart: number; vertexCount: number; indexStart: number; indexCount: number;
  profileSides?: number; caps?: readonly [boolean, boolean] };
const surfaces: Surface[] = ['runningSteel', 'coatedSteel', 'jointSteel', 'concrete'];
const Y = new Vector3(0, 1, 0);
const ONE = new Vector3(1, 1, 1);

/** World-space PBR geometry. UV units are metres, with U following fabrication length. */
class Batch {
  p: number[] = []; n: number[] = []; uv: number[] = []; indices: number[] = []; parts: Part[] = [];
  vertex(p: Vector3, n: Vector3, u: number, v: number) {
    const index = this.p.length / 3;
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    return index;
  }
  part(name: string, family: string, u: number | undefined, run: () => void) {
    const vertexStart = this.p.length / 3, indexStart = this.indices.length;
    run();
    if (this.indices.length > indexStart) this.parts.push({ name, family, u, vertexStart, vertexCount: this.p.length / 3 - vertexStart, indexStart, indexCount: this.indices.length - indexStart });
  }
  finish(surface: Surface) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.indices);
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.name = `CoasterRailCraft_${surface}`;
    g.userData = { surface, uvMetresPerTile: 1, parts: this.parts };
    return g;
  }
}

/** Corner cuts remain entirely inside the source cross-section. */
function insetCorners(profile: Point2[], distance: number) {
  return profile.flatMap((p, i) => {
    const prev = profile[(i + profile.length - 1) % profile.length], next = profile[(i + 1) % profile.length];
    const towards = (q: Point2): Point2 => {
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]), t = Math.min(.22, distance / length);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    return [towards(prev), towards(next)];
  });
}

function simplifySpans(spans: Ring[][], detailed: boolean) {
  const tolerance = detailed ? .005 : .015, maxRollError = detailed ? .006 : .012;
  const probes = (r: Ring) => {
    const profile = [...coasterSpineProfile(r), ...[-.78, .78].flatMap(side => Array.from({ length: 6 }, (_, j) => [side + .11 * Math.cos(j * Math.PI / 3), .11 * Math.sin(j * Math.PI / 3)]))];
    return profile.map(([side, up]) => r.frame.point.clone().addScaledVector(r.frame.side, side).addScaledVector(r.frame.up, up));
  };
  let maximumError = 0, maximumRollError = 0, maxChord = 0;
  const output = spans.map(source => {
    const points = source.map(probes), keep = new Set([0, source.length - 1]);
    const split = (a: number, b: number) => {
      if (b <= a + 1) return;
      let worst = -1, worstScore = 0;
      for (let i = a + 1; i < b; i++) {
        const t = (source[i].u - source[a].u) / (source[b].u - source[a].u);
        let error = 0;
        for (let j = 0; j < points[i].length; j++) error = Math.max(error, points[i][j].distanceTo(points[a][j].clone().lerp(points[b][j], t)));
        const roll = source[a].frame.rotation.clone().slerp(source[b].frame.rotation, t).angleTo(source[i].frame.rotation);
        const score = Math.max(error / tolerance, roll / maxRollError);
        if (score > worstScore) { worstScore = score; worst = i; }
      }
      if (worstScore > 1 || (source[b].u - source[a].u) * THRILL_LENGTH > 4) {
        if (worstScore <= 1) worst = Math.floor((a + b) / 2);
        keep.add(worst); split(a, worst); split(worst, b);
      }
    };
    split(0, source.length - 1);
    const ids = [...keep].sort((a, b) => a - b);
    for (let k = 1; k < ids.length; k++) {
      const a = ids[k - 1], b = ids[k]; maxChord = Math.max(maxChord, (source[b].u - source[a].u) * THRILL_LENGTH);
      for (let i = a; i <= b; i++) {
        const t = (source[i].u - source[a].u) / (source[b].u - source[a].u);
        for (let j = 0; j < points[i].length; j++) maximumError = Math.max(maximumError, points[i][j].distanceTo(points[a][j].clone().lerp(points[b][j], t)));
        maximumRollError = Math.max(maximumRollError, source[a].frame.rotation.clone().slerp(source[b].frame.rotation, t).angleTo(source[i].frame.rotation));
      }
    }
    return ids.map(i => source[i]);
  });
  return { spans: output, report: { sourceRings: spans.reduce((sum, s) => sum + s.length, 0) - 2,
    retainedRings: output.reduce((sum, s) => sum + s.length, 0) - 2, maximumErrorMetres: maximumError,
    maximumRollErrorRadians: maximumRollError, maximumChordMetres: maxChord, toleranceMetres: tolerance } };
}

/** One closed, shared-ring sweep, including the three source span boundaries.
 * Faces retain section creases; centred longitudinal derivatives cross every span seam. */
function sweep(batches: Record<Surface, Batch>, rings: Ring[], profile: (r: Ring) => Point2[], material: (edge: number) => Surface, name: string, smoothSection = false,
  omitFace?: (edge: number, segment: number) => boolean, closed = true) {
  const profiles = rings.map(profile), sides = profiles[0].length, last = rings.length - 1;
  const at = (i: number, j: number) => rings[i].frame.point.clone()
    .addScaledVector(rings[i].frame.side, profiles[i][j][0]).addScaledVector(rings[i].frame.up, profiles[i][j][1]);
  const keys = [...new Set(Array.from({ length: sides }, (_, j) => material(j)))];
  if (smoothSection) {
    const batch = batches[keys[0]];
    batch.part(name, 'continuous-sweep', undefined, () => {
      const first = batch.p.length / 3, stride = sides + 1;
      for (let i = 0; i <= last; i++) {
        const before = i === 0 || i === last ? last - 1 : i - 1, after = i === 0 || i === last ? 1 : i + 1;
        let perimeter = 0;
        for (let j = 0; j <= sides; j++) {
          const k = j % sides, a = at(i, k), previous = at(i, (k + sides - 1) % sides), next = at(i, (k + 1) % sides);
          const tangent = at(after, k).sub(at(before, k));
          const normal = tangent.clone().cross(a.clone().sub(previous)).normalize().add(tangent.cross(next.clone().sub(a)).normalize()).normalize();
          batch.vertex(a, normal, rings[i].u * THRILL_LENGTH, perimeter);
          if (j < sides) perimeter += a.distanceTo(next);
        }
      }
      for (let i = 0; i < last; i++) for (let j = 0; j < sides; j++) {
        const a = first + i * stride + j, c = a + stride;
        batch.indices.push(a, c, a + 1, a + 1, c, c + 1);
      }
    });
    return;
  }
  for (const key of keys) batches[key].part(name, 'continuous-sweep', undefined, () => {
    const batch = batches[key];
    for (let edge = 0; edge < sides; edge++) {
      if (material(edge) !== key) continue;
      const first = batch.p.length / 3, next = (edge + 1) % sides;
      for (let i = 0; i <= last; i++) {
        const a = at(i, edge), b = at(i, next);
        const before = closed && (i === 0 || i === last) ? last - 1 : Math.max(0, i - 1);
        const after = closed && (i === 0 || i === last) ? 1 : Math.min(last, i + 1);
        const tangent = at(after, edge).add(at(after, next)).sub(at(before, edge)).sub(at(before, next));
        const normal = tangent.cross(b.clone().sub(a)).normalize();
        const v = profiles[i].slice(0, edge).reduce((sum, p, j) => sum + Math.hypot(p[0] - profiles[i][j + 1][0], p[1] - profiles[i][j + 1][1]), 0);
        batch.vertex(a, normal, rings[i].u * THRILL_LENGTH, v);
        batch.vertex(b, normal, rings[i].u * THRILL_LENGTH, v + a.distanceTo(b));
      }
      for (let i = 0; i < last; i++) {
        if (omitFace?.(edge, i)) continue;
        const a = first + i * 2;
        batch.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  });
}

/** Extruded closed polygon in local X/Z, long axis local Y. Supports are not
 * generated from a new route or screening pass: the exact old beam endpoints win. */
function prism(batch: Batch, profile: Point2[], length: number, matrix: Matrix4, name: string, family: string, u?: number, endProfile = profile, smoothSides = false,
  caps: readonly [boolean, boolean] = [true, true]) {
  const rotation = new Quaternion().setFromRotationMatrix(matrix), n = profile.length;
  const partIndex = batch.parts.length;
  batch.part(name, family, u, () => {
    let perimeter = 0;
    for (let j = 0; j < n; j++) {
      const a = profile[j], b = profile[(j + 1) % n], topA = endProfile[j], topB = endProfile[(j + 1) % n], start = batch.p.length / 3;
      const normal = new Vector3(topA[0] - a[0], length, topA[1] - a[1])
        .cross(new Vector3(b[0] - a[0], 0, b[1] - a[1])).normalize().applyQuaternion(rotation);
      const width = Math.hypot(a[0] - b[0], a[1] - b[1]);
      for (const [point, y, v, k] of [[a, -length / 2, 0, j], [topA, length / 2, 0, j], [b, -length / 2, width, (j + 1) % n], [topB, length / 2, width, (j + 1) % n]] as const) {
        const slope = (Math.hypot(...endProfile[k]) - Math.hypot(...profile[k])) / length;
        const vertexNormal = smoothSides ? new Vector3(point[0], -Math.hypot(...point) * slope, point[1]).normalize().applyQuaternion(rotation) : normal;
        batch.vertex(new Vector3(point[0], y, point[1]).applyMatrix4(matrix), vertexNormal, y + length / 2, v + (smoothSides ? perimeter : 0));
      }
      perimeter += width;
      batch.indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
    const capTriangles = ShapeUtils.triangulateShape(profile.map(p => new Vector2(...p)), []);
    for (const sign of [-1, 1]) {
      if (!caps[sign < 0 ? 0 : 1]) continue;
      const start = batch.p.length / 3, normal = new Vector3(0, sign, 0).applyQuaternion(rotation);
      for (const p of sign > 0 ? endProfile : profile) batch.vertex(new Vector3(p[0], sign * length / 2, p[1]).applyMatrix4(matrix), normal, p[0], p[1]);
      for (const [a, b, c] of capTriangles) batch.indices.push(...(sign > 0 ? [start + a, start + c, start + b] : [start + a, start + b, start + c]));
    }
  });
  const part = batch.parts[partIndex]; if (part) { part.profileSides = n; part.caps = caps; }
}

function box(batch: Batch, size: readonly [number, number, number], position: Vector3, rotation: Quaternion, name: string, family: string, u?: number, bevel = .012) {
  const [x, y, z] = size;
  const original: Point2[] = [[-x / 2, -z / 2], [x / 2, -z / 2], [x / 2, z / 2], [-x / 2, z / 2]];
  const profile = bevel > 0 ? insetCorners(original, Math.min(bevel, x * .2, z * .2)) : original;
  prism(batch, profile, y, new Matrix4().compose(position, rotation, ONE), name, family, u);
}

function beam(batch: Batch, source: ThrillBeam, name: string, u: number, detailed: boolean, caps: readonly [boolean, boolean] = [true, true]) {
  const delta = source.b.clone().sub(source.a), rotation = new Quaternion().setFromUnitVectors(Y, delta.clone().normalize());
  const r = source.radius, radius = r * .985, count = detailed ? 12 : 8;
  const profile: Point2[] = Array.from({ length: count }, (_, i) => [Math.cos(i * Math.PI * 2 / count) * radius, Math.sin(i * Math.PI * 2 / count) * radius]);
  prism(batch, profile, delta.length(), new Matrix4().compose(source.a.clone().add(source.b).multiplyScalar(.5), rotation, ONE), name, 'support-member', u, profile, true, caps);
}

function sleeve(batch: Batch, source: ThrillBeam, centre: number, name: string, u: number) {
  const d = source.b.clone().sub(source.a), axis = d.clone().normalize(), q = new Quaternion().setFromUnitVectors(Y, axis);
  const circle = (r: number): Point2[] => Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6) * r, Math.sin(i * Math.PI / 6) * r]);
  // All shoulders remain inside the old radius. Broad material bands explain
  // pipe-end sleeves; no per-column decorative screw scatter is introduced.
  for (const [i, segment] of [[-.12, -.085, .984, .998], [-.085, .085, .998, .998], [.085, .12, .998, .984]].entries()) {
    const [a, b, r0, r1] = segment;
    const p = source.a.clone().addScaledVector(axis, centre + (a + b) / 2);
    // The end shoulders bury into the retained pipe; all cross-section caps are
    // internal to the assembly, including the two sleeve-to-sleeve boundaries.
    prism(batch, circle(source.radius * r0), b - a, new Matrix4().compose(p, q, ONE), `${name}_${i}`, 'pipe-sleeve', u, circle(source.radius * r1), true, [false, false]);
  }
}

function quad(batch: Batch, points: Vector3[], outward: Vector3) {
  const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
  const flip = normal.dot(outward) < 0; if (flip) normal.negate();
  const start = batch.p.length / 3, width = points[0].distanceTo(points[1]), height = points[1].distanceTo(points[2]);
  for (const [i, p] of points.entries()) batch.vertex(p, normal, i === 1 || i === 2 ? width : 0, i >= 2 ? height : 0);
  batch.indices.push(...(flip ? [start, start + 2, start + 1, start, start + 3, start + 2] : [start, start + 1, start + 2, start, start + 2, start + 3]));
}

export function createCoasterRailVisualCraft(detailed: boolean): Record<string, BufferGeometry> {
  const batches = Object.fromEntries(surfaces.map(key => [key, new Batch()])) as Record<Surface, Batch>;
  const simplified = simplifySpans(coasterRailSpans(detailed), detailed), spans = simplified.spans;
  const rings = spans.flatMap((span, i) => i ? span.slice(1) : span);
  for (const side of [-.78, .78]) sweep(batches, rings,
    () => {
      const original = Array.from({ length: 6 }, (_, j): Point2 => [side + .11 * Math.cos(j * Math.PI / 3), .11 * Math.sin(j * Math.PI / 3)]);
      // Only the two gauge-facing lateral corners need a geometric round-over.
      // Preserve the broad upper/lower six-sided running/contact planes.
      if (!detailed) return original;
      return original.flatMap((p, i) => i % 3 === 0 ? insetCorners(original, .006).slice(i * 2, i * 2 + 2) : [p]);
    },
    () => 'runningSteel', side < 0 ? 'RunningRail_Left' : 'RunningRail_Right', true);
  const spliceCentres = detailed ? [.008, .265 - 7 / THRILL_LENGTH, .265 + 7 / THRILL_LENGTH, .992] : [];
  const spliceRings = new Map(rings.map(r => [r.u, r]));
  for (const u of spliceCentres) for (const metres of [-.65, -.4, .4, .65]) {
    const at = u + metres / THRILL_LENGTH; spliceRings.set(at, { u: at, frame: thrillFrame(at) });
  }
  const spineRings = [...spliceRings.values()].sort((a, b) => a.u - b.u);
  const spineProfile = (r: Ring) => insetCorners(coasterSpineProfile(r) as Point2[], .018);
  const inRecess = (u: number) => spliceCentres.some(centre => Math.abs(u - centre) * THRILL_LENGTH < .65);
  sweep(batches, spineRings, spineProfile,
    edge => edge === 4 || edge === 6 ? 'jointSteel' : 'coatedSteel', 'Spine_FoldedBox', false,
    (edge, i) => (edge === 3 || edge === 7) && inRecess((spineRings[i].u + spineRings[i + 1].u) / 2));
  for (const [index, centre] of spliceCentres.entries()) {
    const region = spineRings.filter(r => Math.abs(r.u - centre) * THRILL_LENGTH < .650001);
    const plateRings = region.filter(r => Math.abs(r.u - centre) * THRILL_LENGTH < .400001);
    for (const sign of [-1, 1]) {
      const point = (r: Ring, lower: boolean, inset: number) => {
        const p = spineProfile(r)[sign < 0 ? lower ? 4 : 3 : lower ? 7 : 0];
        return r.frame.point.clone().addScaledVector(r.frame.side, p[0] - sign * inset).addScaledVector(r.frame.up, p[1]);
      };
      batches.coatedSteel.part(`SpineSplice${index}_Recess${sign}`, 'spine-splice', centre, () => {
        for (let i = 1; i < region.length; i++) {
          const a = region[i - 1], b = region[i], side = a.frame.side.clone().multiplyScalar(sign);
          quad(batches.coatedSteel, [point(a, false, .008), point(a, true, .008), point(b, true, .008), point(b, false, .008)], side);
          quad(batches.coatedSteel, [point(a, false, 0), point(a, false, .008), point(b, false, .008), point(b, false, 0)], a.frame.up.clone().negate());
          quad(batches.coatedSteel, [point(a, true, 0), point(a, true, .008), point(b, true, .008), point(b, true, 0)], a.frame.up);
        }
        for (const [r, direction] of [[region[0], -1], [region[region.length - 1], 1]] as const)
          quad(batches.coatedSteel, [point(r, false, 0), point(r, true, 0), point(r, true, .008), point(r, false, .008)], r.frame.forward.clone().multiplyScalar(direction));
      });
      const plateProfile = (r: Ring): Point2[] => {
        const profile = coasterSpineProfile(r), width = profile[0][0], lo = Math.min(sign * (width - .008), sign * (width - .001));
        const hi = Math.max(sign * (width - .008), sign * (width - .001)), margin = Math.min(.10, (profile[0][1] - profile[2][1]) * .22);
        return [[lo, profile[2][1] + margin], [hi, profile[2][1] + margin], [hi, profile[0][1] - margin], [lo, profile[0][1] - margin]];
      };
      sweep(batches, plateRings, plateProfile, () => 'jointSteel', `SpineSplice${index}_Cover${sign}`, false, undefined, false);
      batches.jointSteel.part(`SpineSplice${index}_CoverEnds${sign}`, 'spine-splice', centre, () => {
        for (const [r, direction] of [[plateRings[0], -1], [plateRings[plateRings.length - 1], 1]] as const) {
          const points = plateProfile(r).map(([side, up]) => r.frame.point.clone().addScaledVector(r.frame.side, side).addScaledVector(r.frame.up, up));
          quad(batches.jointSteel, points, r.frame.forward.clone().multiplyScalar(direction));
        }
      });
    }
  }

  const at = (f: ReturnType<typeof thrillFrame>, x: number, y: number, z: number) =>
    f.point.clone().addScaledVector(f.forward, x).addScaledVector(f.up, y).addScaledVector(f.side, z);
  const railSeat = (u: number, side: number) => {
    let low = 0, high = rings.length - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (rings[mid].u < u) low = mid; else high = mid; }
    const t = (u - rings[low].u) / (rings[high].u - rings[low].u);
    const point = (i: number) => rings[i].frame.point.clone().addScaledVector(rings[i].frame.side, side)
      .addScaledVector(rings[i].frame.up, -.11 * Math.sin(Math.PI / 3));
    return point(low).lerp(point(high), t);
  };
  const tie = (u: number, index: number) => {
    const f = thrillFrame(u), tight = u >= .75 && u <= .81, chord = tight ? .12 : .24;
    // Open I-section: the old X chord and Z gauge are deliberately not swapped.
    const half = chord / 2, web = Math.min(.065, chord * .42) / 2;
    // A single concave closed extrusion removes all former internal box faces.
    const section: Point2[] = [[-half, -.10], [half, -.10], [half, -.065], [web, -.065], [web, .065], [half, .065],
      [half, .10], [-half, .10], [-half, .065], [-web, .065], [-web, -.065], [-half, -.065]];
    const orientation = f.rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
    prism(batches.coatedSteel, section, 1.9, new Matrix4().compose(at(f, 0, -.21, 0), orientation, ONE), `Tie${index}_ISection`, 'tie', u);
    for (const side of [-.78, .78]) {
      const p = railSeat(u, side).addScaledVector(f.up, -.0175);
      box(batches.jointSteel, [chord, .035, .25], p, f.rotation,
        `Tie${index}_${side < 0 ? 'LeftSeat' : 'RightSeat'}`, 'tie', u, 0);
    }
    // Existing sample diagonals are part of this visual family too.
    if (inCoasterStructureSample(u)) {
      const p = coasterSpineProfile({ u, frame: f });
      for (const sign of [-1, 1]) {
        const a = at(f, 0, -.21, sign * .78), b = at(f, 0, p[2][1] + .14, sign * p[0][0] * .8), d = b.clone().sub(a);
        box(batches.coatedSteel, [.18, d.length(), .18], a.clone().add(b).multiplyScalar(.5), new Quaternion().setFromUnitVectors(Y, d.normalize()), `Tie${index}_SpineBrace${sign}`, 'tie-brace', u, .01);
      }
    }
  };
  const count = Math.ceil((COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * THRILL_LENGTH / 2.1);
  for (let i = 1; i < count; i++) tie(COASTER_STRUCTURE_SAMPLE.start + (COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * i / count, i);
  const steps = Math.ceil(THRILL_LENGTH / (detailed ? 1.05 : 3));
  for (let i = 0; i < steps; i += 3) if (!inCoasterStructureSample(i / steps)) tie(i / steps, count + i);

  const identity = new Quaternion();
  const supports = thrillSupports(detailed);
  const localNodeSupports = new Set(detailed ? supports.filter(s => Math.abs(s.u - .265) * THRILL_LENGTH < 20 || s.u < .025 || s.u > .975)
    .sort((a, b) => Math.min(a.u, 1 - a.u, Math.abs(a.u - .265)) - Math.min(b.u, 1 - b.u, Math.abs(b.u - .265))).slice(0, 6) : []);
  for (const [supportIndex, support] of supports.entries()) {
    const { u } = support;
    // Column tops are fully enclosed by the wider bearing collar. Keeping their
    // old cap would put two upward faces at precisely the same world plane.
    for (const [j, source] of support.beams.entries()) beam(batches.coatedSteel, source, `Bent${supportIndex}_Member${j}`, u, detailed, j < 2 ? [true, false] : [true, true]);
    if (localNodeSupports.has(support)) for (const [j, source] of support.beams.slice(0, 3).entries())
      sleeve(batches.jointSteel, source, j < 2 ? 1.3 : source.a.distanceTo(source.b) * .25, `Bent${supportIndex}_WeldSleeve${j}`, u);
    for (const [j, top] of [support.a, support.b].entries()) {
      const source = support.beams[j], foot = source.a, sample = inCoasterStructureSample(u);
      const plate = sample ? 1.6 : Math.max(1.05, source.radius * 2.55);
      const base = coasterSupportBase(top.x, top.z);
      // The old 2.5 x 1 x 2.5 footing remains the exact maximum envelope.
      box(batches.concrete, [2.5, .86, 2.5], new Vector3(top.x, base + .43, top.z), identity, `Bent${supportIndex}_Footing${j}`, 'footing', u, .11);
      box(batches.concrete, [2.36, .14, 2.36], new Vector3(top.x, base + .93, top.z), identity, `Bent${supportIndex}_FootingCap${j}`, 'footing', u, .065);
      box(batches.concrete, [plate, .052, plate], new Vector3(foot.x, foot.y + 1.001, foot.z), identity, `Bent${supportIndex}_Grout${j}`, 'base-node', u, .025);
      box(batches.jointSteel, [plate - .06, .098, plate - .06], new Vector3(foot.x, foot.y + 1.076, foot.z), identity, `Bent${supportIndex}_BasePlate${j}`, 'base-node', u, .025);
      // Forged tapered column head inside the existing sample collar envelope.
      const width = sample ? .82 : source.radius + .14, height = sample ? .7 : .58;
      const collar = { a: new Vector3(top.x, top.y - .16, top.z), b: new Vector3(top.x, top.y, top.z), radius: width - .012 };
      beam(batches.jointSteel, collar, `Bent${supportIndex}_HeadCollar${j}`, u, detailed);
      const sides = detailed ? 12 : 8;
      const circle = (radius: number): Point2[] => Array.from({ length: sides }, (_, k) => [Math.cos(k * Math.PI * 2 / sides) * radius, Math.sin(k * Math.PI * 2 / sides) * radius]);
      // Forged shoulder flares out from the retained tube to the bearing collar.
      prism(batches.coatedSteel, circle(source.radius + .015), height - .16,
        new Matrix4().makeTranslation(top.x, top.y - (height + .16) / 2, top.z), `Bent${supportIndex}_HeadShoulder${j}`, 'head-node', u, circle(width - .025), true, [true, false]);
      if (detailed && (Math.abs(u - .265) * THRILL_LENGTH < 20 || u < .025 || u > .975)) for (const x of [-1, 1]) for (const z of [-1, 1]) {
        const offset = plate * .34, p = new Vector3(foot.x + x * offset, foot.y + 1.137, foot.z + z * offset);
        const hex: Point2[] = Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3) * .057, Math.sin(k * Math.PI / 3) * .057]);
        prism(batches.jointSteel, hex, .024, new Matrix4().makeTranslation(p.x, p.y, p.z), `Bent${supportIndex}_Anchor${j}_${x}_${z}`, 'base-anchor', u);
      }
    }
    // Rail-to-crossbeam saddle plates retain the old paired node positions.
    const axis = support.b.clone().sub(support.a).normalize(), across = new Vector3(-axis.z, 0, axis.x);
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis);
    for (const sign of [-1, 1]) {
      const p = support.top.clone().addScaledVector(across, sign * (support.beams[2].radius - .06)); p.y -= .19;
      box(batches.jointSteel, [.12, .4, 1.46], p, rotation, `Bent${supportIndex}_RailSaddle${sign}`, 'rail-node', u, .014);
    }
  }
  return Object.fromEntries(surfaces.map(key => {
    const g = batches[key].finish(key); g.userData.sweepSimplification = simplified.report; g.userData.sweepRingCount = rings.length;
    g.userData.localSpineRecess = { bands: spliceCentres.length, sideInsetMetres: .008, coverOuterInsetMetres: .001, topBottomUnchanged: true };
    return [key, g];
  }));
}
