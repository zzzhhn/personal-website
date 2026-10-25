import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, Group,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Path, Shape, Sphere, SphereGeometry, Vector3,
  type ColorRepresentation } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeNode } from './WorldVehicleAssets';
import type { VehicleId } from './types';

type Point = [number, number, number];
type Aperture = [number, number][]; // lateral Z, height Y, counterclockwise
type Plane = { normal: Point; offset: number };
type Vertex = Record<string, number[]>;
const EPS = 1e-8;
const PALETTE = {
  dark: ['#3A3F47', .85, 0, 'accent'], metal: ['#A3A7AA', .4, .55, 'metal'],
  steel: ['#3A3F47', .55, .35, 'metal'], lamp: ['#F3ECDC', .2, 0, 'light_front'],
  lens: ['#2E4363', .25, 0, 'glass'], cream: ['#E6DCCB', .55, 0, 'paint'],
} as const;

function splitPolygon(poly: Vertex[], plane: Plane): [Vertex[], Vertex[]] {
  const inside: Vertex[] = [], outside: Vertex[] = [];
  const distance = (p: Vertex) => p.position.reduce((sum, v, axis) => sum + v * plane.normal[axis], -plane.offset);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b);
    (da <= EPS ? inside : outside).push(a);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
      const t = da / (da - db), intersection = Object.fromEntries(Object.keys(a).map(key =>
        [key, a[key].map((v, axis) => v + (b[key][axis] - v) * t)]));
      inside.push(intersection); outside.push(intersection);
    }
  }
  return [inside, outside];
}

/** Subtract a convex volume from an already baked body, retaining every material/role attribute.
 * This opens the imported nose itself, rather than placing an opaque dark card over solid paint. */
export function subtractVehicleAperture(source: BufferGeometry, aperture: Aperture, minX: number, maxX: number) {
  const planes: Plane[] = [{ normal: [-1, 0, 0], offset: -minX }, { normal: [1, 0, 0], offset: maxX }];
  for (let i = 0; i < aperture.length; i++) {
    const [z, y] = aperture[i], [nz, ny] = aperture[(i + 1) % aperture.length];
    planes.push({ normal: [0, z - nz, ny - y], offset: (ny - y) * z + (z - nz) * y });
  }
  const attrs = Object.entries(source.attributes), arrays = Object.fromEntries(attrs.map(([key]) => [key, [] as number[]]));
  const count = source.index?.count ?? source.attributes.position.count;
  function emit(poly: Vertex[]) {
    for (let i = 1; i < poly.length - 1; i++) {
      const triangle = [poly[0], poly[i], poly[i + 1]];
      for (const vertex of triangle) for (const [key] of attrs) arrays[key].push(...vertex[key]);
    }
  }
  for (let i = 0; i < count; i += 3) {
    let pending: Vertex[] = [0, 1, 2].map(offset => {
      const index = source.index ? source.index.getX(i + offset) : i + offset;
      return Object.fromEntries(attrs.map(([key, attr]) => [key,
        Array.from({ length: attr.itemSize }, (_, axis) => attr.array[index * attr.itemSize + axis])]));
    });
    // Preserve an untouched triangle verbatim when any separating plane excludes it.
    if (planes.some(plane => pending.every(v => v.position.reduce((sum, p, axis) => sum + p * plane.normal[axis], -plane.offset) > EPS))) {
      emit(pending); continue;
    }
    for (const plane of planes) {
      if (!pending.length) break;
      const [inside, outside] = splitPolygon(pending, plane);
      emit(outside); pending = inside;
    }
  }
  const result = new BufferGeometry();
  for (const [key, attr] of attrs) result.setAttribute(key, new BufferAttribute(new Float32Array(arrays[key]), attr.itemSize));
  result.normalizeNormals(); result.computeBoundingSphere();
  return result;
}

function chamfered(z: number, y: number, width: number, height: number, bevel: number): Aperture {
  const a = z - width / 2, b = z + width / 2, c = y - height / 2, d = y + height / 2;
  return [[a + bevel, c], [b - bevel, c], [b, c + bevel], [b, d - bevel],
    [b - bevel, d], [a + bevel, d], [a, d - bevel], [a, c + bevel]];
}
export function coupeNoseX(z: number, y: number) {
  const sh = Math.max(0, Math.min(1, (Math.abs(z) / .95 - .85) / .15));
  const stations = [[2.12 - .05 * sh, .22], [2.17 - .05 * sh, .4],
    [2.12 - .05 * sh, .58 - .0175 * sh], [1.95, .70 - .035 * sh]];
  for (let i = 1; i < stations.length; i++) {
    const [a, b] = stations[i - 1], [c, d] = stations[i];
    if (y <= d) return a + (c - a) * Math.max(0, (y - b) / (d - b));
  }
  return 1.95;
}

