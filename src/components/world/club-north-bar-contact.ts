import { BufferGeometry, Float32BufferAttribute } from 'three';
import { DJC_BAR_STOOLS } from './djc-bar-layout';
import stool from './club-north-bar-stool-contact.generated.json';

export const DJC_NORTH_BAR_CONTACT='djc-north-bar-contact';
export const djcBarStructureSupply=(kind:'surface'|'solid',fallback=false)=>`${DJC_NORTH_BAR_CONTACT}-${fallback?'fallback':'structure'}-${kind}`;
export const djcBarStoolSupply=(i:number)=>`djc-bar-stool-${i}`;

export type ContactShape={vertices:Float32Array;indices:Uint32Array};
/** Shared pose and silhouette for all four stools, independent of either art LOD. */
export function buildClubBarStoolContact() {
  const vertices = Float32Array.from(stool.vertices, n => n*stool.scale);
  const indices = Uint32Array.from(stool.indices);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices,3));
  geometry.setIndex(stool.indices);
  geometry.computeVertexNormals();
  return { geometry, vertices, indices, placements: DJC_BAR_STOOLS.map(({ center }) => [center[0],0,center[2]] as [number,number,number]) };
}
