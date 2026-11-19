import type { BufferGeometry } from 'three';
import type { AlphaFinish } from '../alpha-art';
import { decodeStaticSurfaces, encodeStaticSurfaces, type StaticSurface } from '../../static-surface-asset';

export const WATERWHEEL_GROUPS = ['frame', 'wheel', 'panel', 'crank', 'stems', 'petals', 'floor', 'drain'] as const;
export type WaterwheelGroup = typeof WATERWHEEL_GROUPS[number];
export interface WaterwheelFrameSource { id: string; firstVertex: number; vertexCount: number; collision: 'solid'; surfaceId: string }
export type WaterwheelPart = StaticSurface & { finish: AlphaFinish; sources?: readonly WaterwheelFrameSource[] };
export type WaterwheelArt = Record<WaterwheelGroup, WaterwheelPart[]>;
const finishes: Record<WaterwheelGroup, readonly AlphaFinish[]> = {
  frame:['stone','darkwood','metal','wood'],wheel:['metal','darkwood','wood'],
  panel:['darkwood','metal'],crank:['metal','darkwood'],stems:['leafplate'],petals:['paper','metal'],floor:['stone'],drain:['stone'],
};
const policy = {
  frame: {collision:'solid',role:'enclosure',reason:'Fixed stone, timber and iron structural pieces'},
  floor: {collision:'solid',role:'floor',reason:'Visible wet passage bearing surface'},
  wheel: {collision:'solid',role:'enclosure',reason:'Turning wheel, axle and open buckets follow their visible pivot'},
  panel: {collision:'solid',role:'enclosure',reason:'Gate leaves lift with their visible boards and straps'},
  drain: {collision:'none',role:'decoration',reason:'A centimetre of bevelled stone trim overlaps the continuous walking floor'},
  crank: {collision:'none',role:'decoration',reason:'A hand-operated handle on an already solid gate frame'},
  stems: {collision:'none',role:'decoration',reason:'Small cliff flower stems'},
  petals: {collision:'none',role:'decoration',reason:'Small cliff flowers and their centres'},
} as const satisfies Record<WaterwheelGroup, Pick<StaticSurface, 'collision' | 'role' | 'reason'>>;
const space = (group:WaterwheelGroup) => ['frame','drain','stems','petals'].includes(group)
  ? 'alpha-waterwheel/station' : `alpha-waterwheel/${group}`;
export function classifyWaterwheelParts(group:WaterwheelGroup, parts:{finish:AlphaFinish;geometry:BufferGeometry}[],
  frameSources?: ReadonlyMap<AlphaFinish, readonly WaterwheelFrameSource[]>):WaterwheelPart[] {
  return parts.map(p=>({...p,id:`alpha-waterwheel/${group}/${p.finish}`,space:space(group),...policy[group],
    ...(group==='frame' ? {sources:frameSources?.get(p.finish)} : {})}));
}
export function encodeWaterwheelArtifact(art:WaterwheelArt) {
  return encodeStaticSurfaces(WATERWHEEL_GROUPS.flatMap(group=>art[group]),{
    region:'alpha-waterwheel', frameSources:Object.fromEntries(art.frame.map(p=>[p.id,p.sources])),
  });
}
export function decodeWaterwheelArtifact(buffer:ArrayBuffer):WaterwheelArt {
  const {surfaces,metadata}=decodeStaticSurfaces(buffer);
  const fail=():never=>{surfaces.forEach(p=>p.geometry.dispose());throw new Error('Invalid waterwheel surface artifact');};
  const header = metadata as {region?:string;frameSources?: Record<string, unknown>} | null;
  if(header?.region!=='alpha-waterwheel'||!header.frameSources)fail();
  const frameSources = header!.frameSources!;
  const art=Object.fromEntries(WATERWHEEL_GROUPS.map(g=>[g,[]])) as unknown as WaterwheelArt;
  for(const p of surfaces) {
    const [region,key,finish,extra]=p.id.split('/'),group=key as WaterwheelGroup;
    if(region!=='alpha-waterwheel'||extra||!WATERWHEEL_GROUPS.includes(group)||!finishes[group].includes(finish as AlphaFinish))fail();
    const expected=policy[group];
    if(p.collision!==expected.collision||p.role!==expected.role||p.space!==space(group))fail();
    if(['position','normal','uv'].some(a=>!p.geometry.getAttribute(a)))fail();
    if(group!=='floor'&&!p.geometry.getAttribute('color'))fail();
    if(['wood','darkwood'].includes(finish)&&!p.geometry.getAttribute('alphaEnd'))fail();
    const part: WaterwheelPart = {...p,finish:finish as AlphaFinish};
    if (group === 'frame') {
      const ranges = frameSources[p.id];
      if (!Array.isArray(ranges) || !ranges.length || p.geometry.index) fail();
      const ids = new Set<string>();
      let end = 0;
      for (const range of ranges as WaterwheelFrameSource[]) {
        if (typeof range?.id !== 'string' || !range.id.startsWith(p.id + '/') || ids.has(range.id)
          || range.firstVertex !== end || !Number.isSafeInteger(range.vertexCount) || range.vertexCount <= 0 || range.vertexCount % 3
          || range.collision !== 'solid' || range.surfaceId !== p.id) fail();
        ids.add(range.id);
        end += range.vertexCount;
      }
      if (end !== p.geometry.getAttribute('position').count) fail();
      part.sources = ranges as WaterwheelFrameSource[];
    }
    art[group].push(part);
  }
  if(WATERWHEEL_GROUPS.some(g=>art[g].length!==finishes[g].length) || Object.keys(frameSources).length !== art.frame.length)fail();
  return art;
}
let installed:WaterwheelArt|null=null;
export function installWaterwheelArtifact(art:WaterwheelArt){installed=art;}
export function requireWaterwheelArtifact():WaterwheelArt {
  if(!installed)throw new Error('Built waterwheel surfaces must be loaded before the world runtime');
  return Object.fromEntries(WATERWHEEL_GROUPS.map(g=>[g,installed![g].map(p=>({...p,geometry:p.geometry.clone()}))])) as WaterwheelArt;
}
