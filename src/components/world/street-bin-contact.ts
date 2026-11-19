import type { Builder } from './WorldStreetGeometry';
import { connectedStreetMembers } from './street-reachable-contact';

/** The bin's painted drum and lid are hollow. A convex hull over a whole ring
 * closes the visible mouth, so use short angular sections of the drawn shell. */
export function hollowStreetBinContacts(builder: Builder) {
  if (!builder.parts.some(part => part.name === 'mouth.inner-baffle')) return null;
  const drum = Array.from({ length: 8 }, () => [] as number[]);
  const cover = Array.from({ length: 12 }, () => [] as number[]);
  const liner = Array.from({ length: 8 }, () => [] as number[]);
  const floor: number[] = [], baffle: number[] = [];
  const attached = builder.parts.flatMap(part => {
    const end = part.end < 0 ? builder.pos.length / 3 : part.end;
    if (part.name === 'lid.hinge' || part.name.startsWith('base.')) {
      return connectedStreetMembers(builder, part.name, part.start, end);
    }
    const isLiner = part.name.startsWith('mouth.inner-liner') || part.name === 'mouth.inner-baffle';
    const shell = part.name === 'drum' ? drum : isLiner ? liner : cover;
    for (let i = 0; i < builder.idx.length; i += 3) {
      const indices = builder.idx.slice(i, i + 3);
      if (indices[0] < part.start || indices[0] >= end) continue;
      const points = indices.map(index => builder.pos.slice(index * 3, index * 3 + 3));
      // The two manufactured plates include their short cylindrical rims.
      if (part.name === 'drum' && points.every(([,y]) => y >= .0999 && y <= .1151)) {
        floor.push(...points.flat()); continue;
      }
      if (part.name === 'mouth.inner-baffle' && points.every(([,y]) => y < .80)) {
        baffle.push(...points.flat()); continue;
      }
      const angle = Math.atan2(points.reduce((z,p) => z + p[2], 0), points.reduce((x,p) => x + p[0], 0));
      const sector = Math.min(shell.length - 1, Math.floor((angle + Math.PI) * shell.length / (Math.PI * 2)));
      shell[sector].push(...points.flat());
    }
    return [];
  });
  return [
    ...attached.filter(part => part.id.startsWith('base.')),
    { id: 'drum/floor', points: new Float32Array(floor) },
    ...drum.map((points, i) => ({ id: `drum/${i}`, points: new Float32Array(points) })),
    ...cover.map((points, i) => ({ id: `lid/${i}`, points: new Float32Array(points) })),
    ...liner.map((points, i) => ({ id: `mouth-liner/${i}`, points: new Float32Array(points) })),
    { id: 'mouth.inner-baffle/floor', points: new Float32Array(baffle) },
    ...attached.filter(part => part.id.startsWith('lid.')),
  ];
}
