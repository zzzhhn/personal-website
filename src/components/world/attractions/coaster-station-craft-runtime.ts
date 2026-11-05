import { DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from 'three';

/** Static near/far meshes are authored and batched in the GLB. No runtime
 * merge, texture copy or light is added by this adapter.
 */
export function createCoasterStationCraft(source: Object3D) {
  const root = source.clone(true);
  root.name = 'coaster-station-craft';
  const require = (name: string) => {
    const part = root.getObjectByName(name);
    if (!part) throw Error(`Station craft missing ${name}`);
    return part;
  };
  const near = require('Near'), far = require('Far'), shadow = require('Shadow');
  const copies = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  for (const level of [near, far]) level.traverse(o => {
    if (!(o instanceof Mesh)) return;
    if (!(o.material instanceof MeshStandardMaterial)) throw Error('Station craft requires one physical material per batch');
    let material = copies.get(o.material);
    if (!material) {
      material = o.material.clone(); copies.set(o.material, material);
    }
    o.material = material;
    o.castShadow = false; o.receiveShadow = true;
  });
  const depth = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
  depth.name = 'Station shared opaque silhouette';
  depth.shadowSide = DoubleSide;
  shadow.traverse(o => {
    if (!(o instanceof Mesh)) return;
    o.material = depth; o.castShadow = true; o.receiveShadow = false;
  });
  far.visible = false;
  root.userData.stationCraft = { detailed: true };
  const materials = [...copies.values()];
  let users = 0, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    materials.forEach(m => m.dispose()); depth.dispose();
  };
  const retain = () => {
    if (disposed) throw Error('Cannot retain disposed station craft');
    users++;
    let released = false;
    return () => {
      if (released) return;
      released = true; users--;
      queueMicrotask(() => { if (users === 0) dispose(); });
    };
  };
  return { root, near, far, shadow, materials, depth, retain, dispose,
    setDetailed(detailed: boolean) { near.visible = detailed; far.visible = !detailed; root.userData.stationCraft.detailed = detailed; } };
}
