import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Triangle, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALPHA_MAIN_PATH,ALPHA_STATIONS } from './alpha-layout';
import { alphaHeight } from './alpha-terrain';
import type { Vec3 } from '../types';

type Kind = 'trunk' | 'root' | 'bough' | 'twig' | 'arm';
type Bone = {
  id: string; kind: Kind; parent: Bone | null; attach: number; curve: CatmullRomCurve3;
  length: number; travel: number; points: Vector3[]; side: Vector3[]; up: Vector3[];
  radii: number[]; sides: number;
};
type Collider = { a: Vec3; b: Vec3; radius: number };
const TAU = Math.PI * 2;
const ORIGIN: Vec3 = ALPHA_STATIONS.tree;
const PULL: Vec3 = [-.7, 1.2, 1.3];
const ANCHOR: Vec3 = [-.7, 3.2, 1.3];
const APPROACH: Vec3 = [-1.15, .88, 1.15];
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const tuple = (p: Vector3) => p.toArray() as Vec3;
const ground = (x: number, z: number) => alphaHeight(ORIGIN[0] + x, ORIGIN[2] + z) - ORIGIN[1];

function geometry(positions: number[], uv: number[], indices: number[], travel: number[], normals?: number[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
  g.setAttribute('alphaTravel', new Float32BufferAttribute(travel, 1));
  g.setIndex(indices);
  if (normals) g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  else g.computeVertexNormals();
  return g;
}

function merge(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  if (!g) throw new Error('Grammar tree attributes must remain compatible');
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

function makeBone(id: string, kind: Kind, parent: Bone | null, attach: number, controls: Vector3[],
  radiusStart: number, radiusEnd: number, segments: number, sides: number): Bone {
  const start = parent ? parent.curve.getPointAt(attach) : controls[0].clone();
  const curve = new CatmullRomCurve3([start, ...controls.slice(1)], false, 'centripetal');
  curve.arcLengthDivisions = 256; curve.updateArcLengths();
  const length = curve.getLength(), travel = parent ? parent.travel + parent.length * attach : 0;
  const points: Vector3[] = [], side: Vector3[] = [], up: Vector3[] = [], radii: number[] = [];
  let previous: Vector3 | undefined;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, tangent = curve.getTangentAt(t).normalize();
    let s = previous ? previous.clone().addScaledVector(tangent, -previous.dot(tangent))
      : new Vector3().crossVectors(tangent, Math.abs(tangent.y) > .92 ? v(1, 0, 0) : v(0, 1, 0));
    if (s.lengthSq() < 1e-8) s = new Vector3().crossVectors(tangent, v(0, 0, 1));
    s.normalize(); previous = s;
    points.push(curve.getPointAt(t)); side.push(s); up.push(new Vector3().crossVectors(tangent, s).normalize());
    const flare = kind === 'trunk' ? .23 * Math.exp(-t * 22) : 0;
    radii.push(radiusStart * Math.pow(1 - t, .92) + radiusEnd * t + flare);
  }
  return { id, kind, parent, attach, curve, length, travel, points, side, up, radii, sides };
}

/** Interrupted bark plates, shared by the wood and sap traces. Broad/short axial
 * cells interrupt the former continuous vertical grooves; no high-frequency shell. */
function barkCell(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);const h=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};return(h(ix,iy)*(1-sx)+h(ix+1,iy)*sx)*(1-sy)+(h(ix,iy+1)*(1-sx)+h(ix+1,iy+1)*sx)*sy;}

function surface(bone: Bone, ring: number, angle: number) {
  const distance = ring / (bone.points.length - 1) * bone.length;
  const cell=barkCell(angle*2.1,distance/ .52),interrupt=barkCell(angle*1.3+4,distance/.78);
  const groove = 1 + (cell-.5)*.023 + Math.cos(angle*8+cell*3)*.004*(interrupt>.43?1:.15);
  const radial = bone.side[ring].clone().multiplyScalar(Math.cos(angle))
    .addScaledVector(bone.up[ring], Math.sin(angle));
  return { position: bone.points[ring].clone().addScaledVector(radial, bone.radii[ring] * groove), radial };
}