/** Source-ground coordinates: GLB +X forward, +Y up, +Z right. No hull or axle changes. */
export function refineVehicleBody(id: VehicleId, source: BufferGeometry) {
  const group = new Group(), materials = new Map<keyof typeof PALETTE, MeshStandardMaterial>();
  let cut = source;
  function add(geometry: BufferGeometry, material: keyof typeof PALETTE, point: Point = [0, 0, 0]) {
    if (!materials.has(material)) {
      const [color, roughness, metalness, materialRole] = PALETTE[material];
      const m = new MeshStandardMaterial({ color: color as ColorRepresentation, roughness, metalness });
      m.userData.materialRole = materialRole; materials.set(material, m);
    }
    const mesh = new Mesh(geometry, materials.get(material)!); mesh.position.set(...point); group.add(mesh);
  }
  function box(point: Point, size: Point, material: keyof typeof PALETTE) { add(new BoxGeometry(...size), material, point); }
  function cylinder(point: Point, radius: number, depth: number, material: keyof typeof PALETTE, segments = 12) {
    add(new CylinderGeometry(radius, radius, depth, segments).rotateZ(Math.PI / 2), material, point);
  }
  function faces(vertices: Point[], indices: number[], material: keyof typeof PALETTE) {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices.flat()), 3));
    geometry.setIndex(indices.flatMap((_, i) => i % 3 === 0 ? [indices[i], indices[i + 2], indices[i + 1]] : []));
    geometry.computeVertexNormals(); add(geometry, material);
  }
  function recess(aperture: Aperture, surface: (z: number, y: number) => number, depth: number, bounds: [number, number], bars: number) {
    const next = subtractVehicleAperture(cut, aperture, ...bounds);
    if (cut !== source) cut.dispose(); cut = next;
    const center = aperture.reduce((p, v) => [p[0] + v[0] / aperture.length, p[1] + v[1] / aperture.length], [0, 0]);
    const back = aperture.map(([z, y]) => [surface(z, y) - depth, y, z] as Point);
    const front = aperture.map(([z, y]) => [surface(z, y) + .012, y, z] as Point);
    const outer = aperture.map(([z, y]) => [surface(z, y) + .014, y + (y - center[1]) * .12, z + (z - center[0]) * .07] as Point);
    const sides: number[] = [], rim: number[] = [], backFaces: number[] = [];
    for (let i = 0; i < aperture.length; i++) {
      const j = (i + 1) % aperture.length, n = aperture.length;
      sides.push(i, j, n + j, i, n + j, n + i);
      rim.push(i, n + j, j, i, n + i, n + j);
      if (i > 0 && i < n - 1) backFaces.push(0, i, i + 1);
    }
    faces([...front, ...back], sides, 'steel'); faces(back, backFaces, 'dark'); faces([...front, ...outer], rim, 'steel');
    const minY = Math.min(...aperture.map(p => p[1])), maxY = Math.max(...aperture.map(p => p[1]));
    const minZ = Math.min(...aperture.map(p => p[0])), maxZ = Math.max(...aperture.map(p => p[0]));
    for (let i = 0; i < bars; i++) {
      const y = minY + (maxY - minY) * (i + 1) / (bars + 1);
      box([surface(center[0], y) - .012, y, center[0]], [.024, .012, (maxZ - minZ) * .87], 'steel');
    }
  }
  if (id === 'coupe') {
    recess(chamfered(0, .376, .92, .225, .035), coupeNoseX, .09, [1.94, 2.3], 3);
    for (const s of [-1, 1]) {
      recess(chamfered(s * .685, .31, .28, .115, .025), coupeNoseX, .075, [2.0, 2.3], 1);
      const lamp: Aperture = [[.52, .565], [.84, .575], [.89, .605], [.8, .625], [.54, .605]];
      const polygon = s > 0 ? lamp : lamp.map(([z, y]) => [-z, y] as [number, number]).reverse();
      recess(polygon, coupeNoseX, .045, [1.94, 2.3], 0);
      for (const z of [s * .615, s * .765]) {
        const y = .593, x = coupeNoseX(z, y);
        cylinder([x + .006, y, z], .022, .016, 'metal');
        cylinder([x + .016, y, z], .0165, .008, 'lens');
        add(new SphereGeometry(.011, 10, 5).scale(.45, 1, 1), 'lamp', [x + .022, y, z]);
      }
      // Four small DRL cells sit within the upper lens housing, never outside the nose.
      for (let i = 0; i < 4; i++) {
        const z = s * (.575 + i * .055), y = .609 + i * .002;
        box([coupeNoseX(z, y) + .016, y, z], [.012, .006, .032], 'lamp');
      }
      const hoodHeight = (x: number) => x > 1.3 ? .70 + (x - 1.95) * (.78 - .70) / (1.3 - 1.95)
        : .78 + (x - 1.3) * (.82 - .78) / (.4 - 1.3);
      for (const [a, b] of [[.68, 1.3], [1.3, 1.84]]) {
        const geometry = new BoxGeometry(b - a, .003, .005);
        geometry.rotateZ(Math.atan2(hoodHeight(b) - hoodHeight(a), b - a));
        add(geometry, 'dark', [(a + b) / 2, (hoodHeight(a) + hoodHeight(b)) / 2 + .001, s * .615]);
      }
      // The blade meets the existing 45 mm splitter slab; these are small shaped end returns.
      box([2.125, .238, s * .865], [.17, .022, .03], 'steel');
      box([2.16, .249, s * .40], [.035, .042, .018], 'steel');
    }
    box([2.195, .215, 0], [.055, .024, 1.71], 'steel');
  } else if (id === 'offroad') {
    recess(chamfered(0, .885, .87, .315, .025), () => 1.805, .065, [1.70, 1.9], 4);
    for (const s of [-1, 1]) {
      for (const y of [.64, 1.05]) cylinder([1.825, y, s * .49], .012, .012, 'metal', 8);
      cylinder([1.839, .885, s * .625], .055, .012, 'lens', 16);
      cylinder([1.848, .885, s * .625], .028, .01, 'lamp', 12);
      box([1.843, .885, s * .625], [.01, .012, .15], 'metal');
    }
  } else {
    recess(chamfered(0, .932, .98, .18, .025), () => 2.25, .07, [2.15, 2.31], 3);
    for (const s of [-1, 1]) {
      cylinder([2.288, .93, s * .72], .055, .012, 'lens', 16);
      cylinder([2.297, .93, s * .72], .026, .008, 'lamp', 12);
      for (const y of [.37, .59]) cylinder([2.426, y, s * 1.025], .013, .012, 'metal', 8);
      box([2.424, .48, s * .83], [.014, .16, .045], 'dark');
    }
  }
  const details = bakeNode(group), merged = mergeGeometries([cut, details], false);
  if (!merged) throw new Error(`[world-vehicles] detail merge failed: ${id}`);
  merged.computeBoundingSphere(); merged.userData.detailTriangles = details.attributes.position.count / 3;
  merged.userData.sourceTriangles = source.attributes.position.count / 3;
  group.traverse(object => { if ((object as Mesh).isMesh) (object as Mesh).geometry.dispose(); });
  materials.forEach(m => m.dispose()); details.dispose(); if (cut !== source) cut.dispose();
  return merged;
}

