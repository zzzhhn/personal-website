import { BufferGeometry, Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Vec3 } from '../types';
import { AlphaBuilder, type AlphaFinish } from './alpha-art';

type Role = 'floor' | 'enclosure' | 'decoration';
type RoundBox = [number, number, number, number];

/** Rapier expands the core half-extents by the bevel on every side. */
export function roundedColliderArgs(geometry: RoundedBoxGeometry): RoundBox {
  const radius = (geometry.parameters as { radius?: number }).radius;
  if (radius === undefined || !Number.isFinite(radius)) throw new Error('Missing structural bevel');
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new Vector3());
  return [size.x / 2 - radius, size.y / 2 - radius, size.z / 2 - radius, radius];
}

export interface AlphaStructurePiece {
  id: string;
  role: Role;
  collision: 'solid' | 'none';
  firstVertex: number;
  vertexCount: number;
  position: Vec3;
  quaternion: [number, number, number, number];
  args: RoundBox | null;
}

/** Capture each primitive before AlphaBuilder transforms it and merges its material batch. */
export class AlphaStructureBuilder extends AlphaBuilder {
  private section?: {name: string; role: Role};
  private readonly sources = new Map<AlphaFinish, AlphaStructurePiece[]>();

  constructor(private readonly asset: string) { super(); }

  select(name: string, role: Role) { this.section = { name, role }; }

  override add(geometry: BufferGeometry, finish: AlphaFinish, position: Vec3 = [0, 0, 0],
    rotation = new Quaternion(), scale: Vec3 = [1, 1, 1]) {
    if (!this.section) throw new Error('Unclassified structure in ' + this.asset);
    const { name, role } = this.section;
    const sources = this.sources.get(finish) ?? [];
    const previous = sources.at(-1);
    const id = [this.asset, name, finish, sources.length].join('/');
    let args: RoundBox | null = null;
    if (role !== 'decoration') {
      if (!(geometry instanceof RoundedBoxGeometry) || scale.some(n => n !== 1))
        throw new Error('Missing structural shape for ' + id);
      args = roundedColliderArgs(geometry);
    }
    sources.push({ id, role, collision: args ? 'solid' : 'none', args, position,
      quaternion: rotation.toArray(), firstVertex: previous ? previous.firstVertex + previous.vertexCount : 0,
      vertexCount: geometry.index?.count ?? geometry.getAttribute('position').count });
    this.sources.set(finish, sources);
    super.add(geometry, finish, position, rotation, scale);
  }

  override finish() {
    return super.finish().map(part => {
      const sources = this.sources.get(part.finish)!;
      const last = sources.at(-1)!;
      if (last.firstVertex + last.vertexCount !== part.geometry.getAttribute('position').count)
        throw new Error('Unowned structure vertices in ' + this.asset + '/' + part.finish);
      return { ...part, sources };
    });
  }
}
