import config from './astro.config.mjs';
import { realpathSync } from 'node:fs';

const views = [
  { id: 'Coil shed walk-up', eye: [-94, 2.9, -164], target: [-106, 8, -183] },
  { id: 'Coil shed joint', eye: [-93, 4.9, -169], target: [-91, 11.25, -172.2] },
];
const review = {
  name: 'ibd-shed-local-review',
  enforce: 'pre',
  transform(source, id) {
    if (!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx')) return;
    const start = source.indexOf('  const views = useMemo(() => {');
    const end = source.indexOf('  }, []);', start);
    if (start < 0 || end < 0) throw new Error('Craft camera hook moved');
    source = source.slice(0, start) +
      '  const views = useMemo(() => (' + JSON.stringify(views) + ' as Array<{id:string;eye:Vec3;target:Vec3}>), []);' +
      source.slice(end + '  }, []);'.length);
    return source.replace("baseline: '7702c3d'", "baseline: '414e86c'")
      .replace('fov: 50,', 'fov: camera instanceof PerspectiveCamera ? camera.fov : null, cameraPosition: camera.position.toArray(), quaternion: camera.quaternion.toArray(), dpr: gl.getPixelRatio(),')
      .replace('materialRevision: 2,', `ibd: (() => {
        const mesh = scene.getObjectByName('ibd-three-sheds-static') as Mesh;
        const g = mesh.geometry, m = mesh.material as any;
        const roles = g.getAttribute('aIbdCladding');
        return { triangles: g.index.count / 3, attributes: Object.fromEntries(Object.entries(g.attributes).map(([k,v]) => [k, v.array.byteLength])),
          roles: roles ? [...new Set(Array.from({length: roles.count}, (_, i) => roles.getX(i)))].sort() : [], material: m.customProgramCacheKey(), compiled: !!m.userData.ibdCladdingCompiled };
      })(), warmup: { stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable },`)
      .replace('HUTS.every(h => !!scene.getObjectByName(`park-hut-${h.id}-solid`)) && !!scene.getObjectByName(\'street-fixed\')', "!!scene.getObjectByName('ibd-three-sheds-static')")
      .replaceAll('warm.current.frames = 0; warm.current.stable = 0;', "warm.current.frames = 0; warm.current.stable = 0; warm.current.signature = ''; warm.current.changed = performance.now();")
      .replace('warm.current.changed >= 1000', 'warm.current.changed >= 3000');
  },
};
export default {
  ...config,
  vite: { ...config.vite, plugins: [review, ...config.vite.plugins],
    server: { ...config.vite.server, fs: { allow: [...config.vite.server.fs.allow, realpathSync('public/assets')] } } },
};