function barkTube(bone: Bone) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], travel: number[] = [];
  const segments = bone.points.length - 1, sides = bone.sides;
  for (let ring = 0; ring <= segments; ring++) for (let j = 0; j <= sides; j++) {
    const angle = j / sides * TAU;
    positions.push(...surface(bone, ring, angle).position.toArray());
    // Circumference and length are both metres, rather than one stretched UV tile.
    uv.push(angle * bone.radii[ring], bone.travel + bone.length * ring / segments);
    travel.push(bone.travel + bone.length * ring / segments);
    if (ring < segments && j < sides) {
      const a = ring * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  for (const ring of [0, segments]) {
    const center = positions.length / 3;
    positions.push(...bone.points[ring].toArray()); uv.push(0, bone.travel + bone.length * ring / segments);
    travel.push(bone.travel + bone.length * ring / segments);
    for (let j = 0; j < sides; j++) {
      const a = ring * (sides + 1) + j;
      indices.push(...(ring === 0 ? [center, a + 1, a] : [center, a, a + 1]));
    }
  }
  const g = geometry(positions, uv, indices, travel), normals = g.getAttribute('normal');
  for (let ring = 0; ring <= segments; ring++) {
    const first = ring * (sides + 1), last = first + sides;
    const n = new Vector3().fromBufferAttribute(normals, first)
      .add(new Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, n.x, n.y, n.z); normals.setXYZ(last, n.x, n.y, n.z);
  }
  return g;
}

/** A thin embedded vein along an ACTUAL longitudinal bark edge, never a separate
 * spiral or floating light ball. Centre is 4mm inside that surface; the ridge's
 * visible crown projects a nominal 8mm; the actual faceted-surface separation is
 * measured below. alphaTravel follows the shared bone length.
 */
function pulseTube(bone: Bone, edge: number) {
  const angle = edge / bone.sides * TAU, path: Vector3[] = [];
  for (let i = 0; i < bone.points.length; i++) {
    const s = surface(bone, i, angle);
    path.push(s.position.addScaledVector(s.radial, -.004));
  }
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], travel: number[] = [];
  const thickness = Math.min(.012, bone.radii[0] * .12), sides = 5, segments = path.length - 1;
  let previous: Vector3 | undefined;
  for (let ring = 0; ring <= segments; ring++) {
    const tangent = path[Math.min(segments, ring + 1)].clone().sub(path[Math.max(0, ring - 1)]).normalize();
    const side = previous ? previous.clone().addScaledVector(tangent, -previous.dot(tangent)).normalize()
      : new Vector3().crossVectors(tangent, Math.abs(tangent.y) > .92 ? v(1, 0, 0) : v(0, 1, 0)).normalize();
    previous = side;
    const up = new Vector3().crossVectors(tangent, side).normalize();
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU;
      positions.push(...path[ring].clone().addScaledVector(side, Math.cos(a) * thickness)
        .addScaledVector(up, Math.sin(a) * thickness).toArray());
      uv.push(j / sides, bone.length * ring / segments);
      travel.push(bone.travel + bone.length * ring / segments);
      if (ring < segments && j < sides) {
        const first = ring * (sides + 1) + j, next = first + sides + 1;
        indices.push(first, first + 1, next, first + 1, next + 1, next);
      }
    }
  }
  for (const ring of [0, segments]) {
    const center = positions.length / 3;
    positions.push(...path[ring].toArray()); uv.push(.5, bone.length * ring / segments);
    travel.push(bone.travel + bone.length * ring / segments);
    for (let j = 0; j < sides; j++) {
      const first = ring * (sides + 1) + j;
      indices.push(...(ring === 0 ? [center, first + 1, first] : [center, first, first + 1]));
    }
  }
  return geometry(positions, uv, indices, travel);
}

/** Measure actual emitted pulse vertices AND triangle centroids against the
 * actual bark mesh triangles on both sides of the shared longitudinal edge.
 * Reading both meshes here catches offsets that a nominal radius alone cannot.
 */
