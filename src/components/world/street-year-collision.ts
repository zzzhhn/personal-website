import { streetBuilderRanges } from './street-builder-ranges';
import type { Builder } from './WorldStreetGeometry';

/** Every emitted triangle belongs to the current part. A near/far pair names
 * the same dynamic hull, with one instance and dated atlas cell per placement. */
export function yearPillarSources(builder: Builder, id: string, lod: 0 | 1) {
  return streetBuilderRanges(builder).map(part => ({
    id: `${id}/lod${lod}/${part.name}`, firstIndex: part.firstIndex, indexCount: part.indexCount,
    collision: part.collide ? 'pushable' : 'none',
    surfaceId: part.collide ? `street-collider-${id}/${part.name}` : undefined,
  }));
}
