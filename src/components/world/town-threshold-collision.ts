import { BufferGeometry } from 'three';

const tolerance = .002;

/** The authored floor hull locates the slab within the combined stone material.
 * Its own below-ground extent and squared bevels do not supply collision. */
export function townThresholdCollision(geometry: BufferGeometry, authoredHull: Float32Array, groundY: number) {
  const positions = geometry.attributes.position, index = geometry.index;
  const limits = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity, top: -Infinity };
  for (let i = 0; i < authoredHull.length; i += 3) {
    limits.minX = Math.min(limits.minX, authoredHull[i]); limits.maxX = Math.max(limits.maxX, authoredHull[i]);
    limits.minZ = Math.min(limits.minZ, authoredHull[i + 2]); limits.maxZ = Math.max(limits.maxZ, authoredHull[i + 2]);
    limits.top = Math.max(limits.top, authoredHull[i + 1]);
  }
  const vertices = new Set<number>(), ranges: { first: number; count: number }[] = [];
  const length = index?.count ?? positions.count;
  for (let i = 0; i < length; i += 3) {
    const ids = [index?.getX(i) ?? i, index?.getX(i + 1) ?? i + 1, index?.getX(i + 2) ?? i + 2];
    if (!ids.every(id => {
      const x = positions.getX(id), y = positions.getY(id), z = positions.getZ(id);
      return x >= limits.minX - tolerance && x <= limits.maxX + tolerance
        && z >= limits.minZ - tolerance && z <= limits.maxZ + tolerance
        && y >= groundY - tolerance && y <= limits.top + tolerance;
    })) continue;
    ids.forEach(id => vertices.add(id));
    const last = ranges.at(-1);
    if (last && last.first + last.count === i) last.count += 3;
    else ranges.push({ first: i, count: 3 });
  }
  const points = Float32Array.from([...vertices].flatMap(id => [positions.getX(id), positions.getY(id), positions.getZ(id)]));
  if (points.length < 12 || !points.some((value, i) => i % 3 === 1 && Math.abs(value - limits.top) <= tolerance))
    throw new Error('Town threshold is missing its rendered stone slab');
  return { points, ranges };
}

/** Keep the stable convex slab for footsteps. Use the other stone triangles for
 * the facade, and never register the same triangle in both collision shapes. */
export function splitTownThreshold(geometry: BufferGeometry, hull: Float32Array, groundY: number) {
  const slab = townThresholdCollision(geometry, hull, groundY);
  const index = geometry.index;
  const length = index?.count ?? geometry.attributes.position.count;
  const facadeIndices: number[] = [];
  const ranges: {first: number; count: number; slab: boolean}[] = [];
  let cursor = 0;
  function append(first: number, count: number, isSlab: boolean) {
    if (!count) return;
    ranges.push({first, count, slab: isSlab});
    if (!isSlab) for (let i = first; i < first + count; i++) facadeIndices.push(index?.getX(i) ?? i);
  }
  for (const range of slab.ranges) {
    append(cursor, range.first - cursor, false);
    append(range.first, range.count, true);
    cursor = range.first + range.count;
  }
  append(cursor, length - cursor, false);
  const facade = new BufferGeometry().setAttribute('position', geometry.attributes.position).setIndex(facadeIndices);
  return {points: slab.points, facade, ranges};
}