function measurePulseSurface(bone: Bone, edge: number, bark: BufferGeometry, pulse: BufferGeometry) {
  const bp = bark.getAttribute('position'), bi = bark.getIndex()!, pp = pulse.getAttribute('position'), pi = pulse.getIndex()!;
  const segments = bone.points.length - 1, pulseSides = 5;
  const triangle = new Triangle(), closest = new Vector3(), bestNormal = new Vector3(), faceNormal = new Vector3();
  const delta = new Vector3(), sample = new Vector3(), bestPoint = new Vector3();
  let samples = 0, maxDistance = 0, maxOutside = 0;
  const check = (p: Vector3, nearRing: number) => {
    let best = Infinity;
    const face = (offset: number) => {
      triangle.a.fromBufferAttribute(bp, bi.getX(offset));
      triangle.b.fromBufferAttribute(bp, bi.getX(offset + 1));
      triangle.c.fromBufferAttribute(bp, bi.getX(offset + 2));
      triangle.closestPointToPoint(p, closest);
      const distance = closest.distanceToSquared(p);
      if (distance < best) { best = distance; bestPoint.copy(closest); triangle.getNormal(bestNormal); }
    };
    for (let row = Math.max(0, nearRing - 1); row <= Math.min(segments - 1, nearRing); row++) {
      for (const side of [(edge + bone.sides - 1) % bone.sides, edge]) {
        const offset = (row * bone.sides + side) * 6;
        face(offset); face(offset + 3);
      }
    }
    if (nearRing === 0 || nearRing === segments) {
      const cap = segments * bone.sides * 6 + (nearRing === 0 ? 0 : bone.sides * 3);
      for (let side = 0; side < bone.sides; side++) face(cap + side * 3);
    }
    const distance = Math.sqrt(best), outside = delta.copy(p).sub(bestPoint).dot(bestNormal) >= 0;
    maxDistance = Math.max(maxDistance, distance);
    if (outside) maxOutside = Math.max(maxOutside, distance);
    samples++;
  };
  for (let i = 0; i < pp.count; i++) {
    const ring = i < (segments + 1) * (pulseSides + 1) ? Math.floor(i / (pulseSides + 1))
      : i === pp.count - 2 ? 0 : segments;
    check(sample.fromBufferAttribute(pp, i), ring);
  }
  const bodyIndices = segments * pulseSides * 6;
  for (let i = 0; i < pi.count; i += 3) {
    sample.fromBufferAttribute(pp, pi.getX(i));
    sample.add(closest.fromBufferAttribute(pp, pi.getX(i + 1)));
    sample.add(faceNormal.fromBufferAttribute(pp, pi.getX(i + 2))).multiplyScalar(1 / 3);
    const ring = i < bodyIndices ? Math.floor(i / (pulseSides * 6)) + 1
      : i < bodyIndices + pulseSides * 3 ? 0 : segments;
    check(sample, ring);
  }
  return { samples, maxDistance, maxOutside };
}

/** Full terminal-ring and cap samples, not merely the root centre. */
function terminalFootGap(bone: Bone) {
  const ring = bone.points.length - 1, center = bone.points[ring];
  let maxGap = center.y - ground(center.x, center.z);
  for (let j = 0; j < bone.sides; j++) {
    const outer = surface(bone, ring, j / bone.sides * TAU).position;
    for (const t of [.25, .5, .75, 1]) {
      const p = center.clone().lerp(outer, t);
      maxGap = Math.max(maxGap, p.y - ground(p.x, p.z));
    }
  }
  return maxGap;
}

/** A real 6–8cm thick, rounded, gently curved leaf plate attached at its top.
 * Eight oval sections and rounded cross-sections keep close views free of flat
 * triangular leaf cards. Travel continues down the leaf's curved centre line.
 */
