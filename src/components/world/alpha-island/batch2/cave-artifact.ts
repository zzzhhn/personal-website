import type { BufferGeometry } from 'three';
import type { AlphaFinish } from '../alpha-art';
import type { Vec3 } from '../../types';
import { decodeStaticSurfaces, encodeStaticSurfaces, type StaticSurface } from '../../static-surface-asset';

export type CavePart = StaticSurface & { finish: AlphaFinish };
export interface CaveArt {
  solid: CavePart[]; floor: CavePart[]; detail: CavePart[]; seams: CavePart[];
  muralPosition: Vec3; muralYaw: number;
}
const groups = ['solid', 'floor', 'detail', 'seams'] as const;
type PartGroup = typeof groups[number];
const policies = {
  solid: { collision: 'solid', role: 'enclosure', reason: 'Structural rock shell and buried floor foundation' },
  floor: { collision: 'solid', role: 'floor', reason: 'Walkable cave floor, independent of the island terrain below' },
  detail: { collision: 'none', role: 'decoration', reason: 'Small edge gravel, moss and mineral bedding do not obstruct visitors' },
  seams: { collision: 'none', role: 'decoration', reason: 'Thin ceiling seams are visual accents inside the structural shell' },
} as const;
export function classifyCaveParts(group: PartGroup, parts: { finish: AlphaFinish; geometry: BufferGeometry }[]): CavePart[] {
  return parts.map(p => ({ ...p, id: `alpha-cave/${group}/${p.finish}`, ...policies[group] }));
}
export function encodeCaveArtifact(art: CaveArt) {
  return encodeStaticSurfaces(groups.flatMap(group => art[group]), { region: 'alpha-cave', muralPosition: art.muralPosition, muralYaw: art.muralYaw });
}
export function decodeCaveArtifact(buffer: ArrayBuffer): CaveArt {
  const { surfaces, metadata } = decodeStaticSurfaces(buffer), m = metadata as Partial<CaveArt> & { region?: string };
  const fail = (): never => { surfaces.forEach(s => s.geometry.dispose()); throw new Error('Invalid cave surface artifact'); };
  if (!m || m.region !== 'alpha-cave' || !Array.isArray(m.muralPosition) || m.muralPosition.length !== 3 || !m.muralPosition.every(Number.isFinite) || !Number.isFinite(m.muralYaw)) fail();
  const art = { solid: [], floor: [], detail: [], seams: [], muralPosition: m.muralPosition!, muralYaw: m.muralYaw! } as CaveArt;
  for (const surface of surfaces) {
    const [region, group, finish, extra] = surface.id.split('/');
    if (region !== 'alpha-cave' || !groups.includes(group as PartGroup) || extra || !['stone', 'roof', 'leafplate', 'metal'].includes(finish)) fail();
    const key = group as PartGroup, policy = policies[key];
    if (surface.collision !== policy.collision || surface.role !== policy.role) fail();
    if (['position', 'normal', 'uv', 'color'].some(name => !surface.geometry.getAttribute(name))) fail();
    art[key].push({ ...surface, finish: finish as AlphaFinish });
  }
  if (groups.some(key => art[key].length === 0)) fail();
  return art;
}
let installed: CaveArt | null = null;
export function installCaveArtifact(art: CaveArt) { installed = art; }
/** Each mounted scene owns/disposes its geometries; keep the decoded source
 * intact across remounts rather than regenerating procedural cave geometry. */
export function requireCaveArtifact(): CaveArt {
  if (!installed) throw new Error('Built cave surfaces must be loaded before the world runtime');
  return {
    ...installed, muralPosition: [...installed.muralPosition],
    ...Object.fromEntries(groups.map(key => [key, installed![key].map(p => ({ ...p, geometry: p.geometry.clone() }))])),
  };
}
