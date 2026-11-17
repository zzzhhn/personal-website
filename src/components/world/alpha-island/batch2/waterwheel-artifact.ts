import type { BufferGeometry } from 'three';
import type { AlphaFinish } from '../alpha-art';
import { decodeStaticSurfaces, encodeStaticSurfaces, type StaticSurface } from '../../static-surface-asset';

export const WATERWHEEL_GROUPS = ['frame', 'wheel', 'panel', 'crank', 'stems', 'petals', 'floor', 'drain'] as const;
export type WaterwheelGroup = typeof WATERWHEEL_GROUPS[number];
export type WaterwheelPart = StaticSurface & { finish: AlphaFinish };
export type WaterwheelArt = Record<WaterwheelGroup, WaterwheelPart[]>;
const finishes: Record<WaterwheelGroup, readonly AlphaFinish[]> = {
  frame:['stone','darkwood','metal','wood'],wheel:['metal','darkwood','wood'],
  panel:['darkwood','metal'],crank:['metal','darkwood'],stems:['leafplate'],petals:['paper','metal'],floor:['stone'],drain:['stone'],
};
const policy = (group:WaterwheelGroup) => group==='frame'
  ? {collision:'solid',role:'enclosure',reason:'Fixed visible stone, timber, iron and drain structure'} as const
  : group==='floor'
    ? {collision:'solid',role:'floor',reason:'Visible wet passage floor; collider uses these same triangles'} as const
    : group==='drain'
      ? {collision:'soft',role:'decoration',reason:'Stone trim stands 1 cm above continuous visible wet floor; bevels are not walkable slopes'} as const
      : {collision:'none',role:'decoration',reason:group==='wheel'||group==='panel'||group==='crank'
      ? 'Articulated visual; existing fixed moving-part exclusion guards are separately owned'
      : 'Small nonblocking cliff vegetation'} as const;
const space = (group:WaterwheelGroup) => ['frame','drain','stems','petals'].includes(group)
  ? 'alpha-waterwheel/station' : `alpha-waterwheel/${group}`;
export function classifyWaterwheelParts(group:WaterwheelGroup, parts:{finish:AlphaFinish;geometry:BufferGeometry}[]):WaterwheelPart[] {
  return parts.map(p=>({...p,id:`alpha-waterwheel/${group}/${p.finish}`,space:space(group),...policy(group)}));
}
export function encodeWaterwheelArtifact(art:WaterwheelArt) {
  return encodeStaticSurfaces(WATERWHEEL_GROUPS.flatMap(group=>art[group]),{region:'alpha-waterwheel'});
}
export function decodeWaterwheelArtifact(buffer:ArrayBuffer):WaterwheelArt {
  const {surfaces,metadata}=decodeStaticSurfaces(buffer);
  const fail=():never=>{surfaces.forEach(p=>p.geometry.dispose());throw new Error('Invalid waterwheel surface artifact');};
  if((metadata as {region?:string})?.region!=='alpha-waterwheel')fail();
  const art=Object.fromEntries(WATERWHEEL_GROUPS.map(g=>[g,[]])) as unknown as WaterwheelArt;
  for(const p of surfaces) {
    const [region,key,finish,extra]=p.id.split('/'),group=key as WaterwheelGroup;
    if(region!=='alpha-waterwheel'||extra||!WATERWHEEL_GROUPS.includes(group)||!finishes[group].includes(finish as AlphaFinish))fail();
    const expected=policy(group);
    if(p.collision!==expected.collision||p.role!==expected.role||p.space!==space(group))fail();
    if(['position','normal','uv'].some(a=>!p.geometry.getAttribute(a)))fail();
    if(group!=='floor'&&!p.geometry.getAttribute('color'))fail();
    if(['wood','darkwood'].includes(finish)&&!p.geometry.getAttribute('alphaEnd'))fail();
    art[group].push({...p,finish:finish as AlphaFinish});
  }
  if(WATERWHEEL_GROUPS.some(g=>art[g].length!==finishes[g].length))fail();
  return art;
}
let installed:WaterwheelArt|null=null;
export function installWaterwheelArtifact(art:WaterwheelArt){installed=art;}
export function requireWaterwheelArtifact():WaterwheelArt {
  if(!installed)throw new Error('Built waterwheel surfaces must be loaded before the world runtime');
  return Object.fromEntries(WATERWHEEL_GROUPS.map(g=>[g,installed![g].map(p=>({...p,geometry:p.geometry.clone()}))])) as WaterwheelArt;
}