/** Vented rotor is inside the coupe rim, behind its spokes, with twelve actual through-holes.
 * It is baked into the existing wheel instances, retaining their suspension and roll transforms. */
export function refineCoupeWheel(source: BufferGeometry) {
  const shape = new Shape(); shape.absarc(0, 0, .188, 0, Math.PI * 2, false);
  const hub = new Path(); hub.absarc(0, 0, .068, 0, Math.PI * 2, true); shape.holes.push(hub);
  for (let i = 0; i < 12; i++) {
    const angle = Math.PI * 2 * i / 12, hole = new Path();
    hole.absarc(Math.cos(angle) * .145, Math.sin(angle) * .145, .008, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  const geometry = new ExtrudeGeometry(shape, { depth: .009, bevelEnabled: false, curveSegments: 2 });
  geometry.translate(0, 0, -.095);
  const group = new Group(), material = new MeshStandardMaterial({ color: '#A3A7AA', roughness: .4, metalness: .55 });
  material.userData.materialRole = 'metal'; group.add(new Mesh(geometry, material));
  const rotor = bakeNode(group), result = mergeGeometries([source, rotor], false)!;
  result.computeBoundingSphere(); result.userData.detailTriangles = rotor.attributes.position.count / 3;
  geometry.dispose(); material.dispose(); rotor.dispose(); return result;
}

const exhaustMatrix = new Matrix4();
/** Four small unlit cone instances at the two authored exhaust outlets. No lights or particle loop. */
export function createVehicleBoostExhaust(bodyY: number) {
  const geometry = new CylinderGeometry(0, 1, 1, 8, 1, true).rotateZ(Math.PI / 2);
  const material = new MeshBasicMaterial({ transparent: true, opacity: .65, depthWrite: false,
    blending: AdditiveBlending, toneMapped: false });
  const mesh = new InstancedMesh(geometry, material, 4);
  for (let i = 0; i < 4; i++) mesh.setColorAt(i, new Color(i % 2 ? '#F3ECDC' : '#63BEB3'));
  mesh.name = 'vehicle-coupe-boost-exhaust'; mesh.visible = false;
  mesh.boundingSphere = new Sphere(new Vector3(-2.5, bodyY + .25, 0), .8);
  mesh.userData.noOcclusionFade = true; mesh.userData.bodyY = bodyY;
  return mesh;
}
export function updateVehicleBoostExhaust(mesh: InstancedMesh, boosting: boolean, elapsed: number) {
  mesh.visible = boosting;
  if (!boosting) return;
  for (let i = 0; i < 4; i++) {
    const core = i % 2 === 1, length = (core ? .22 : .39) * (1 + .12 * Math.sin(elapsed * 35 + (i >> 1) * 2));
    const radius = core ? .025 : .045;
    exhaustMatrix.makeScale(length, radius, radius);
    exhaustMatrix.setPosition(-2.205 - length / 2, mesh.userData.bodyY + .25, i < 2 ? -.36 : .36);
    mesh.setMatrixAt(i, exhaustMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