function leafPlate(root: Vector3, direction: Vector3, width: number, length: number, distance: number, phase: number, verify: boolean) {
  const forward = direction.clone().normalize(), side = v(Math.cos(phase), .08, Math.sin(phase));
  side.addScaledVector(forward, -side.dot(forward)).normalize();
  const normal = new Vector3().crossVectors(forward, side).normalize();
  const bend = normal.clone().multiplyScalar(.045 + .012 * Math.sin(phase));
  const center = (t: number) => root.clone().addScaledVector(forward, length * t).addScaledVector(bend, Math.sin(t * Math.PI));
  const outline = (t: number, angle: number) => center(t)
    .addScaledVector(side, Math.cos(angle) * width * Math.pow(Math.sin(t * Math.PI), .50))
    .addScaledVector(normal, Math.sin(angle) * .035 * Math.pow(Math.sin(t * Math.PI), .42));
  const sections = [.035, .10, .22, .38, .56, .73, .88, .965], sides = 10;
  const positions = [...root.toArray()], uv = [.5, 0], travel = [distance], indices: number[] = [], normals: number[] = [];
  normals.push(...forward.clone().addScaledVector(bend, Math.PI / length).normalize().negate().toArray());
  let previous = root.clone(), traveled = 0, previousT = 0;
  for (const t of sections) {
    // Fine quadrature preserves the propagation length of the curved leaf axis.
    for (let k = 1; k <= 8; k++) {
      const p = center(previousT + (t - previousT) * k / 8);
      traveled += p.distanceTo(previous); previous = p;
    }
    previousT = t;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU, p = outline(t, a);
      const along = outline(t + .0001, a).sub(outline(t - .0001, a));
      const around = outline(t, a + .0001).sub(outline(t, a - .0001));
      const n = around.cross(along).normalize();
      positions.push(...p.toArray()); normals.push(...n.toArray()); uv.push(j / sides, t); travel.push(distance + traveled);
    }
  }
  const end = positions.length / 3;
  positions.push(...center(1).toArray()); uv.push(.5, 1);
  traveled += center(1).distanceTo(previous); travel.push(distance + traveled);
  normals.push(...forward.clone().addScaledVector(bend, -Math.PI / length).normalize().toArray());
  for (let j = 0; j < sides; j++) {
    indices.push(0, j + 2, j + 1);
    for (let ring = 0; ring < sections.length - 1; ring++) {
      const a = 1 + ring * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const a = 1 + (sections.length - 1) * (sides + 1) + j;
    indices.push(a, a + 1, end);
  }
  const g = geometry(positions, uv, indices, travel, normals);
  let thickness: number | null = null, sag: number | null = null;
  if (verify) {
    thickness = 0; sag = 0;
    const p = g.getAttribute('position');
    for (let ring = 0; ring < sections.length; ring++) {
      const first = 1 + ring * (sides + 1);
      const a = new Vector3().fromBufferAttribute(p, first + 2), b = new Vector3().fromBufferAttribute(p, first + 7);
      thickness = Math.max(thickness, Math.abs(a.clone().sub(b).dot(normal)));
      const midpoint = a.add(b).multiplyScalar(.5), straight = root.clone().addScaledVector(forward, length * sections[ring]);
      sag = Math.max(sag, midpoint.distanceTo(straight));
    }
  }
  return { geometry: g, thickness, sag };
}

function segmentDistance2D(a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  const pointSegment = (p: Vec3, x: Vec3, y: Vec3) => {
    const dx = y[0] - x[0], dz = y[2] - x[2], length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((p[0] - x[0]) * dx + (p[2] - x[2]) * dz) / length)) : 0;
    return Math.hypot(p[0] - x[0] - dx * t, p[2] - x[2] - dz * t);
  };
  // All protected-corridor and wood segments are disjoint here; endpoint minima
  // are sufficient, and a crossing would be caught separately by the QA check.
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

/** One station-three representative only. Returned geometry is TREE-LOCAL;
 * parent group position is report.origin = [-42,18,-29] inside the Alpha island.
 * No materials, rope, independent gold balls, scene placement or global scatter.
 * Production defaults to geometry construction only. verify:true additionally
 * measures pulse/bark separation, leaf sections and attachment/approach clearance;
 * unmeasured diagnostic report fields are null, never a false zero-pass result.
 */
