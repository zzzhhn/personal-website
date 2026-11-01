import type { Vector3 } from 'three';

type Cell = { x: number; y: number; z: number; offsets: number[] };
const CELL_SIZE = 4;
const finite = (p: Vector3) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Immutable point snapshot. Grid cells only reject distant points; the narrow
 * phase preserves the support scanner's distance formula and strict threshold. */
export class PointClearanceIndex {
  private readonly points: Float64Array;
  private readonly cells = new Map<string, Cell>();

  constructor(points: readonly Vector3[]) {
    this.points = new Float64Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!finite(p)) throw new RangeError('Clearance points must have finite coordinates');
      const offset = i * 3;
      this.points[offset] = p.x; this.points[offset + 1] = p.y; this.points[offset + 2] = p.z;
      const x = Math.floor(p.x / CELL_SIZE), y = Math.floor(p.y / CELL_SIZE), z = Math.floor(p.z / CELL_SIZE);
      const key = `${x},${y},${z}`;
      let cell = this.cells.get(key);
      if (!cell) { cell = { x, y, z, offsets: [] }; this.cells.set(key, cell); }
      cell.offsets.push(offset);
    }
  }

  blocksSegment(a: Vector3, b: Vector3, radius: number): boolean {
    if (!finite(a) || !finite(b)) throw new RangeError('Clearance segment must have finite coordinates');
    if (!this.cells.size || !(radius > 0)) return false;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    // Preserve the existing scanner's tiny/zero-length denominator, too.
    const denominator = Math.max(1e-9, dx * dx + dy * dy + dz * dz);
    const minX = Math.floor((Math.min(a.x, b.x) - radius) / CELL_SIZE);
    const maxX = Math.floor((Math.max(a.x, b.x) + radius) / CELL_SIZE);
    const minY = Math.floor((Math.min(a.y, b.y) - radius) / CELL_SIZE);
    const maxY = Math.floor((Math.max(a.y, b.y) + radius) / CELL_SIZE);
    const minZ = Math.floor((Math.min(a.z, b.z) - radius) / CELL_SIZE);
    const maxZ = Math.floor((Math.max(a.z, b.z) + radius) / CELL_SIZE);
    const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    if (volume > this.cells.size) {
      // Bound broad-phase work by occupied cells, including unbounded radius.
      for (const cell of this.cells.values()) {
        if (cell.x < minX || cell.x > maxX || cell.y < minY || cell.y > maxY || cell.z < minZ || cell.z > maxZ) continue;
        if (this.blocksCell(cell, a, dx, dy, dz, denominator, radius)) return true;
      }
    } else {
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
        const cell = this.cells.get(`${x},${y},${z}`);
        if (cell && this.blocksCell(cell, a, dx, dy, dz, denominator, radius)) return true;
      }
    }
    return false;
  }

  private blocksCell(cell: Cell, a: Vector3, dx: number, dy: number, dz: number, denominator: number, radius: number) {
    for (const i of cell.offsets) {
      const x = this.points[i] - a.x, y = this.points[i + 1] - a.y, z = this.points[i + 2] - a.z;
      const t = Math.max(0, Math.min(1, (x * dx + y * dy + z * dz) / denominator));
      if (Math.hypot(x - dx * t, y - dy * t, z - dz * t) < radius) return true;
    }
    return false;
  }
}
