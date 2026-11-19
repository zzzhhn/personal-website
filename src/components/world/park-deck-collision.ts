import { Vector3, type BufferGeometry } from 'three';

/** Geometry is already baked into world coordinates. Every triangle belongs
 * to exactly one physical surface, including edges and the underside. */
export function parkDeckCollision(geometry: BufferGeometry, root: string) {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const floor: number[] = [], wall: number[] = [];
  const point = new Vector3(), edge = new Vector3(), other = new Vector3();
  const count = index?.count ?? positions.count;
  for (let i = 0; i < count; i += 3) {
    const a = index?.getX(i) ?? i;
    const b = index?.getX(i + 1) ?? i + 1;
    const c = index?.getX(i + 2) ?? i + 2;
    point.fromBufferAttribute(positions, a);
    edge.fromBufferAttribute(positions, b).sub(point);
    other.fromBufferAttribute(positions, c).sub(point);
    const normalY = edge.cross(other).normalize().y;
    (normalY > .64 ? floor : wall).push(a, b, c);
  }
  return {
    deckPolicy: { worldCollision: 'solid', worldCollisionPartitions: { floor: root + '/treads', wall: root + '/edges' } },
    deckVertices: positions.array as Float32Array,
    floor: Uint32Array.from(floor),
    wall: Uint32Array.from(wall),
  };
}

export function parkWalkCollision(deck: BufferGeometry, solid: BufferGeometry, root: string) {
  const positions = solid.getAttribute('position');
  const shellId = root + '/structure';
  const shellIndices = solid.index ? Uint32Array.from(solid.index.array)
    : Uint32Array.from({length: positions.count}, (_, index) => index);
  return { ...parkDeckCollision(deck, root), shellId, shellIndices,
    shellVertices: positions.array as Float32Array,
    shellPolicy: { worldCollision: 'solid', surfaceId: shellId, worldCollisionSharedSurface: true } };
}