export function createAlphaGrammarTree(options: { verify?: boolean } = {}) {
  const verify = options.verify === true;
  const bones: Bone[] = [], bark: BufferGeometry[] = [], leaves: BufferGeometry[] = [], pulses: BufferGeometry[] = [];
  const colliders: Collider[] = [], colliderBones: string[] = [];let badBone:Bone|null=null,badLeaf:BufferGeometry|null=null;
  const leafAttachments: { branch: string; position: Vec3; alphaTravel: number; error: number | null; thickness: number | null; sag: number | null }[] = [];
  const footSupports: { position: Vec3; terrainY: number; tipY: number; burial: number; terminalMaxGap: number }[] = [];
  const pulseSurface = verify ? { samples: 0, maxDistance: 0, maxOutside: 0 } : null;
  const trunk = makeBone('trunk', 'trunk', null, 0,
    [v(0, 0, 0), v(.11, 1.7, -.05), v(.24, 3.2, .12), v(-.12, 5, .08), v(.08, 7.2, -.16), v(.18, 9, .08), v(.28, 10.4, -.10)],
    .51, .065, 48, 18);
  bones.push(trunk);
  // No root is laid across the negative-X/positive-Z approach quadrant.
  for (const [i, angle] of [.05, .65, 1.16, 3.48, 4.15, 4.92, 5.65].entries()) {
    const reach = 1.40 + (i % 3) * .20, radial = v(Math.cos(angle), 0, Math.sin(angle));
    const toe = radial.clone().multiplyScalar(reach), terrainY = ground(toe.x, toe.z);
    toe.y = terrainY - .015;
    const buildRoot = () => makeBone(`root-${i}`, 'root', trunk, .057,
      [v(0, 0, 0), radial.clone().multiplyScalar(reach * .35).add(v(0, .31, 0)),
        radial.clone().multiplyScalar(reach * .73).add(v(0, Math.max(.07, terrainY + .10), 0)), toe], .24, .024, 12, 12);
    let root = buildRoot();
    for (let pass = 0; pass < 4; pass++) {
      const gap = terminalFootGap(root);
      if (gap <= -.0155) break;
      toe.y -= gap + .016;
      root = buildRoot();
    }
    bones.push(root);
    footSupports.push({ position: tuple(toe), terrainY, tipY: toe.y, burial: terrainY - toe.y,
      terminalMaxGap: terminalFootGap(root) });
  }
  const major = [
    { t: .295, end: [v(-1.3, 4.4, .2), v(-2.5, 6.1, .65), v(-3.1, 7.8, .8)] },
    { t: .395, end: [v(1.5, 5.2, -.45), v(2.9, 6.6, -.4), v(3.7, 8, -.65)] },
    { t: .555, end: [v(-.9, 7.1, -1.3), v(-1.9, 8.5, -1.9), v(-2.6, 9.5, -1.9)] },
    { t: .675, end: [v(.9, 8, 1.3), v(1.2, 9.15, 2), v(1.6, 10.25, 2.05)] },
  ];
  for (const [i, spec] of major.entries()) {
    const branch = makeBone(`bough-${i}`, 'bough', trunk, spec.t,
      [v(0, 0, 0), ...spec.end], .225 - i * .018, .047, 24, 12);
    bones.push(branch);
    for (let twig = 0; twig < 6; twig++) {
      const attach = .36 + twig * .122, start = branch.curve.getPointAt(attach);
      const outward = v(start.x, 0, start.z).normalize(), lateral = v(-outward.z, 0, outward.x);
      const sign = twig % 2 ? -1 : 1, reach = .52 + (twig % 3) * .12;
      const end = start.clone().addScaledVector(outward, reach * .65)
        .addScaledVector(lateral, sign * reach * .63).add(v(0, .20 + twig * .028, 0));
      const twigBone = makeBone(`twig-${i}-${twig}`, 'twig', branch, attach,
        [start, start.clone().lerp(end, .38).add(v(0, .12, 0)), end], .047, .021, 9, 8);
      bones.push(twigBone);
      const axis = outward.clone().multiplyScalar(.25).addScaledVector(lateral, sign * .12).add(v(0, -1, 0)).normalize();
      const leafRoot = twigBone.points.at(-1)!.clone(), travel = twigBone.travel + twigBone.length;
      const plate = leafPlate(leafRoot, axis, .23 + (twig % 2) * .025, .68 + (twig % 3) * .055,
        travel, i * 1.7 + twig * .41, verify);
      if(i===2&&twig===5){badBone=twigBone;badLeaf=plate.geometry;}else leaves.push(plate.geometry);
      leafAttachments.push({ branch: twigBone.id, position: tuple(leafRoot), alphaTravel: travel,
        error: verify ? leafRoot.distanceTo(twigBone.curve.getPointAt(1)) : null, thickness: plate.thickness, sag: plate.sag });
    }
  }
  bones.push(makeBone('rope-arm', 'arm', trunk, .265,
    [v(0, 0, 0), v(-.25, 3.15, .45), v(-.63, 3.35, 1), new Vector3(...ANCHOR)], .125, .072, 14, 12));

  for (const bone of bones) {
    const barkGeometry = barkTube(bone);
    if(bone===badBone){barkGeometry.dispose();continue;}
    bark.push(barkGeometry);
    const edges = bone.kind === 'trunk' ? [2, 8, 14] : bone.kind === 'bough' ? [3, 9] : [Math.floor(bone.sides * .6)];
    edges.forEach(edge => {
      const pulse = pulseTube(bone, edge);
      pulses.push(pulse);
      if (pulseSurface) {
        const measured = measurePulseSurface(bone, edge, barkGeometry, pulse);
        pulseSurface.samples += measured.samples;
        pulseSurface.maxDistance = Math.max(pulseSurface.maxDistance, measured.maxDistance);
        pulseSurface.maxOutside = Math.max(pulseSurface.maxOutside, measured.maxOutside);
      }
    });
    if (bone.kind !== 'trunk' && bone.kind !== 'root') continue;
    for (let i = 1; i < bone.points.length; i++) {
      const radius = Math.max(bone.radii[i - 1], bone.radii[i]) * 1.037;
      const a = bone.points[i - 1].clone(), b = bone.points[i].clone(), limit = 2.2 - radius;
      if (a.y > limit && b.y > limit) continue;
      if (a.y > limit) a.lerp(b, (a.y - limit) / (a.y - b.y));
      if (b.y > limit) b.lerp(a, (b.y - limit) / (b.y - a.y));
      if (a.distanceToSquared(b) < 1e-8) continue;
      // Inner root joints are already inside the trunk proxy; omit any root
      // capsule whose bounds would intrude into the protected approach quadrant.
      if (bone.kind === 'root' && Math.min(a.x, b.x) - radius < 0 && Math.max(a.z, b.z) + radius > 0) continue;
      colliders.push({ a: tuple(a), b: tuple(b), radius });
      colliderBones.push(bone.id);
    }
  }
  if(!badBone||!badLeaf)throw new Error('One attached bad twig is required');
  const bad:Bone=badBone,anchor=bad.points[0].clone(),badBark=barkTube(bad);badBark.translate(-anchor.x,-anchor.y,-anchor.z);badLeaf.translate(-anchor.x,-anchor.y,-anchor.z);
  const badColliders:Collider[]=[];for(let i=2;i<bad.points.length;i+=2){badColliders.push({a:tuple(bad.points[i-2].clone().sub(anchor)),b:tuple(bad.points[i].clone().sub(anchor)),radius:Math.max(bad.radii[i-2],bad.radii[i])*1.02});}
  badLeaf.computeBoundingBox();const leafBox=badLeaf.boundingBox!,leafHalf=leafBox.getSize(new Vector3()).multiplyScalar(.5),leafCenter=leafBox.getCenter(new Vector3());
  let projectionDistance=Infinity,radiusBound=0;for(const g of [badBark,badLeaf]){const p=g.getAttribute('position');for(let i=0;i<p.count;i++){const q=new Vector3().fromBufferAttribute(p,i);radiusBound=Math.max(radiusBound,q.length());const projected:Vec3=[ORIGIN[0]+anchor.x+q.x,0,ORIGIN[2]+anchor.z+q.z];for(let j=1;j<ALPHA_MAIN_PATH.length;j++)projectionDistance=Math.min(projectionDistance,segmentDistance2D(projected,projected,ALPHA_MAIN_PATH[j-1],ALPHA_MAIN_PATH[j]));}}
  const union=badBark.boundingBox??(badBark.computeBoundingBox(),badBark.boundingBox!);const center=union.clone().union(leafBox).getCenter(new Vector3());let centeredRadius=0;for(const g of [badBark,badLeaf]){const p=g.getAttribute('position');for(let i=0;i<p.count;i++)centeredRadius=Math.max(centeredRadius,new Vector3().fromBufferAttribute(p,i).distanceTo(center));}
  for(const c of badColliders)for(const point of [c.a,c.b])centeredRadius=Math.max(centeredRadius,new Vector3(...point).distanceTo(center)+c.radius);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])centeredRadius=Math.max(centeredRadius,leafCenter.clone().add(new Vector3(leafHalf.x*x,leafHalf.y*y,leafHalf.z*z)).distanceTo(center));
  const breakaway={id:bad.id,anchor:tuple(anchor),parts:[{finish:'bark' as const,geometry:badBark},{finish:'leafplate' as const,geometry:badLeaf}],colliders:badColliders,leafCollider:{position:tuple(leafCenter),halfExtents:tuple(leafHalf)},travel:bad.travel,radiusBound,boundCenter:tuple(center),boundRadius:centeredRadius};
  const barkGeometry = merge(bark), leafGeometry = merge(leaves), pulse = merge(pulses);
  const min = barkGeometry.boundingBox!.min.clone().min(leafGeometry.boundingBox!.min);
  const max = barkGeometry.boundingBox!.max.clone().max(leafGeometry.boundingBox!.max);
  const triangles = (g: BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3;
  const maxAttachmentError = verify ? Math.max(...bones.filter(b => b.parent).map(b => b.points[0]
    .distanceTo(b.parent!.curve.getPointAt(b.attach))), ...leafAttachments.map(l => l.error!)) : null;
  const corridorClearance = verify ? Math.min(...colliders.map(c => segmentDistance2D(c.a, c.b, APPROACH, PULL) - c.radius)) : null;
  return {
    parts: [{ finish: 'bark' as const, geometry: barkGeometry }, { finish: 'leafplate' as const, geometry: leafGeometry }],
    pulse, colliders,breakaway,
    report: {
      measured: verify, supportAdjustmentMeasured: true,
      origin: [...ORIGIN] as Vec3, ropePull: [...PULL] as Vec3, ropeAnchor: [...ANCHOR] as Vec3, approach: [...APPROACH] as Vec3,
      bounds: { min: tuple(min), max: tuple(max) }, dimensions: tuple(max.clone().sub(min)), leafCount: leafAttachments.length,
      triangles: { bark: triangles(barkGeometry), leafplate: triangles(leafGeometry), pulse: triangles(pulse) },
      skeleton: bones.map(b => ({ id: b.id, kind: b.kind, parent: b.parent?.id ?? null, attach: b.attach,
        start: tuple(b.points[0]), end: tuple(b.points.at(-1)!), distanceFromRoot: b.travel, length: b.length })),
      leafAttachments, footSupports, maxAttachmentError, maxPulseSurfaceGap: pulseSurface?.maxOutside ?? null,
      pulseSurface: pulseSurface ? { measured: true, ...pulseSurface } : { measured: false, samples: null, maxDistance: null, maxOutside: null },
      colliderCount: colliders.length, colliderBones, corridorClearance, colliderTopLimit: 2.2,
      leafPlateThickness: verify ? Math.max(...leafAttachments.map(p => p.thickness!)) : null, leafPlateDesignThickness: .07,
      leafPlateThicknessRange: verify ? [Math.min(...leafAttachments.map(p => p.thickness!)), Math.max(...leafAttachments.map(p => p.thickness!))] : null,
      leafPlateMaxSag: verify ? Math.max(...leafAttachments.map(p => p.sag!)) : null,
      pulseLineCount: 42,staticLeafCount:23,breakaway:{id:bad.id,anchor:tuple(anchor),initialAttachmentError:verify?anchor.distanceTo(bad.parent!.curve.getPointAt(bad.attach)):null,projectionDistance,mainPathHalfWidth:2.1,projectionMargin:projectionDistance-2.1,radiusBound,boundCenter:tuple(center),boundRadius:centeredRadius,neverIlluminated:true}, travelUnits: 'metres along the root-connected skeleton',
      attributes: ['position', 'normal', 'uv', 'color', 'alphaTravel'],
    },
  };
}
