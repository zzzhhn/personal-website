import { Vector3, type BufferGeometry, type Matrix4, type Mesh } from 'three';

type Cascade = 0 | 1 | 2;
export type ShadowChunkBucket = {
  side: number; cascade: Cascade; data: [number[], number[]]; zones: Map<string, number>;
};

/** Source replacement must invalidate even when the mesh and its transform are unchanged. */
export function shadowChunkSourceKey(mesh: Mesh, transformChecksum: number) {
  const geometry = (mesh.userData.shadowGeometry as BufferGeometry | undefined) ?? mesh.geometry;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return `${mesh.uuid}:${transformChecksum}:${mesh.geometry.uuid}:${geometry.uuid}:${material.side}`;
}

/** Rebuild-local scratch only. Preserves legacy bucket/triangle insertion order and Float32 rounding. */
export class ShadowChunkBuilder {
  readonly buckets = new Map<string, ShadowChunkBucket>();
  private planes = new Map<string, Map<number, Map<number, ShadowChunkBucket>>>();
  private point = new Vector3();
  constructor(private cells: readonly [number, number, number], private right: Vector3, private up: Vector3) {}

  add(geometry: BufferGeometry, matrix: Matrix4, cascades: readonly Cascade[], side: number, zone: string) {
    const position = geometry.getAttribute('position'), index = geometry.index;
    const world = new Float32Array(position.count * 3), point = this.point;
    // c0/c1 (and c2 when no hull is used) share this transform. No temporary xyz arrays.
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      world[i * 3] = point.x; world[i * 3 + 1] = point.y; world[i * 3 + 2] = point.z;
    }
    const count = index ? index.count : position.count;
    for (const cascade of cascades) {
      const planeKey = `${cascade}:${side}`, cell = this.cells[cascade];
      let rows = this.planes.get(planeKey);
      if (!rows) { rows = new Map(); this.planes.set(planeKey, rows); }
      let lastR = NaN, lastU = NaN, lastBucket: ShadowChunkBucket | undefined;
      for (let i = 0; i + 2 < count; i += 3) {
        const a = (index ? index.getX(i) : i) * 3;
        const b = (index ? index.getX(i + 1) : i + 1) * 3;
        const c = (index ? index.getX(i + 2) : i + 2) * 3;
        // Keep the original average-then-dot arithmetic, including cell-edge rounding.
        point.set((world[a] + world[b] + world[c]) / 3,
          (world[a + 1] + world[b + 1] + world[c + 1]) / 3,
          (world[a + 2] + world[b + 2] + world[c + 2]) / 3);
        const r = Math.floor(point.dot(this.right) / cell), u = Math.floor(point.dot(this.up) / cell);
        let bucket = lastBucket;
        if (!bucket || r !== lastR || u !== lastU) {
          let columns = rows.get(r);
          if (!columns) { columns = new Map(); rows.set(r, columns); }
          bucket = columns.get(u);
          if (!bucket) {
            bucket = { side, cascade, data: [[], []], zones: new Map() };
            columns.set(u, bucket);
            // A string key is needed once per bucket, rather than once per triangle.
            this.buckets.set(`${cascade}:${r},${u},${side}`, bucket);
          }
          lastR = r; lastU = u; lastBucket = bucket;
        }
        const [points, indices] = bucket.data, base = points.length / 3;
        points.push(world[a], world[a + 1], world[a + 2], world[b], world[b + 1], world[b + 2], world[c], world[c + 1], world[c + 2]);
        indices.push(base, base + 1, base + 2);
        bucket.zones.set(zone, (bucket.zones.get(zone) ?? 0) + 3);
      }
    }
  }
}
