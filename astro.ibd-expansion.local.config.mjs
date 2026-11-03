import config from './astro.config.mjs';
import { realpathSync } from 'node:fs';

const views = [
  { id: 'Coil shed walk-up', eye: [-94, 2.9, -164], target: [-106, 8, -183] },
  { id: 'Parts shed', eye: [-85, 2.9, -172], target: [-71, 5.7, -193] },
  { id: 'Dispatch shed', eye: [-87, 2.9, -145], target: [-68, 5.4, -160] },
  { id: 'Middle rack', eye: [-74.5, 2.9, -190], target: [-75, 3.7, -199] },
  { id: 'East eave joint', eye: [-57.5, 4.2, -181], target: [-57, 8.0, -185] },
  { id: 'Rack shelf joint', eye: [-70.75, 2.95, -194.2], target: [-71.7, 3.27, -197.45] },
  { id: 'Three racks', eye: [-74, 2.9, -180.5], target: [-74, 3.45, -199] },
  { id: 'Stock crate', eye: [-71.1, 2.8, -193.2], target: [-73.5, 2.35, -199.4] },
  { id: 'Bridge bearing', eye: [-90, 3.0, -173], target: [-92.1, 7.6, -179] },
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
    return source.replace('selected = useRef(0)', "selected = useRef(Math.min(8, Math.max(0, Number(new URLSearchParams(location.search).get('ibdView')) || 0)))")
      .replace('shot: shots[0].id', 'shot: shots[selected.current].id')
      .replace('report.textContent = views[0].id', 'report.textContent = views[selected.current].id')
      .replace("baseline: '7702c3d'", "baseline: 'bcf4f66'")
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
