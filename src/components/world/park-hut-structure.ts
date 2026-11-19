import type { Object3D } from 'three';
import { parkDeckCollision } from './park-deck-collision';
import type { Vec3 } from './types';
import { gltfPieces, mergeBatch, ParkGeo, plankDeck } from './WorldParkKit';
import { DECK_Y, HUT_BACK_Z, HUT_FRONT_Z, type HutPlacement } from './WorldParkLayout';
import { hutLOD } from './WorldParkLOD';

/** The same baked world-space triangles drive the close visible model and its
 * three fixed shapes. The far silhouette refers to those same permanent shapes. */
export function buildParkHut(visualRoot:Object3D, h:HutPlacement, index:number) {
  const root = 'park-hut-structure-' + h.id, shellId = root + '/shell';
  const parts = gltfPieces(visualRoot,h.matrix,name=>!name.startsWith('floor'));
  const floorParts = gltfPieces(visualRoot,h.matrix,name=>name.startsWith('floor'));
  const shellTriangles: number[] = [];
  let firstVertex = 0;
  const sources = parts.map((part,i)=>{
    const vertexCount = part.getAttribute('position').count;
    const isGlow = part.name.startsWith('glow');
    if (!isGlow && !/^(shell|piles|lamp)/.test(part.name)) throw new Error('Unknown park hut part ' + part.name);
    const source = {id:root+'/'+part.name+'/'+i, firstVertex,vertexCount,
      collision:isGlow?'none':'solid',surfaceId:isGlow?undefined:shellId};
    if (!isGlow) for (let j=0;j<vertexCount;j++) shellTriangles.push(firstVertex+j);
    firstVertex += vertexCount;
    return source;
  });
  if (h.spur) {
    const spurs = new ParkGeo(), {from,to,width} = h.spur;
    plankDeck(spurs,from,to,width,100+index);
    const length = Math.hypot(to[0]-from[0],to[2]-from[2]);
    if (length>2.2) for (const x of [-width/2+.16,width/2-.16]) {
      const point = h.local(x,0,HUT_FRONT_Z+length*.5);
      spurs.cyl([point[0],-2.6,point[2]],[point[0],DECK_Y-.26,point[2]],.12,.11,8,'#8E6E55');
    }
    floorParts.push(...spurs.pieces);
  }
  const solid = mergeBatch(parts), deck = mergeBatch(floorParts), positions=deck.getAttribute('position');
  const center:Vec3=h.local(0,1,(HUT_FRONT_Z+HUT_BACK_Z)/2);
  return {id:h.id,root,shellId,center,solid,deck,sources,...parkDeckCollision(deck,root),low:hutLOD(h),
    triangles:(firstVertex+positions.count)/3,shellVertices:solid.attributes.position.array as Float32Array,
    shellIndices:Uint32Array.from(shellTriangles)};
}
