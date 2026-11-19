import { Vector3 } from 'three';
import type { Builder } from './WorldStreetGeometry';
import { streetFacilityCollision } from './WorldStreetFacilityCraft';

type StreetReachableKind = 'lamp' | 'signal' | 'bin';
type Member = { id: string; points: Float32Array };
const parts = {
  lamp: { replace: ['base', 'shaft'], visible: ['base', 'shaft', 'base.anchor-sleeve', 'hatch'] },
  signal: { replace: ['base', 'shaft', 'near-head'], visible: ['base', 'shaft', 'hatch', 'near-head', 'near-head.folded-side-rails', 'mount.pole-brackets'] },
  bin: { replace: ['drum'], visible: ['drum', 'base.rolled-shoe', 'base.contact-pad'] },
};

function hasVolume(points: readonly number[]) {
  if (points.length < 12) return false;
  const origin = new Vector3().fromArray(points), line = new Vector3().fromArray(points, 3).sub(origin);
  const offset = new Vector3(), normal = new Vector3();
  for (let i = 6; i < points.length; i += 3) {
    normal.crossVectors(line, offset.fromArray(points, i).sub(origin));
    if (normal.lengthSq() > 1e-16) break;
  }
  for (let i = 6; i < points.length; i += 3) {
    if (Math.abs(normal.dot(offset.fromArray(points, i).sub(origin))) > 1e-9) return true;
  }
  return false;
}

/** Reconnect triangle seams by their real positions. Sharing an isolated point
 * does not join a sleeve, cap, or visor to the next component. */
export function connectedStreetMembers(builder: Builder, name: string, start: number, end: number): Member[] {
  const points: number[][] = [], welded = new Map<string, number>(), edges = new Map<string, number>();
  const parents: number[] = [], triangles: number[][] = [];
  function root(index: number): number {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  }
  for (let i = 0; i < builder.idx.length; i += 3) {
    const indices = builder.idx.slice(i, i + 3);
    if (indices.some(value => value < start || value >= end)) continue;
    const corners = indices.map(value => {
      const p = builder.pos.slice(value * 3, value * 3 + 3);
      const key = p.map(component => Math.round(component * 1e6)).join(',');
      const previous = welded.get(key);
      if (previous !== undefined) return previous;
      const id = points.length; points.push(p); welded.set(key, id); return id;
    });
    if (new Set(corners).size !== 3) continue;
    const face = triangles.length; triangles.push(corners); parents.push(face);
    for (let edge = 0; edge < 3; edge++) {
      const a = corners[edge], b = corners[(edge + 1) % 3];
      const key = a < b ? `${a}/${b}` : `${b}/${a}`;
      const other = edges.get(key);
      if (other === undefined) edges.set(key, face);
      else parents[root(face)] = root(other);
    }
  }
  const components = new Map<number, Set<number>>();
  triangles.forEach((corners, index) => {
    const id = root(index);
    let vertices = components.get(id);
    if (!vertices) { vertices = new Set(); components.set(id, vertices); }
    corners.forEach(corner => vertices.add(corner));
  });
  return [...components.values()].flatMap((vertices, i) => {
    const coords = [...vertices].flatMap(vertex => points[vertex]);
    return hasVolume(coords) ? [{ id: `${name}/${i}`, points: new Float32Array(coords) }] : [];
  });
}

export function streetReachableContacts(builder: Builder, kind: StreetReachableKind): Member[] {
  const { replace, visible } = parts[kind];
  const local = builder.parts.filter(part => visible.includes(part.name)).flatMap(part =>
    connectedStreetMembers(builder, part.name, part.start, part.end < 0 ? builder.pos.length / 3 : part.end));
  const proxy = streetFacilityCollision(builder);
  const unchanged = proxy.parts.filter(part => part.collide && !replace.includes(part.name)).flatMap(part => {
    const points = proxy.pos.slice(part.start * 3, part.end < 0 ? undefined : part.end * 3);
    return points.length >= 12 ? [{ id: part.name, points: new Float32Array(points) }] : [];
  });
  if (!local.length) throw new Error(`${kind} has no reachable contact geometry`);
  return [...local, ...unchanged];
}
