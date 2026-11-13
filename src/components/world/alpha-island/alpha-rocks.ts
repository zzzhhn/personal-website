import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALPHA_CABLE_PATH, ALPHA_SLED_PATH, ALPHA_SOCKETS } from './alpha-layout.ts';
import { alphaHeight, alphaPathDistance, alphaRadial, alphaSurfaceNormalY, nearestAlphaSegment } from './alpha-terrain.ts';

type Position = [number, number, number];
export interface AlphaBoulderField {
  parts: { finish: 'stone'; geometry: BufferGeometry }[];
  colliders: { points: Float32Array }[];
  witnesses: { position: Position; supportHeights: number[]; slopeY: number }[];
}
const TAU = Math.PI * 2;
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
function random(seed: number) {
  let state = (seed ^ 0x57b98a35) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low-frequency weathered convex stone families: oval, sloping wedge, lobed
 * shoulder and taller leaning mass. Dense curved silhouette samples retain real
 * volume; one or two oblique side fractures supply restrained planar structure.
 * There is deliberately no horizontal top plane or repeated rectangular lid.
 */
function rockShape(seed: number) {
  const rnd = random(seed), samples: Vector3[] = [], family = seed % 4, phase = rnd() * TAU;
  const axisX = [1.12, 1.25, 1.05, .88][family] * (.93 + rnd() * .14);
  const axisZ = [.78, .66, .90, 1.0][family] * (.93 + rnd() * .14);
  const axisY = [.76, .60, .83, 1.06][family] * (.93 + rnd() * .14);
  const longitude = 24, latitude = 12;
  for (let ring = 0; ring <= latitude; ring++) {
    const polar = ring / latitude * Math.PI, y = Math.cos(polar), radial = Math.sin(polar);
    const count = ring === 0 || ring === latitude ? 1 : longitude;
    for (let corner = 0; corner < count; corner++) {
      const a = corner / longitude * TAU + Math.sin(polar * 2) * .035;
      const weathering = 1 + .075 * Math.sin(a * 2 + phase) * radial ** 2
        + .04 * Math.cos(a * 3 - phase) * radial ** 3 + .045 * y * Math.sin(a + phase);
      let x = Math.cos(a) * radial * axisX * weathering;
      let z = Math.sin(a) * radial * axisZ * weathering;
      let py = y * axisY * (1 + .09 * Math.cos(a + phase) * radial)
        + .12 * x - .08 * z + .09 * radial ** 2 * Math.sin(a + phase);
      if (family === 1) py += .22 * x;
      if (family === 2) {
        x += .13 * radial ** 2 * Math.cos(phase + y * 2);
        py += .13 * radial ** 2 * Math.cos(a - phase);
      }
      if (family === 3) { x += .13 * y; z -= .10 * y; }
      samples.push(v(x, py, z));
    }
  }
  for (let fracture = 0; fracture < 1 + seed % 2; fracture++) {
    const a = phase + fracture * 2.27;
    const normal = v(Math.cos(a), (fracture ? -1 : 1) * (.14 + rnd() * .30), Math.sin(a)).normalize();
    const extreme = Math.max(...samples.map(p => normal.dot(p))), distance = extreme - .11 - rnd() * .13;
    for (const p of samples) {
      const outside = normal.dot(p) - distance;
      if (outside > 0) p.addScaledVector(normal, -outside);
    }
  }
  const minY = Math.min(...samples.map(p => p.y)), maxY = Math.max(...samples.map(p => p.y));
  // The lower 22% of the rounded belly is embedded, rather than making a slab
  // base and burying almost the entire rock until only its flat top remains.
  return { samples, rimTop: minY + (maxY - minY) * .22 };
}

function socketDistance(x: number, z: number) {
  let distance = Infinity;
  for (const s of Object.values(ALPHA_SOCKETS)) {
    const dx = x - s.ground[0], dz = z - s.ground[2], c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    const rx = c * dx - sn * dz, rz = sn * dx + c * dz;
    distance = Math.min(distance, Math.hypot(Math.max(0, Math.abs(rx) - s.size[0] / 2),
      Math.max(0, Math.abs(rz) - s.size[2] / 2)));
  }
  return distance;
}

/** Local-island coordinates throughout; Alpha's group supplies its world origin.
 * Thirty-two individually supported rocks, never placed on steep cliff faces.
 * Caller owns the merged geometry and collider point arrays. No materials created.
 */
export function createAlphaBoulderField(): AlphaBoulderField {
  const geometries: BufferGeometry[] = [], colliders: AlphaBoulderField['colliders'] = [];
  const witnesses: AlphaBoulderField['witnesses'] = [];
  const occupied: { x: number; z: number; radius: number }[] = [];
  const rnd = random(20261113);
  for (let candidate = 0; candidate < 6000 && witnesses.length < 32; candidate++) {
    const a = candidate * 2.39996323, r = 8 + Math.sqrt((candidate + .5) / 6000) * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.10, radius = 1 + rnd() * 1.5;
    const height = alphaHeight(x, z);
    if (height < 1 || height > 60 || alphaRadial(x, z) > .94
      || alphaPathDistance(x, z) < 4.5 + radius || socketDistance(x, z) < 9 + radius
      || nearestAlphaSegment(x, z, ALPHA_CABLE_PATH).distance < 5 + radius
      || nearestAlphaSegment(x, z, ALPHA_SLED_PATH).distance < 4 + radius
      || occupied.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius + 1.2)) continue;
    const supportHeights = [height];
    let slopeY = alphaSurfaceNormalY(x, z), clear = slopeY >= .96;
    for (let edge = 0; edge < 8; edge++) {
      const angle = edge / 8 * TAU, sx = x + Math.cos(angle) * radius, sz = z + Math.sin(angle) * radius;
      const h = alphaHeight(sx, sz);
      supportHeights.push(h);
      slopeY = Math.min(slopeY, alphaSurfaceNormalY(sx, sz));
      if (h < 1 || h > 60 || alphaPathDistance(sx, sz) < 4.5 || socketDistance(sx, sz) < 9) clear = false;
    }
    const minSupport = Math.min(...supportHeights), maxSupport = Math.max(...supportHeights);
    if (!clear || slopeY < .94 || maxSupport - minSupport > Math.min(.90, radius * .50)) continue;

    const { samples, rimTop: shapeRimTop } = rockShape(candidate + 801), yaw = rnd() * TAU;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const horizontalExtent = Math.max(...samples.map(p => Math.hypot(p.x, p.z)));
    const horizontalScale = radius / horizontalExtent, verticalScale = radius * .85;
    for (const p of samples) {
      const px = p.x * horizontalScale, pz = p.z * horizontalScale;
      p.set(x + c * px - sn * pz, p.y * verticalScale, z + sn * px + c * pz);
    }
    // Check the actual lower rim as well as the nine footprint witnesses. Bury
    // the ENTIRE weathered lower edge at least 25cm below its lowest support;
    // a centre-only placement would let the downhill side hang over empty air.
    const rimTop = shapeRimTop * verticalScale;
    let rimSupport = minSupport;
    for (const p of samples) if (p.y <= rimTop + 1e-6) rimSupport = Math.min(rimSupport, alphaHeight(p.x, p.z));
    const datum = rimSupport - .25 - rimTop;
    for (const p of samples) p.y += datum;
    const hull = new ConvexGeometry(samples);
    const geometry = toCreasedNormals(hull, .43);
    if (geometry !== hull) hull.dispose();
    const positions = geometry.getAttribute('position'), faceNormals = new Vector3();
    const uv = new Float32Array(positions.count * 2), color = new Float32Array(positions.count * 3).fill(1);
    for (let i = 0; i < positions.count; i += 3) {
      const p = new Vector3().fromBufferAttribute(positions, i), b = new Vector3().fromBufferAttribute(positions, i + 1);
      const d = new Vector3().fromBufferAttribute(positions, i + 2);
      faceNormals.crossVectors(b.sub(p), d.sub(p)).normalize();
      const ax = Math.abs(faceNormals.x), ay = Math.abs(faceNormals.y), az = Math.abs(faceNormals.z);
      for (let j = i; j < i + 3; j++) {
        const px = positions.getX(j), py = positions.getY(j), pz = positions.getZ(j);
        uv[j * 2] = (ay >= ax && ay >= az ? px : ax > az ? pz : px) / 2;
        uv[j * 2 + 1] = (ay >= ax && ay >= az ? pz : py) / 2;
      }
    }
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(color, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.push(geometry);
    // Already transformed LOCAL island coordinates: no second instance transform.
    colliders.push({ points: new Float32Array(positions.array) });
    witnesses.push({ position: [x, height, z], supportHeights, slopeY });
    occupied.push({ x, z, radius });
  }
  if (!geometries.length) return { parts: [], colliders, witnesses };
  const geometry = mergeGeometries(geometries, false);
  for (const part of geometries) part.dispose();
  if (!geometry) throw new Error('Alpha boulders must have compatible geometry attributes');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { parts: [{ finish: 'stone', geometry }], colliders, witnesses };
}
