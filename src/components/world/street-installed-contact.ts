import type { BufferGeometry } from 'three';
import type { Builder } from './WorldStreetGeometry';
import type { BatchedCollisionSources } from './world-collision-inventory';

type Ranges = BatchedCollisionSources['geometries'][number]['ranges'];
const markings = /(^|[.-])(poster|bolts?|band|reflectors?)([.-]|$)/;

/** The glazing split retains vertex IDs and face order. Both submeshes can
 * therefore address their own index ranges against the original drawn parts. */
export function installedStreetContact(builder: Builder, rendered: BufferGeometry, member: string) {
  const source = rendered.index!.array;
  const ranges: Array<Ranges[number]> = [], indices: number[] = [];
  let firstIndex = 0;
  for (const [i, part] of builder.parts.entries()) {
    const end = part.end < 0 ? builder.pos.length / 3 : part.end;
    let nextIndex = firstIndex;
    while (nextIndex < source.length && source[nextIndex] < end) nextIndex += 3;
    if (nextIndex === firstIndex) continue;
    if (source[firstIndex] < part.start) throw new Error(`Unassigned street vertices before ${part.name}`);
    const decor = markings.test(part.name);
    ranges.push({ id: `${part.name}-${i}`, firstIndex, indexCount: nextIndex - firstIndex,
      collision: decor ? 'none' : 'solid', surfaceIds: decor ? undefined : [member] });
    if (!decor) for (let offset = firstIndex; offset < nextIndex; offset++) indices.push(source[offset]);
    firstIndex = nextIndex;
  }
  if (firstIndex !== source.length || indices.length === 0) throw new Error(`Incomplete installed street surface ${member}`);
  return { member, ranges, indices: new Uint32Array(indices) };
}
