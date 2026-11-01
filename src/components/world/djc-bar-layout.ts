import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, type Object3D, type Texture } from 'three';

type V3 = [number, number, number];
export const DJC_BAR_ORIGIN: V3 = [40.75, 1.2, 40];
export const DJC_BAR_ASSETS = {
  near: '/assets/world/club/bar/djc-north-bar-v1.glb',
  far: '/assets/world/club/bar/djc-north-bar-lod1-v1.glb',
};
export const DJC_BAR_STOOLS = [-3.55, -1.25, 1.05, 3.35].map(x => ({
  center: [x, .735, .25] as V3, radius: .325, top: .77,
}));
/** Y-up, local to the exported GLB. These proxies never change with visual LOD. */
export const DJC_BAR_BOXES: { name: string; center: V3; size: V3; color: string }[] = [
  { name: 'deck', center: [0, -.11, 0], size: [10.55, .22, 4.55], color: '#a77749' },
  { name: 'counter', center: [0, .51, -1.24], size: [8.85, 1.02, .68], color: '#735035' },
  { name: 'countertop', center: [0, 1.105, -1.175], size: [9, .11, .85], color: '#c7b89b' },
  { name: 'backbar', center: [0, .47, -1.91], size: [9.5, .94, .42], color: '#735035' },
  { name: 'backbar-top', center: [0, .985, -1.9], size: [9, .08, .51], color: '#c7b89b' },
  ...[-4.75, 4.75].flatMap(x => [-1.8, 1.8].map(z => ({ name: 'post', center: [x, 1.9, z] as V3, size: [.28, 3.8, .28] as V3, color: '#a77749' }))),
  ...DJC_BAR_STOOLS.map(s => ({ name: 'stool', center: [s.center[0], .385, s.center[2]] as V3, size: [.65, .77, .65] as V3, color: '#a77749' })),
  ...[[-5.05, 1.1], [5.05, -.8]].map(([x, z]) => ({ name: 'planter', center: [x, .26, z] as V3, size: [.56, .52, .56] as V3, color: '#c7b89b' })),
];
const deck = DJC_BAR_BOXES[0];
export const DJC_BAR_DANCE_JOIN = {
  minX: DJC_BAR_ORIGIN[0] - deck.size[0] / 2,
  z: DJC_BAR_ORIGIN[2] + deck.size[2] / 2,
  y: DJC_BAR_ORIGIN[1] + deck.center[1] + deck.size[1] / 2,
};
export function djcBarWorld(point: V3): V3 { return point.map((v, i) => v + DJC_BAR_ORIGIN[i]) as V3; }
export function djcBarLod(distance: number, previous: 'near' | 'far') {
  // Four metres of hysteresis prevents repeated mounts at the near-detail boundary.
  return distance < (previous === 'near' ? 30 : 26) ? 'near' : 'far';
}
export function djcBarQaOpaque(search: string) {
  const q = new URLSearchParams(search);
  return q.get('qa') === '1' && q.get('djcBarTransmission') === '0';
}
export function djcBarQaMode(search: string): 'legacy' | 'near' | 'far' | 'auto' {
  const q = new URLSearchParams(search), mode = q.get('djcBar');
  return q.get('qa') === '1' && (mode === 'legacy' || mode === 'near' || mode === 'far') ? mode : 'auto';
}
/** Registry is local to one bar mount. Textures remain owned by useLoader's cache. */
export function shareDjcBarTexture(texture: Texture, imageUri: string | undefined, registry: Map<string, Texture>) {
  if (!imageUri || imageUri.startsWith('data:')) return texture;
  const key = JSON.stringify([imageUri, texture.colorSpace, texture.channel, texture.flipY, texture.wrapS, texture.wrapT,
    texture.minFilter, texture.magFilter, texture.anisotropy, texture.offset.toArray(), texture.repeat.toArray(), texture.rotation, texture.center.toArray()]);
  if (!registry.has(key)) registry.set(key, texture);
  return registry.get(key)!;
}
export function buildDjcBarProxy() {
  const surface: number[] = [], solid: number[] = [];
  for (const box of DJC_BAR_BOXES) {
    const indexed = new BoxGeometry(...box.size), g = indexed.toNonIndexed(); indexed.dispose(); g.translate(...box.center);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i += 3) {
      const out = n.getY(i) > .7 ? surface : solid;
      for (let j = 0; j < 3; j++) out.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
    }
    g.dispose();
  }
  // Closed pitched roof envelope: underside guards block upward camera rays too.
  const roof: number[] = [];
  for (const side of [-1, 1]) {
    const a: V3 = [-5.9, 4.58, 0], b: V3 = [5.9, 4.58, 0];
    const c: V3 = [5.9, 3.35, side * 3.08], d: V3 = [-5.9, 3.35, side * 3.08];
    const quad = (p: V3, q: V3, r: V3, s: V3) => roof.push(...p, ...q, ...r, ...p, ...r, ...s);
    const down = (p: V3): V3 => [p[0], p[1] - .12, p[2]];
    if (side > 0) { quad(d, c, b, a); quad(down(a), down(b), down(c), down(d)); }
    else { quad(a, b, c, d); quad(down(d), down(c), down(b), down(a)); }
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) quad(p, down(p), down(q), q);
  }
  solid.push(...roof);
  const geometry = (points: number[]) => {
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(points, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  };
  const data = (points: number[]) => ({ vertices: new Float32Array(points), indices: Uint32Array.from({ length: points.length / 3 }, (_, i) => i) });
  return { surface: data(surface), solid: data(solid), roof: geometry(roof) };
}
/** Keep loader-owned textures and geometries shared; only private material copies are released. */
export function cloneDjcBarVisual(source: Object3D, opaque: boolean, environment: Texture | null, textureFor: (texture: Texture) => Texture = texture => texture) {
  const root = source.clone(true), materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const copy = (original: MeshStandardMaterial) => {
      if (!materials.has(original)) {
        const m = original.clone(); m.envMap = environment; m.envMapIntensity = .35;
        // External images shared by both GLBs must become the same Texture object
        // before first render, otherwise Three allocates a second GPU copy.
        for (const key of Object.keys(m)) {
          const value = (m as unknown as Record<string, unknown>)[key];
          if (value && typeof value === 'object' && 'isTexture' in value && key !== 'envMap')
            (m as unknown as Record<string, unknown>)[key] = textureFor(value as Texture);
        }
        if (opaque && 'transmission' in m) (m as MeshStandardMaterial & { transmission: number }).transmission = 0;
        materials.set(original, m);
      }
      return materials.get(original)!;
    };
    object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
    object.receiveShadow = true;
    object.castShadow = /Oiled teak|Dry palm thatch|Honed limestone/.test((Array.isArray(object.material) ? object.material[0] : object.material).name);
  });
  let disposed = false;
  return { root, materials: [...materials.values()], dispose() {
    if (disposed) return; disposed = true; materials.forEach(m => m.dispose());
  } };
}
