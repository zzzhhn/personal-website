import type { Builder, V3 } from './WorldStreetGeometry';

type RoadblockContact = { id: string; points: Float32Array };
type RoadblockRange = { id: string; firstIndex: number; indexCount: number; member?: string };
const records = new WeakMap<Builder, { parts: RoadblockContact[]; ranges: RoadblockRange[] }>();

function record(builder: Builder) {
  let data = records.get(builder);
  if (!data) { data = { parts: [], ranges: [] }; records.set(builder, data); }
  return data;
}

export function roadblockSurface(builder: Builder, id: string, draw: () => void, member?: string) {
  const firstIndex = builder.idx.length;
  draw();
  const indexCount = builder.idx.length - firstIndex;
  if (indexCount) record(builder).ranges.push({ id, firstIndex, indexCount, member });
}

/** The actual drawn supports and panels supply independent convex members. */
export function roadblockMember(builder: Builder, id: string, draw: () => void) {
  const start = builder.pos.length;
  roadblockSurface(builder, id, draw, id);
  record(builder).parts.push({ id, points: new Float32Array(builder.pos.slice(start)) });
}

/** Consecutive rings are the exact shared vertices of a bent leg segment. */
export function roadblockLegSegment(builder: Builder, id: string, lower: V3[], upper: V3[], draw: () => void) {
  roadblockSurface(builder, id, draw, id);
  record(builder).parts.push({ id, points: new Float32Array([...lower, ...upper].flat()) });
}

export function retainRoadblockPanels(builder: Builder, original: Builder) {
  const old = record(original), next = record(builder);
  const panels = old.ranges.filter(range => range.id.startsWith('panel-'));
  const firstIndex = panels[0].firstIndex;
  const retainedIndexCount = panels.reduce((sum, range) => sum + range.indexCount, 0);
  const target = builder.idx.length - retainedIndexCount;
  next.parts.push(...old.parts.filter(member => member.id.startsWith('panel-')));
  next.ranges.push(...panels.map(range => ({ ...range, firstIndex: range.firstIndex - firstIndex + target })));
}

export function roadblockContacts(builder: Builder) {
  const parts = records.get(builder)?.parts;
  if (!parts?.length) throw new Error('Roadblock has no contact members');
  return parts;
}

export function roadblockSources(visual: Builder, shapeSource: Builder) {
  const members = roadblockContacts(shapeSource).map(part => part.id);
  return record(visual).ranges.map(({ id, firstIndex, indexCount, member }) => {
    if (!member) return { id, firstIndex, indexCount, collision: 'none' as const };
    // The distant, straight leg stands in for the three real bent sections.
    const surfaceIds = members.includes(member) ? [member] : members.filter(part => part.startsWith(member + '/'));
    if (!surfaceIds.length) throw new Error(`Roadblock range ${id} has no contact member`);
    return { id, firstIndex, indexCount, collision: 'pushable' as const, surfaceIds };
  });
}
