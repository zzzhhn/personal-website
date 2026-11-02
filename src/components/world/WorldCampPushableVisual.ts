import type { Material, Mesh, Object3D } from 'three';

/** Register once per attached subtree, including late Suspense replacements. Geometry/textures
 * remain loader-owned; restoring on detach also makes StrictMode's effect replay harmless. */
export function bindCampPushableVisual(root: Object3D, legacy: Material) {
  type Surface = { opacity: number; transparent: boolean; depthWrite: boolean; users: number };
  const surfaces = new Map<Material, Surface>();
  const originals = new Map<Mesh, Mesh['material']>();
  const nodes = new Set<Object3D>();
  const strings = new Set<Object3D>();
  let currentStrings: Object3D | undefined;
  let fade = 1;
  const apply = (material: Material, surface: Surface) => {
    const transparent = surface.transparent || fade < 1;
    const depthWrite = fade < 1 ? false : surface.depthWrite;
    if (material.transparent !== transparent || material.depthWrite !== depthWrite) {
      material.transparent = transparent; material.depthWrite = depthWrite; material.needsUpdate = true;
    }
    const opacity = surface.opacity * fade;
    if (material.opacity !== opacity) material.opacity = opacity;
  };
  const retain = (material: Material) => {
    const saved = surfaces.get(material);
    if (saved) { saved.users++; return; }
    const surface = { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, users: 1 };
    surfaces.set(material, surface); apply(material, surface);
  };
  const release = (material: Material) => {
    const surface = surfaces.get(material);
    if (!surface || --surface.users) return;
    material.opacity = surface.opacity;
    if (material.transparent !== surface.transparent || material.depthWrite !== surface.depthWrite) {
      material.transparent = surface.transparent; material.depthWrite = surface.depthWrite; material.needsUpdate = true;
    }
    surfaces.delete(material);
  };
  const visitMaterials = (mesh: Mesh, visit: (material: Material) => void) => {
    if (Array.isArray(mesh.material)) for (const material of mesh.material) visit(material);
    else visit(mesh.material);
  };
  const added = ({ child }: { child: Object3D }) => attach(child);
  const removed = ({ child }: { child: Object3D }) => detach(child);
  const attach = (object: Object3D) => {
    if (nodes.has(object)) return;
    nodes.add(object);
    object.addEventListener('childadded', added); object.addEventListener('childremoved', removed);
    if (object.name === 'camp-content-C12-strings') { strings.add(object); currentStrings = object; }
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      originals.set(mesh, mesh.material);
      if (!mesh.userData.facilityCraft) mesh.material = legacy;
      visitMaterials(mesh, retain);
    }
    for (const child of object.children) attach(child);
  };
  const detach = (object: Object3D) => {
    if (!nodes.delete(object)) return;
    object.removeEventListener('childadded', added); object.removeEventListener('childremoved', removed);
    strings.delete(object);
    if (currentStrings === object) currentStrings = strings.values().next().value;
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      visitMaterials(mesh, release);
      mesh.material = originals.get(mesh)!; originals.delete(mesh);
    }
    for (const child of object.children) detach(child);
  };
  attach(root);
  return {
    get strings() { return currentStrings; },
    setFade(value: number) {
      if (fade === value) return;
      fade = value;
      for (const [material, surface] of surfaces) apply(material, surface);
    },
    dispose() { detach(root); },
  };
}
