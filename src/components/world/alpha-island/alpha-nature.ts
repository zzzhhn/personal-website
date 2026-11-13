import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Metres, Y up, ground at Y=0. Each call owns its returned geometries.
 * Shared runtime materials and scatter/physics belong to the scene, not this family.
 * Closed needle volumes work with ordinary FrontSide materials (no alpha cards).
 */
type Point = Vector3;
const TAU = Math.PI * 2;
const point = (x: number, y: number, z: number) => new Vector3(x, y, z);

function random(seed: number) {
  let state = (Math.trunc(seed * 1009) ^ 0x6d2b79f5) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cubic Bezier: explicit supported paths keep branch attachments deterministic. */
function curve(a: Point, b: Point, c: Point, d: Point, t: number) {
  const s = 1 - t;
  return a.clone().multiplyScalar(s * s * s)
    .addScaledVector(b, 3 * s * s * t)
    .addScaledVector(c, 3 * s * t * t)
    .addScaledVector(d, t * t * t);
}

function frame(tangent: Point) {
  const side = new Vector3().crossVectors(
    tangent, Math.abs(tangent.y) > .92 ? point(1, 0, 0) : point(0, 1, 0),
  ).normalize();
  return { side, up: new Vector3().crossVectors(tangent, side).normalize() };
}

/** Smooth closed tube, with circumference/length UVs and separate cap vertices. */
function tube(path: Point[], radii: number[], sides: number): BufferGeometry {
  const positions: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
  const tangents: Point[] = [];
  let previousSide: Point | undefined;
  let length = 0;
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    length += path[i].distanceTo(path[i - 1]);
    distances.push(length);
  }
  for (let i = 0; i < path.length; i++) {
    const before = Math.max(0, i - 1), after = Math.min(path.length - 1, i + 1);
    const tangent = path[after].clone().sub(path[before]).normalize();
    tangents.push(tangent);
    // Transport the previous ring frame: choosing a fresh world axis per ring
    // can twist an almost vertical crown twig and fold one of its tiny faces.
    const side = previousSide
      ? previousSide.clone().addScaledVector(tangent, -previousSide.dot(tangent)).normalize()
      : frame(tangent).side;
    const up = new Vector3().crossVectors(tangent, side).normalize();
    previousSide = side;
    const slope = (radii[after] - radii[before]) / path[after].distanceTo(path[before]);
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU;
      const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
      const p = path[i].clone().addScaledVector(radial, radii[i]);
      const n = radial.clone().addScaledVector(tangent, -slope).normalize();
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z);
      uv.push(j / sides, distances[i] / Math.max(length, .001));
      if (i < path.length - 1 && j < sides) {
        const a = i * (sides + 1) + j, b = a + 1, c = a + sides + 1;
        indices.push(a, b, c, b, c + 1, c);
      }
    }
  }
  for (const end of [0, path.length - 1]) {
    const normal = tangents[end].clone().multiplyScalar(end === 0 ? -1 : 1);
    const center = positions.length / 3;
    positions.push(...path[end].toArray()); normals.push(...normal.toArray()); uv.push(.5, .5);
    for (let j = 0; j <= sides; j++) {
      const source = (end * (sides + 1) + j) * 3;
      positions.push(positions[source], positions[source + 1], positions[source + 2]);
      normals.push(...normal.toArray());
      uv.push(.5 + Math.cos(j / sides * TAU) * .5, .5 + Math.sin(j / sides * TAU) * .5);
      if (j < sides) {
        const a = center + 1 + j, b = a + 1;
        indices.push(...(end === 0 ? [center, b, a] : [center, a, b]));
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Lenticular, gently arched needle: solid thickness, eight faces, rounded shading.
 * Width is half-width; a narrow side profile avoids the flat paper-fan failure.
 */
function needle(root: Point, tip: Point, width: number, arch: Point): BufferGeometry {
  const forward = tip.clone().sub(root).normalize();
  const { side, up } = frame(forward);
  const center = root.clone().lerp(tip, .46).add(arch);
  const positions = [...root.toArray()];
  for (let i = 0; i < 4; i++) {
    const angle = i * TAU / 4;
    positions.push(...center.clone().addScaledVector(side, Math.cos(angle) * width)
      .addScaledVector(up, Math.sin(angle) * width * .42).toArray());
  }
  positions.push(...tip.toArray());
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = 1 + i, b = 1 + (i + 1) % 4;
    indices.push(0, b, a, a, b, 5);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([.5, 0, 0, .46, .25, .46, .5, .46, .75, .46, .5, 1], 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Rounded shrub leaf: six curved longitudinal sections and a six-sided thin
 * lenticular cross-section. The oval shoulder continues almost to each rounded
 * end; no long straight arrowhead edges or four-vertex diamond outline.
 */
function roundedShrubLeaf(root: Point, tip: Point, width: number, arch: Point): BufferGeometry {
  const forward = tip.clone().sub(root), side = frame(forward.clone().normalize()).side;
  const sides = 6, sections = [.055, .18, .37, .59, .80, .945];
  const surface = (t: number, angle: number) => {
    const tangent = forward.clone().addScaledVector(arch, Math.cos(t * Math.PI) * Math.PI).normalize();
    const up = new Vector3().crossVectors(tangent, side).normalize();
    const center = root.clone().lerp(tip, t).addScaledVector(arch, Math.sin(t * Math.PI));
    const envelope = Math.pow(Math.sin(Math.PI * t), .56);
    return center.addScaledVector(side, Math.cos(angle) * width * envelope)
      .addScaledVector(up, Math.sin(angle) * width * .18 * envelope);
  };
  const positions = [...root.toArray()], normals = [...forward.clone().addScaledVector(arch, Math.PI).normalize().negate().toArray()];
  const uv = [.5, 0], indices: number[] = [];
  for (const t of sections) for (let corner = 0; corner <= sides; corner++) {
    const angle = corner / sides * TAU, p = surface(t, angle);
    const along = surface(t + .0001, angle).sub(surface(t - .0001, angle));
    const around = surface(t, angle + .0001).sub(surface(t, angle - .0001));
    const normal = around.cross(along).normalize();
    positions.push(...p.toArray()); normals.push(...normal.toArray()); uv.push(corner / sides, t);
  }
  const terminal = positions.length / 3;
  positions.push(...tip.toArray()); normals.push(...forward.clone().addScaledVector(arch, -Math.PI).normalize().toArray());
  uv.push(.5, 1);
  for (let corner = 0; corner < sides; corner++) {
    indices.push(0, corner + 2, corner + 1);
    for (let section = 0; section < sections.length - 1; section++) {
      const a = 1 + section * (sides + 1) + corner, b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const a = 1 + (sections.length - 1) * (sides + 1) + corner;
    indices.push(a, a + 1, terminal);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function merge(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Alpha nature geometry attributes must match');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Five attached needles around a fine curved rachis, rather than a solid cone.
 * At normal encounter distance these overlap as soft scalloped boughs; nearby the
 * short individual needles, twig direction and supporting branch remain visible.
 */
function spray(parts: BufferGeometry[], root: Point, direction: Point, length: number,
  width: number, phase: number, rnd: () => number, far = false, emit = true, leafBuilder: typeof needle = needle) {
  const forward = direction.clone().normalize(), lateral = point(-forward.z, 0, forward.x).normalize();
  const tip = root.clone().addScaledVector(forward, length).add(point(0, -.035 * length, 0));
  const mid = root.clone().lerp(tip, .48).add(point(0, length * .10, 0));
  if (emit) parts.push(far
    ? tube([root, tip], [width * .13, width * .025], 3)
    : tube([root, mid, tip], [width * .13, width * .09, width * .025], 3));
  for (let pair = 0; pair < 2; pair++) {
    const t = .22 + pair * .38;
    const anchor = curve(root, root.clone().lerp(mid, .7), mid, tip, t);
    for (const sign of [-1, 1]) {
      const needleLength = length * (.64 + rnd() * .13);
      const leafTip = anchor.clone().addScaledVector(forward, needleLength * .67)
        .addScaledVector(lateral, sign * needleLength * .62)
        .add(point(0, (.06 * Math.sin(phase + pair) - .13) * needleLength, 0));
      // Consume the same seed samples even when a far mesh omits this needle.
      const leafWidth = width * (.85 + rnd() * .25);
      if (emit && (!far || pair === 1)) parts.push(leafBuilder(anchor, leafTip,
        leafWidth * (far ? 1.65 : 1), point(0, needleLength * .11, 0)));
    }
  }
  const terminalRoot = root.clone().lerp(tip, .73);
  const terminalTip = tip.clone().addScaledVector(forward, length * .34).add(point(0, length * .04, 0));
  if (emit) parts.push(leafBuilder(terminalRoot, terminalTip, width * .83 * (far ? 1.4 : 1), point(0, length * .06, 0)));
}

/** A closed, flattened crown mass follows one real supporting bough. The broad
 * interior overlaps neighbouring boughs; scalloped shoulders taper into a drooping
 * tip. This supplies the visible evergreen mass at 10–30m, while the fine sprays
 * continue outside its edges. It is not a whole-tree cone or spherical canopy.
 */
function foliagePad(a: Point, b: Point, c: Point, d: Point, lateral: Point,
  halfWidth: number, thickness: number, phase: number, far: boolean): BufferGeometry {
  const segments = far ? 6 : 10, sides = far ? 4 : 8;
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], centers: Point[] = [];
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments, u = .045 + t * 1.005;
    const center = curve(a, b, c, d, u);
    // A raised soft inner shoulder and drooping tip follow the woody structure.
    center.y += Math.sin(t * Math.PI) * thickness * .18;
    centers.push(center);
    const tangent = curve(a, b, c, d, u + .01).sub(curve(a, b, c, d, u - .01)).normalize();
    const side = lateral.clone().addScaledVector(tangent, -lateral.dot(tangent)).normalize();
    const up = new Vector3().crossVectors(tangent, side).normalize();
    const envelope = .075 + .925 * Math.pow(Math.sin(Math.PI * Math.pow(t, .78)), .70);
    const scallop = .88 + .12 * Math.cos(t * Math.PI * 6 + phase);
    const width = halfWidth * envelope * scallop;
    const depth = thickness * (.19 + .81 * Math.pow(Math.sin(t * Math.PI), .65));
    for (let corner = 0; corner <= sides; corner++) {
      const angle = corner / sides * TAU;
      const asymmetric = 1 + .055 * Math.cos(angle * 3 + phase + t * 4);
      const p = center.clone().addScaledVector(side, Math.cos(angle) * width * asymmetric)
        .addScaledVector(up, Math.sin(angle) * depth);
      positions.push(...p.toArray()); uv.push(corner / sides, t);
      if (ring < segments && corner < sides) {
        const first = ring * (sides + 1) + corner, next = first + sides + 1;
        indices.push(first, first + 1, next, first + 1, next + 1, next);
      }
    }
  }
  for (const ring of [0, segments]) {
    const center = positions.length / 3;
    positions.push(...centers[ring].toArray()); uv.push(.5, ring === 0 ? 0 : 1);
    for (let corner = 0; corner < sides; corner++) {
      const first = ring * (sides + 1) + corner;
      indices.push(...(ring === 0 ? [center, first + 1, first] : [center, first, first + 1]));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let ring = 0; ring <= segments; ring++) {
    const first = ring * (sides + 1), last = first + sides;
    const normal = new Vector3().fromBufferAttribute(normals, first)
      .add(new Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return geometry;
}

/** Alpine evergreen, approximately 5.9–7.3 m tall and 4.3–5.7 m broad.
 * Seven staggered, imperfect whorls; a bent tapering leader; flared surface roots.
 * Bark and needles are material batches. No cone/cylinder canopy primitives.
 */
export function createAlphaPine(seed = 0): { bark: BufferGeometry; needles: BufferGeometry } {
  return buildAlphaPine(seed, false);
}

/** Distant counterpart: same seeded trunk, tiers and branch paths, reduced samples.
 * Retains solid scalloped bough mass and the bark/needle material contract.
 */
export function createAlphaPineFar(seed = 0): { bark: BufferGeometry; needles: BufferGeometry } {
  return buildAlphaPine(seed, true);
}

function buildAlphaPine(seed: number, far: boolean): { bark: BufferGeometry; needles: BufferGeometry } {
  const rnd = random(seed), bark: BufferGeometry[] = [], needles: BufferGeometry[] = [];
  const height = 5.8 + rnd() * 1.35, girth = .16 + rnd() * .035, phase = rnd() * TAU;
  const lean = point((rnd() - .5) * .19, 0, (rnd() - .5) * .19);
  const trunk = (t: number) => point(lean.x * t * t + Math.sin(t * 5 + phase) * .035 * t,
    height * t, lean.z * t * t + Math.cos(t * 4 + phase) * .025 * t);
  const trunkPath: Point[] = [], radii: number[] = [];
  const trunkSegments = far ? 6 : 12;
  for (let i = 0; i <= trunkSegments; i++) {
    const t = i / trunkSegments;
    trunkPath.push(trunk(t));
    radii.push(girth * Math.pow(1 - t, .88) + .006 + .12 * Math.exp(-t * 29));
  }
  bark.push(tube(trunkPath, radii, far ? 6 : 10));
  for (let i = 0; i < 5; i++) {
    const a = phase + i * TAU / 5 + (rnd() - .5) * .28;
    const radial = point(Math.cos(a), 0, Math.sin(a));
    const rootLength = .40 + rnd() * .20;
    bark.push(tube([point(0, .29, 0), radial.clone().multiplyScalar(rootLength * .46).add(point(0, .10, 0)),
      radial.clone().multiplyScalar(rootLength).add(point(0, .018, 0))], [girth * .67, .077, .018], far ? 3 : 5));
  }
  const counts = [6, 6, 5, 5, 4, 4, 3];
  for (let tier = 0; tier < counts.length; tier++) {
    const t = .26 + tier * .104;
    for (let branch = 0; branch < counts[tier]; branch++) {
      const keepBranch = !far || branch < counts[tier] - 1;
      const a = phase + tier * 1.43 + branch / counts[tier] * TAU + (rnd() - .5) * .22;
      const radial = point(Math.cos(a), 0, Math.sin(a));
      const lateral = point(-Math.sin(a), 0, Math.cos(a));
      const reach = height * .32 * Math.pow(1 - tier / 8, .95) * (.86 + rnd() * .24);
      const base = trunk(t + (rnd() - .5) * .030);
      const droop = reach * (.18 + rnd() * .08);
      const end = base.clone().addScaledVector(radial, reach).add(point(0, -droop, 0));
      const b = base.clone().addScaledVector(radial, reach * .28).add(point(0, reach * .12, 0));
      const c = base.clone().addScaledVector(radial, reach * .75).addScaledVector(lateral, (rnd() - .5) * .16)
        .add(point(0, -droop * .75, 0));
      // All 33 crown masses survive in the far variant: twig sampling may reduce,
      // but the layered outer silhouette and its trunk attachments must remain.
      needles.push(foliagePad(base, b, c, end, lateral, .14 + reach * .28,
        .13 + reach * .065, a + tier * .53, far));
      const branchSegments = far ? 2 : 4;
      const branchPath = Array.from({ length: branchSegments + 1 }, (_, i) => curve(base, b, c, end, i / branchSegments));
      const branchRadius = girth * (.36 - tier * .031);
      if (keepBranch) bark.push(tube(branchPath, far ? [branchRadius, branchRadius * .48, .006]
        : [branchRadius, branchRadius * .73, branchRadius * .48, branchRadius * .24, .006], far ? 3 : 5));
      for (let twig = 0; twig < 5; twig++) {
        const u = .28 + twig * .16;
        const anchor = curve(base, b, c, end, u);
        const sign = twig % 2 === 0 ? 1 : -1;
        const direction = radial.clone().multiplyScalar(.82).addScaledVector(lateral, sign * .70)
          .add(point(0, -.08 - twig * .035, 0));
        const sprayLength = (.32 + reach * .12) * (.9 + rnd() * .20);
        spray(needles, anchor, direction, sprayLength, .041 + reach * .007, a + twig, rnd,
          far, keepBranch && (!far || twig === 1 || twig === 4));
      }
    }
  }
  // Three supported ascending pads fill the crown around the existing leader.
  for (let i = 0; i < 3; i++) {
    const a = phase + i * 2.39996, radial = point(Math.cos(a), 0, Math.sin(a));
    const root = trunk(.865 + i * .02), tip = trunk(.99).addScaledVector(radial, .10);
    const b = root.clone().lerp(tip, .30).addScaledVector(radial, .12);
    const c = root.clone().lerp(tip, .72).addScaledVector(radial, .13);
    needles.push(foliagePad(root, b, c, tip, point(-radial.z, 0, radial.x), .16, .10, a, far));
  }
  // Tight ascending crown closes the leader without a separate pointed canopy.
  for (let i = 0; i < 5; i++) {
    const a = phase + i * 2.39996;
    spray(needles, trunk(.92 + i * .014), point(Math.cos(a) * .35, .9, Math.sin(a) * .35),
      .29 - i * .018, .031, a, rnd, far);
  }
  const barkGeometry = merge(bark), needleGeometry = merge(needles);
  // Bent trunk frames can lower one root-ring vertex a millimetre. Preserve one
  // shared datum for both batches so instances meet the terrain at exactly Y=0.
  const ground = Math.min(barkGeometry.boundingBox!.min.y, needleGeometry.boundingBox!.min.y);
  for (const geometry of [barkGeometry, needleGeometry]) {
    geometry.translate(0, -ground, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return { bark: barkGeometry, needles: needleGeometry };
}

/** Low, broad alpine evergreen shrub, about 0.5–0.9 m high, rooted at Y=0.
 * One green material batch: shaded olive stems and closed thick leaflets can share
 * an understated rough nonmetallic response. No transparent texture required.
 */
export function createAlphaShrub(seed = 0): BufferGeometry {
  const rnd = random(seed), parts: BufferGeometry[] = [];
  const phase = rnd() * TAU, scale = .85 + rnd() * .27;
  for (let shoot = 0; shoot < 7; shoot++) {
    const a = phase + shoot * 2.39996;
    const radial = point(Math.cos(a), 0, Math.sin(a));
    const lateral = point(-radial.z, 0, radial.x);
    const reach = (.36 + rnd() * .20) * scale;
    const h = (.39 + rnd() * .27) * scale;
    const root = radial.clone().multiplyScalar(.055).add(point(0, .022, 0));
    const end = radial.clone().multiplyScalar(reach).add(point(0, h, 0));
    const b = root.clone().add(point(0, h * .60, 0));
    const c = end.clone().multiplyScalar(.82).add(point(0, h * .14, 0));
    parts.push(tube(Array.from({ length: 4 }, (_, i) => curve(root, b, c, end, i / 3)),
      [.028, .021, .013, .004], 5));
    for (let twig = 0; twig < 3; twig++) {
      const anchor = curve(root, b, c, end, .42 + twig * .25);
      const direction = radial.clone().multiplyScalar(.7).addScaledVector(lateral, twig % 2 ? -.7 : .7)
        .add(point(0, .48 - twig * .13, 0));
      spray(parts, anchor, direction, (.27 + rnd() * .09) * scale, .060 * scale, a + twig, rnd,
        false, true, roundedShrubLeaf);
    }
  }
  const geometry = merge(parts);
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Twelve thin, solid curved grass blades; 192 triangles, no alpha texture.
 * Height about 0.19–0.33 m, grounded at Y=0. Smooth FrontSide material is enough.
 * Two lenticular sections per blade preserve an arched/tapered silhouette instead
 * of crossed flat cards. All blade roots stay within a small planted clump.
 */
export function createAlphaGrassTuft(seed = 0): BufferGeometry {
  const rnd = random(seed), parts: BufferGeometry[] = [];
  const phase = rnd() * TAU, scale = .84 + rnd() * .21;
  for (let blade = 0; blade < 12; blade++) {
    const angle = phase + blade * 2.39996 + (rnd() - .5) * .22;
    const radial = point(Math.cos(angle), 0, Math.sin(angle));
    const side = point(-radial.z, 0, radial.x);
    const h = (.20 + rnd() * .11) * scale;
    const reach = h * (.28 + rnd() * .46);
    const root = radial.clone().multiplyScalar(.012 + rnd() * .026);
    const bend = point(-radial.z, 0, radial.x).multiplyScalar((rnd() - .5) * .035);
    const tip = root.clone().addScaledVector(radial, reach).add(bend).add(point(0, h, 0));
    const controlA = root.clone().add(point(0, h * .46, 0));
    const controlB = root.clone().addScaledVector(radial, reach * .42).addScaledVector(bend, .4)
      .add(point(0, h * .91, 0));
    const positions = [...root.toArray()], normals = [0, -1, 0], uv = [.5, 0], indices: number[] = [];
    const width = (.009 + rnd() * .007) * scale;
    for (const [t, taper] of [[.40, 1], [.77, .52]]) {
      const center = curve(root, controlA, controlB, tip, t);
      const tangent = curve(root, controlA, controlB, tip, t + .01)
        .sub(curve(root, controlA, controlB, tip, t - .01)).normalize();
      const normal = new Vector3().crossVectors(tangent, side).normalize();
      for (let corner = 0; corner < 4; corner++) {
        const a = corner * TAU / 4;
        positions.push(...center.clone().addScaledVector(side, Math.cos(a) * width * taper)
          .addScaledVector(normal, Math.sin(a) * .0017 * scale * taper).toArray());
        // Explicit cross-section normals avoid area weighting pulling the thin
        // inside-bend tip normal through the opposite side of the curved blade.
        normals.push(...side.clone().multiplyScalar(Math.cos(a))
          .addScaledVector(normal, Math.sin(a)).normalize().toArray());
        uv.push(corner / 4, t);
      }
    }
    positions.push(...tip.toArray()); uv.push(.5, 1);
    normals.push(...tip.clone().sub(controlB).normalize().toArray());
    for (let corner = 0; corner < 4; corner++) {
      const a = 1 + corner, b = 1 + (corner + 1) % 4;
      indices.push(0, b, a, a, b, a + 4, b, b + 4, a + 4, a + 4, b + 4, 9);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    parts.push(geometry);
  }
  return merge(parts);
}
