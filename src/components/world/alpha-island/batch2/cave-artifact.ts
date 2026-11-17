import type { BufferGeometry } from 'three';
import type { AlphaFinish } from '../alpha-art';
import type { Vec3 } from '../../types';
import { decodeStaticSurfaces, encodeStaticSurfaces, type StaticSurface } from '../../static-surface-asset';

export type CavePart = StaticSurface & { finish: AlphaFinish };
export const CAVE_PART_GROUPS = ['solid', 'floor', 'detail', 'seams', 'rack', 'scaffold', 'lamp', 'mural', 'chime0', 'chime1', 'chime2'] as const;
type PartGroup = typeof CAVE_PART_GROUPS[number];
export interface CaveArt extends Record<PartGroup, CavePart[]> {
  muralPosition: Vec3; muralYaw: number;
  rackPosition: Vec3; scaffoldPosition: Vec3; scaffoldYaw: number;
}
const groups = CAVE_PART_GROUPS;
const chimePolicy = { collision: 'none', role: 'decoration', reason: 'Suspended chime animates when struck; interaction does not require body collision' } as const;
const policies = {
  solid: { collision: 'solid', role: 'enclosure', reason: 'Structural rock shell and buried floor foundation' },
  floor: { collision: 'solid', role: 'floor', reason: 'Walkable cave floor, independent of the island terrain below' },
  detail: { collision: 'none', role: 'decoration', reason: 'Small edge gravel, moss and mineral bedding do not obstruct visitors' },
  seams: { collision: 'none', role: 'decoration', reason: 'Thin ceiling seams are visual accents inside the structural shell' },
  rack: { collision: 'solid', role: 'enclosure', reason: 'Fixed lamp rack including the visible base, post, braces and hook' },
  scaffold: { collision: 'solid', role: 'enclosure', reason: 'Fixed chime frame including visible feet, beams, braces and fittings' },
  lamp: { collision: 'none', role: 'decoration', reason: 'Held or racked lamp visual; character and fixed rack supply physical blocking' },
  mural: { collision: 'none', role: 'decoration', reason: 'Thin relief supported by the solid cave wall behind it' },
  chime0: chimePolicy, chime1: chimePolicy, chime2: chimePolicy,
} as const;
function policyFor(group: PartGroup, finish: string) {
  return group === 'scaffold' && finish === 'rope'
    ? { collision: 'none', role: 'decoration', reason: 'Short suspension cords follow the fixed frame without obstructing visitors' } as const
    : policies[group];
}
function spaceFor(group: PartGroup) { return ['solid', 'floor', 'detail', 'seams'].includes(group) ? 'alpha-island' : `alpha-cave/${group}`; }
export function classifyCaveParts(group: PartGroup, parts: { finish: AlphaFinish; geometry: BufferGeometry }[]): CavePart[] {
  return parts.map(p => ({ ...p, id: `alpha-cave/${group}/${p.finish}`, space: spaceFor(group), ...policyFor(group, p.finish) }));
}
export function encodeCaveArtifact(art: CaveArt) {
  return encodeStaticSurfaces(groups.flatMap(group => art[group]), { region: 'alpha-cave', muralPosition: art.muralPosition, muralYaw: art.muralYaw, rackPosition: art.rackPosition, scaffoldPosition: art.scaffoldPosition, scaffoldYaw: art.scaffoldYaw });
}
export function decodeCaveArtifact(buffer: ArrayBuffer): CaveArt {
  const { surfaces, metadata } = decodeStaticSurfaces(buffer), m = metadata as Partial<CaveArt> & { region?: string };
  const fail = (): never => { surfaces.forEach(s => s.geometry.dispose()); throw new Error('Invalid cave surface artifact'); };
  const vec = (p: unknown) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  if (!m || m.region !== 'alpha-cave' || !vec(m.muralPosition) || !vec(m.rackPosition) || !vec(m.scaffoldPosition) || !Number.isFinite(m.muralYaw) || !Number.isFinite(m.scaffoldYaw)) fail();
  const art = { ...Object.fromEntries(groups.map(key => [key, []])), muralPosition: m.muralPosition!, muralYaw: m.muralYaw!, rackPosition: m.rackPosition!, scaffoldPosition: m.scaffoldPosition!, scaffoldYaw: m.scaffoldYaw! } as CaveArt;
  for (const surface of surfaces) {
    const [region, group, finish, extra] = surface.id.split('/');
    if (region !== 'alpha-cave' || !groups.includes(group as PartGroup) || extra || !['stone', 'roof', 'leafplate', 'metal', 'wood', 'darkwood', 'rope', 'glass'].includes(finish)) fail();
    const key = group as PartGroup, policy = policyFor(key, finish);
    if (surface.collision !== policy.collision || surface.role !== policy.role || surface.space !== spaceFor(key)) fail();
    if (['position', 'normal', 'uv', 'color'].some(name => !surface.geometry.getAttribute(name))) fail();
    art[key].push({ ...surface, finish: finish as AlphaFinish });
  }
  if (groups.some(key => art[key].length === 0)) fail();
  return art;
}
let installed: CaveArt | null = null;
export function installCaveArtifact(art: CaveArt) { installed = art; }
export function requireCaveParts(group: PartGroup): CavePart[] {
  if (!installed) throw new Error('Built cave surfaces must be loaded before the world runtime');
  return installed[group].map(p => ({ ...p, geometry: p.geometry.clone() }));
}
/** Each mounted scene owns/disposes its geometries; keep the decoded source
 * intact across remounts rather than regenerating procedural cave geometry. */
export function requireCaveArtifact(): CaveArt {
  if (!installed) throw new Error('Built cave surfaces must be loaded before the world runtime');
  return {
    ...installed, muralPosition: [...installed.muralPosition], rackPosition: [...installed.rackPosition], scaffoldPosition: [...installed.scaffoldPosition],
    ...Object.fromEntries(groups.map(key => [key, requireCaveParts(key)])),
  };
}
