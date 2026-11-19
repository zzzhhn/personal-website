import type { Builder } from './WorldStreetGeometry';

/** Every emitted triangle belongs to the current part. A near/far pair names
 * the same dynamic hull, with one instance and dated atlas cell per placement. */
export function yearPillarSources(builder: Builder, id: string, lod: 0 | 1) {
  let firstIndex = 0;
  return builder.parts.flatMap(part => {
    const endVertex = part.end < 0 ? builder.pos.length / 3 : part.end;
    let nextIndex = firstIndex;
    while (nextIndex < builder.idx.length && builder.idx[nextIndex] < endVertex) nextIndex += 3;
    if (nextIndex === firstIndex) return [];
    const source = { id: `${id}/lod${lod}/${part.name}`, firstIndex, indexCount: nextIndex - firstIndex,
      collision: part.collide ? 'pushable' : 'none',
      surfaceId: part.collide ? `street-collider-${id}/${part.name}` : undefined };
    firstIndex = nextIndex;
    return [source];
  });
}
