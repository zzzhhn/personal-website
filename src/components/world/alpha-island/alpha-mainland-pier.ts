import { Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AlphaBuilder, type AlphaFinish } from './alpha-art';
import { meshHeight } from '../WorldLandform';
import { castStaticSurface, type StaticSurface } from '../static-surface-asset';
import type { Vec3 } from '../types';

export const alphaPierDecks = [
  { p: [-10, 1.04, 88.25] as Vec3, size: [2.8, .2, 36.5] as Vec3 },
  { p: [-10, 1.04, 112] as Vec3, size: [7, .2, 11] as Vec3 },
];

const plankSpacing = .39, plankDepth = .365;
const decks = alphaPierDecks.map(({ p, size }) => {
  const centers: number[] = [];
  for (let dz = -size[2]/2 + .2; dz < size[2]/2; dz += plankSpacing) centers.push(p[2] + dz);
  // Keep route import cheap. The survey and render builder share this unplaced plank.
  let template: (StaticSurface & { geometry: RoundedBoxGeometry }) | undefined;
  const plank = () => template ??= {
    id: 'plank', space: 'plank-local', role: 'floor', collision: 'solid', reason: 'Walkable timber tread',
    geometry: new RoundedBoxGeometry(size[0], size[1], plankDepth, 2, .025),
  };
  return { p, size, centers, plank };
});

/** A vertical point query can miss in the slot between two boards or touch a bevel. */
export function alphaPierDeckHeight(x: number, z: number) {
  let highest: number | null = null;
  for (const { p, size, centers, plank } of decks) {
    if (Math.abs(x - p[0]) > size[0]/2) continue;
    const index = Math.round((z - centers[0])/plankSpacing);
    if (index < 0 || index >= centers.length || Math.abs(z - centers[index]) > plankDepth/2) continue;
    const hit = castStaticSurface([plank()], x - p[0], size[1], z - centers[index], -1, size[1]*2);
    if (hit) highest = Math.max(highest ?? -Infinity, p[1] + hit.height);
  }
  return highest;
}

type PierRole = 'floor' | 'enclosure';
export interface PierPiece {
  id: string;
  role: PierRole;
  finish: AlphaFinish;
  collision: 'solid';
  position: Vec3;
  quaternion: [number, number, number, number];
  args: [number, number, number, number];
  firstVertex: number;
  vertexCount: number;
}

export function alphaMainlandPierStructure(groundHeight: typeof meshHeight = meshHeight) {
  const builder = new AlphaBuilder(), pieces: PierPiece[] = [];
  const verticesByFinish = new Map<AlphaFinish, number>();

  function add(id: string, role: PierRole, finish: AlphaFinish, geometry: RoundedBoxGeometry,
    position: Vec3, rotation = new Quaternion()) {
    // Three stores the actual clamped bevel on the primitive. Its external dimensions
    // include the bevel; Rapier takes the core half-extents plus the bevel separately.
    const radius = (geometry.parameters as {radius?: number}).radius;
    if (radius === undefined || !Number.isFinite(radius)) throw new Error('Missing pier bevel: '+id);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new Vector3());
    const firstVertex = verticesByFinish.get(finish) ?? 0;
    const vertexCount = geometry.getAttribute('position').count;
    pieces.push({ id:'mainland-pier/'+id, role, finish, collision:'solid', position,
      quaternion:rotation.toArray(), args:[size.x/2-radius, size.y/2-radius, size.z/2-radius, radius],
      firstVertex, vertexCount });
    verticesByFinish.set(finish, firstVertex + vertexCount);
    builder.add(geometry, finish, position, rotation);
  }

  function beam(id: string, finish: AlphaFinish, a: Vec3, b: Vec3, width: number) {
    const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
    const geometry = new RoundedBoxGeometry(width, delta.length(), width, 2, Math.min(.018, width/4));
    add(id, 'enclosure', finish, geometry, start.add(end).multiplyScalar(.5).toArray(),
      new Quaternion().setFromUnitVectors(new Vector3(0,1,0), delta.normalize()));
  }

  for (const [deckIndex, deck] of decks.entries()) {
    const { p:[x,y,z], size:[width,,length], centers, plank } = deck;
    for (const [i,center] of centers.entries())
      add(deckIndex+'/plank/'+i, 'floor', 'wood', plank().geometry.clone(), [x,y,center]);
    for (let i=0, dz=-length/2+.3; dz<=length/2; i++,dz+=3.8) {
      for (const side of [-1,1]) {
        const px=x + side*(width/2-.2), pz=z+dz, id=deckIndex+'/'+side+'/'+i;
        const bottom=Math.min(.85, groundHeight(px,pz) ?? -4)-.18;
        beam(id+'/post', 'darkwood', [px,bottom,pz], [px,2.15,pz], .16);
        add(id+'/collar', 'enclosure', 'metal', new RoundedBoxGeometry(.2,.08,.2,2,.01), [px,1.05,pz]);
      }
    }
    for (const side of [-1,1]) {
      // The wide platform's west opening faces the ferry's starboard door.
      const ranges = width > 3 && side < 0 ? [[-length/2,-.7],[2,length/2]] : [[-length/2,length/2]];
      const px=x+side*(width/2-.12);
      for (const [i,[a,b]] of ranges.entries()) {
        const id=deckIndex+'/'+side+'/'+i;
        beam(id+'/handrail', 'wood', [px,2.07,z+a], [px,2.07,z+b], .085);
        beam(id+'/rope', 'rope', [px,1.59,z+a], [px,1.59,z+b], .035);
      }
    }
  }
  const parts = builder.finish().map(part => {
    if (part.geometry.getAttribute('position').count !== verticesByFinish.get(part.finish))
      throw new Error('Unclassified mainland pier geometry: '+part.finish);
    return { ...part, sources:pieces.filter(p=>p.finish===part.finish) };
  });
  return { parts, pieces };
}
