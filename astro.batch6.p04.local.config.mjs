/** Local P04 representative capture. */
import config from './astro.batch6.facilities.config.mjs';import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
const views = [{ id: 'P04-normal', eye: [66.24, 2.74, -36.68], target: [62.397348543648874, 2.54, -37.063946814266544] }];
const sourceVersion={baseCommit:'4ac2360',hashes:Object.fromEntries(['WorldParkLamp.ts','WorldStreetAssets.ts','WorldStreetFacilityCraft.ts','WorldStreetGeometry.ts','WorldEnvironment.tsx','WorldParkWalk.tsx','WorldPark.tsx','WorldParkKit.ts','WorldParkLayout.ts','WorldFacilitySurface.ts']
 .map(name=>[name,createHash('sha256').update(readFileSync(new URL('./src/components/world/'+name,import.meta.url))).digest('hex')]))};
const review={name:'p04-review',enforce:'pre',transform(source,id){
 if(!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx'))return;
 const start=source.indexOf('  const views = useMemo(() => {'),end=source.indexOf('  }, []);',start);if(start<0||end<0)throw new Error('Review boundary changed');
 source=source.slice(0,start)+`  const views = useMemo(() => (${JSON.stringify(views)} as Array<{id:string;eye:Vec3;target:Vec3}>), []);`+source.slice(end+'  }, []);'.length);
 source="import { facilitySurfaceUniforms } from './WorldFacilitySurface';\nimport { Vector3 } from 'three';\n"+source;
 source=source.replace('  useEffect(() => {\n    const previous',`  const lampModeAtMount = new URLSearchParams(location.search).get('parkLampCraft') === 'baseline' ? 'baseline' : 'candidate';
  const lampReviewStatus = () => {
    const view = views[selected.current], currentMode = new URLSearchParams(location.search).get('parkLampCraft') === 'baseline' ? 'baseline' : 'candidate';
    const direction = camera.getWorldDirection(new Vector3()), wanted = new Vector3(...view.target).sub(new Vector3(...view.eye)).normalize();
    const cameraReady = camera.position.distanceToSquared(new Vector3(...view.eye)) < 1e-8 && direction.dot(wanted) > 1 - 1e-6;
    const textures = Object.entries(facilitySurfaceUniforms()).filter(([name]) => name !== 'uFacilityNight').map(([name, uniform]) => {
      const texture = uniform.value as any, image = texture?.image;
      return { name, uuid: texture?.uuid, width: image?.width ?? 0, height: image?.height ?? 0, version: texture?.version ?? 0,
        gpuVersion: texture ? gl.properties.get(texture).__version ?? 0 : 0 };
    });
    const proxy = scene.getObjectByName('park-lamp-physics-proxy') as any;
    const near = scene.getObjectByName('park-lamp') as any;
    const poses = proxy?.instanceMatrix?.array as Float32Array | undefined;
    const homesReady = !!poses && proxy.count === 9 && Array.from({length:9}, (_,i) =>
      Math.abs(poses[i*16+12]) + Math.abs(poses[i*16+13]) + Math.abs(poses[i*16+14]) > 1).every(Boolean);
    const sampleHome = [62.397348543648874, 1.14, -37.063946814266544];
    const visibleSample = near?.instanceMatrix?.array as Float32Array | undefined;
    const sampleReady = !!visibleSample && Array.from({length:near.count}, (_,i) =>
      sampleHome.every((value,j) => Math.abs(value - visibleSample[i*16+12+j]) < 1e-4)).some(Boolean);
    const instancesReady = homesReady && sampleReady;
    const mat = near?.geometry.getAttribute('aMat');
    const emit = near?.geometry.getAttribute('aEmit');
    const slots = mat ? Array.from(new Set(Array.from({length:mat.count}, (_,i) => -mat.getW(i)))).sort() : [];
    const lensFaces = emit ? Array.from({length:emit.count / 3}, (_,i) => emit.getY(i*3) > 0).filter(Boolean).length : 0;
    const geometryReady = near?.geometry.getAttribute('position').count === 766*3 && lensFaces === 48
      && (currentMode === 'baseline' ? !mat : slots.join(',') === '0,1,2');
    const texturesReady = textures.length === 3 && textures.every(t => t.width > 0 && t.height > 0 && t.version > 0 && t.gpuVersion === t.version);
    return { viewId: view.id, currentMode, expectedMode: lampModeAtMount, instancesReady, sampleHome, sampleReady, geometryReady, slots, lensFaces, cameraPosition: camera.position.toArray(), cameraDirection: direction.toArray(), cameraReady, textures, texturesReady,
      ready: cameraReady && currentMode === lampModeAtMount && texturesReady && instancesReady && geometryReady };
  };
  useEffect(() => {\n    const previous`);
 source=source.replace('exposure: gl.toneMappingExposure,', 'exposure: gl.toneMappingExposure, dpr: gl.getPixelRatio(), devicePixelRatio: window.devicePixelRatio,').replace("baseline: '7702c3d'",`baseline: '4ac2360', sourceVersion: ${JSON.stringify(sourceVersion)}, group: 'p04', surfaceMode: new URLSearchParams(location.search).get('parkLampCraft') === 'baseline' ? 'baseline' : 'candidate'`)
  .replace('materialRevision: 2','materialRevision: 6, reviewReady: lampReviewStatus(), reviewWarmup: { stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable, minimumStableMs: 3000 }');
 // A camera/time change must start a new stable window even when the scene's
 // registered mesh digest is identical. Otherwise an old ready age can race
 // the delayed shadow job after switching from the first view.
 source=source.replaceAll('warm.current.frames = 0; warm.current.stable = 0;',"warm.current.frames = 0; warm.current.stable = 0; warm.current.changed = performance.now(); warm.current.signature = '';" )
  .replace('warm.current.changed >= 1000','warm.current.changed >= 3000')
  .replace('!loading.active && targetReady','!loading.active && targetReady && lampReviewStatus().ready')
  .replace('stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable });','stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable, review: lampReviewStatus() });');
 // Read actual instance poses in addition to material/camera readiness.
 source=source.replace('materialRevision: 6,', `lampInstances: ['park-lamp','park-lamp-far','park-lamp-physics-proxy'].map(name => {
    const mesh = scene.getObjectByName(name) as any;
    const a = mesh?.instanceMatrix?.array as Float32Array | undefined, count = mesh?.count ?? 0;
    return { name, count, nonZeroPositions: a ? Array.from({length: count}, (_,i) => [a[i*16+12],a[i*16+13],a[i*16+14]]).filter(p => p.some(v => Math.abs(v) > .01)).length : 0,
      firstPositions: a ? Array.from({length: Math.min(3,count)},(_,i) => [a[i*16+12],a[i*16+13],a[i*16+14]]) : [] };
  }), materialRevision: 6,`);
 return{code:source,map:null};
}};
export default{...config,vite:{...config.vite,plugins:[review,...config.vite.plugins],server:{...config.vite.server,fs:{allow:[...config.vite.server.fs.allow,
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-facilities/public',
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-bench-bin/public',
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-rails/public']}}}};
