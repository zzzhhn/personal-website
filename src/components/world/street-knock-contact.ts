import type { Builder } from './WorldStreetGeometry';
import { streetBuilderRanges } from './street-builder-ranges';
import { connectedStreetMembers, streetReachableContacts } from './street-reachable-contact';
import { hollowStreetBinContacts } from './street-bin-contact';

export type StreetKnockContactKind = 'lamp' | 'signal' | 'bin' | 'stop' | 'direction' | 'chevron' | 'delineator' | 'beam' | 'guard';

export function streetKnockContacts(builder: Builder, kind: StreetKnockContactKind) {
  if (kind === 'bin') return hollowStreetBinContacts(builder) ?? streetReachableContacts(builder, kind);
  if (kind === 'lamp' || kind === 'signal') return streetReachableContacts(builder, kind);
  return builder.parts.flatMap(part => {
    const end = part.end < 0 ? builder.pos.length / 3 : part.end;
    if (kind === 'beam') {
      return part.name === 'beam' || part.name === 'beam.long-grain'
        ? [{ id: 'beam', points: Float32Array.from(builder.pos.slice(part.start * 3, end * 3)) }] : [];
    }
    return part.collide ? connectedStreetMembers(builder, part.name, part.start, end) : [];
  });
}

/** LODs keep the same physical members when tiny fittings have no distant
 * mesh. The lamp/signal/bin use the established detailed reachable contact. */
export function streetKnockSources(builder: Builder, kind: StreetKnockContactKind, members: readonly string[]) {
  const under = (name: string) => members.filter(id => id === name || id.startsWith(name + '/'));
  return streetBuilderRanges(builder).map(({ name, firstIndex, indexCount }, i) => {
    let surfaceIds = under(name);
    if (kind === 'beam' && name === 'beam.long-grain') surfaceIds = under('beam');
    if (kind === 'lamp' && name === 'base') surfaceIds = [...surfaceIds, ...under('base.anchor-sleeve')];
    if (kind === 'signal' && name === 'head') surfaceIds = [...surfaceIds, ...under('near-head'), ...under('near-head.folded-side-rails'), ...under('mount.pole-brackets')];
    if (kind === 'bin' && name === 'drum') surfaceIds = [...surfaceIds, ...under('base.rolled-shoe'), ...under('base.contact-pad')];
    if (kind === 'bin' && name !== 'lid.hinge' && (name.startsWith('lid.') || name.startsWith('mouth.') || name.startsWith('neck.'))) {
      const liners = under('mouth-liner');
      if (name.startsWith('mouth.inner-')) surfaceIds = [...surfaceIds, ...liners];
      else surfaceIds = under('lid');
    }
    if (kind === 'bin' && name === 'lid') surfaceIds = [...surfaceIds, ...under('mouth.inner-baffle'), ...under('mouth-liner'), ...under('lid.hinge')];
    return { id: `${name}-${i}`, firstIndex, indexCount, collision: surfaceIds.length ? 'pushable' as const : 'none' as const,
      surfaceIds: surfaceIds.length ? surfaceIds : undefined };
  });
}
