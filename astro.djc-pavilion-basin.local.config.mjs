import config from './astro.config.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';

const views = [
  { id: 'D-pavilion', eye: [65, 3.1, 43.5], target: [40, 6.3, 55] },
  { id: 'D-basin', eye: [60, 3.1, 30], target: [65, 1.0, 48] },
];
const authored = ['WorldDjcClubGeometry.ts','WorldDjcClubVisual.tsx','WorldDjcFacilityFinish.ts','WorldClubWaterCapture.ts'];
const revision = createHash('sha256').update(Buffer.concat(authored.map(file =>
  readFileSync(new URL('src/components/world/' + file, import.meta.url))))).digest('hex');
const review = {
  name: 'local-club-craft-review',
  enforce: 'pre',
  transform(source, id) {
    if (!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx')) return;
    const start = source.indexOf('  const views = useMemo(() => {');
    const end = source.indexOf('  }, []);', start);
    if (start < 0 || end < 0) throw new Error('Craft camera hook moved');
    source = source.slice(0, start) +
      '  const views = useMemo(() => (' + JSON.stringify(views) + ' as Array<{id:string;eye:Vec3;target:Vec3}>), []);' +
      source.slice(end + '  }, []);'.length);
    source = "import { clubWaterDebug } from './WorldClubWaterCapture';\n" + source;
    source = source.replace('  useEffect(() => {\n    const previous', `  const inspectClub = () => {
    const root = scene.getObjectByName('djc-beach-club');
    return ['fabric', 'wood', 'stone'].map(key => {
      const mesh = root?.getObjectByName('djc-' + key) as any;
      const g = mesh?.geometry, m = mesh?.material, colors = g?.getAttribute('color');
      const finish = g?.getAttribute('aDjcFinish');
      const roles = {};
      if (finish) for (let i = 0; i < finish.count; i += 3) {
        const role = finish.getZ(i);
        roles[role] = (roles[role] ?? 0) + 1;
      }
      const signature = {};
      if (colors) for (let i = 0; i < colors.count; i += 3) {
        const rgb = [colors.getX(i),colors.getY(i),colors.getZ(i)].map(x => x.toFixed(5)).join(',');
        signature[rgb] = (signature[rgb] ?? 0) + 1;
      }
      return { key, present: !!mesh, colors: signature, triangles: g?.getAttribute('position').count / 3,
        roles, programKey: key === 'stone' || m?.userData?.djcFinishCompiled ? m?.customProgramCacheKey() : null, finishCompiled: !!m?.userData?.djcFinishCompiled, finishGpuBytes: finish?.array.byteLength ?? 0, vertexColors: m?.vertexColors, roughness: m?.roughness, metalness: m?.metalness, map: !!m?.map };
    });
  };
  useEffect(() => {
    const previous`);
    return source.replace('selected = useRef(0)', "selected = useRef(new URLSearchParams(location.search).get('clubReview') === 'basin' ? 1 : 0)")
      .replace('shot: shots[0].id', 'shot: shots[selected.current].id')
      .replace('report.textContent = views[0].id', 'report.textContent = views[selected.current].id')
      .replace('  const recordButton =', `  const panStart = useRef(0);
  const waterPan = useRef<{ start: Record<string,number>; button: HTMLButtonElement } | null>(null);
  const recordButton =`)
      .replace("    button('Compact craft controls'", `    button('Pavilion slow pan', () => { if (selected.current === 0) { panStart.current = performance.now(); invalidate(); } });
    const waterButton = button('Basin capture pan', () => {
      if (selected.current !== 1 || panStart.current) return;
      waterPan.current = { start: { ...clubWaterDebug.totals.budgeted }, button: waterButton };
      waterButton.title = 'running'; panStart.current = performance.now(); invalidate();
    });
    button('Compact craft controls'`)
      .replace('camera.lookAt(...view.target);', `camera.lookAt(...view.target);
    if (panStart.current) {
      const progress = (performance.now() - panStart.current) / 12000;
      if (progress >= 1) {
        panStart.current = 0;
        const capture = waterPan.current;
        if (capture) {
          const totals = clubWaterDebug.totals.budgeted;
          capture.button.title = JSON.stringify({ durationMs: 12000, yawRadians: .064, enabled: clubWaterDebug.enabled,
            budgeted: clubWaterDebug.budgeted, targetSize: clubWaterDebug.size,
            delta: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value - capture.start[key]])) });
          waterPan.current = null;
        }
      } else {
        camera.rotateY(Math.sin(progress * Math.PI * 2) * .064);
        invalidate();
      }
    }`)
      .replace("baseline: '7702c3d'", `baseline: 'bdd9d2e', revision: '${revision}', mode: new URLSearchParams(location.search).get('djcPavilion') ?? 'candidate'`)
      .replace('exposure: gl.toneMappingExposure,', 'exposure: gl.toneMappingExposure, dpr: gl.getPixelRatio(), cameraPosition: camera.position.toArray(), cameraQuaternion: camera.quaternion.toArray(),')
      .replace('materialRevision: 2,', 'clubMaterials: inspectClub(), warmup: { stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable },')
      .replace('HUTS.every(h => !!scene.getObjectByName(`park-hut-${h.id}-solid`)) && !!scene.getObjectByName(\'street-fixed\')', "!!scene.getObjectByName('djc-fabric') && !!scene.getObjectByName('djc-stone')")
      .replaceAll('warm.current.frames = 0; warm.current.stable = 0;', "warm.current.frames = 0; warm.current.stable = 0; warm.current.signature = ''; warm.current.changed = performance.now();")
      .replace('warm.current.changed >= 1000', 'warm.current.changed >= 3000');
  },
};
export default {
  ...config,
  vite: { ...config.vite, plugins: [review, ...config.vite.plugins],
    server: { ...config.vite.server, fs: { allow: [...config.vite.server.fs.allow, realpathSync('public/assets')] } } },
};
