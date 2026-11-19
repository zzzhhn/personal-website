import type { Builder } from './WorldStreetGeometry';

/** The street builder appends each part's vertices and indices together. A part
 * can omit all geometry in a distant LOD. Addresses are local to that LOD. */
export function streetBuilderRanges(builder: Builder) {
  let firstIndex = 0;
  return builder.parts.flatMap(part => {
    const endVertex = part.end < 0 ? builder.pos.length / 3 : part.end;
    let nextIndex = firstIndex;
    while (nextIndex < builder.idx.length && builder.idx[nextIndex] < endVertex) nextIndex += 3;
    if (nextIndex === firstIndex) return [];
    const range = {name: part.name, collide: part.collide, firstIndex, indexCount: nextIndex - firstIndex};
    firstIndex = nextIndex;
    return [range];
  });
}
