/** P02/P03 actual procedural representatives against c4f7fca. */
import config from './astro.batch6.facilities.config.mjs';import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
const views=JSON.parse(readFileSync(new URL('./tools/world/facility-craft/batch6/walk/baseline/views.json',import.meta.url),'utf8'));
const sourceVersion={baseCommit:'c4f7fca',hashes:Object.fromEntries(['WorldWalkCraft.ts','WorldParkWalk.tsx','WorldPark.tsx','WorldParkKit.ts','WorldParkLayout.ts','WorldFacilitySurface.ts']
 .map(name=>[name,createHash('sha256').update(readFileSync(new URL('./src/components/world/'+name,import.meta.url))).digest('hex')]))};
const review={name:'walk-review',enforce:'pre',transform(source,id){
 if(!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx'))return;
 const start=source.indexOf('  const views = useMemo(() => {'),end=source.indexOf('  }, []);',start);if(start<0||end<0)throw new Error('Review boundary changed');
 source=source.slice(0,start)+`  const views = useMemo(() => (${JSON.stringify(views)} as Array<{id:string;eye:Vec3;target:Vec3}>), []);`+source.slice(end+'  }, []);'.length);
 source="import { facilitySurfaceUniforms } from './WorldFacilitySurface';\nimport { Vector3 } from 'three';\n"+source;
 source=source.replace('  useEffect(() => {\n    const previous',`  const railModeAtMount = new URLSearchParams(location.search).get('walkCraft') === 'baseline' ? 'baseline' : 'candidate';
  const railReviewStatus = () => {
    const view = views[selected.current], currentMode = new URLSearchParams(location.search).get('walkCraft') === 'baseline' ? 'baseline' : 'candidate';
    const direction = camera.getWorldDirection(new Vector3()), wanted = new Vector3(...view.target).sub(new Vector3(...view.eye)).normalize();
    const cameraReady = camera.position.distanceToSquared(new Vector3(...view.eye)) < 1e-8 && direction.dot(wanted) > 1 - 1e-6;
    const textures = Object.entries(facilitySurfaceUniforms()).filter(([name]) => name !== 'uFacilityNight').map(([name, uniform]) => {
      const texture = uniform.value as any, image = texture?.image;
      return { name, uuid: texture?.uuid, width: image?.width ?? 0, height: image?.height ?? 0, version: texture?.version ?? 0,
        gpuVersion: texture ? gl.properties.get(texture).__version ?? 0 : 0 };
    });
    const proxy = scene.getObjectByName('park-rail-physics-proxy') as any, poses = proxy?.instanceMatrix?.array as Float32Array | undefined;\n    const instancesReady = !!poses && proxy.count === 42 && Array.from({length:42},(_,i) => Math.abs(poses[i*16+12])+Math.abs(poses[i*16+13])+Math.abs(poses[i*16+14]) > 1).every(Boolean);\n    const texturesReady = textures.length === 3 && textures.every(t => t.width > 0 && t.height > 0 && t.version > 0 && t.gpuVersion === t.version);
    return { viewId: view.id, currentMode, expectedMode: railModeAtMount, instancesReady, cameraPosition: camera.position.toArray(), cameraDirection: direction.toArray(), cameraReady, textures, texturesReady,
      ready: cameraReady && currentMode === railModeAtMount && texturesReady && instancesReady };
  };
  useEffect(() => {\n    const previous`);
 source=source.replace("baseline: '7702c3d'",`baseline: 'c4f7fca', sourceVersion: ${JSON.stringify(sourceVersion)}, group: 'walk', surfaceMode: new URLSearchParams(location.search).get('walkCraft') === 'baseline' ? 'baseline' : 'candidate'`)
  .replace('materialRevision: 2','materialRevision: 6, reviewReady: railReviewStatus(), reviewWarmup: { stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable, minimumStableMs: 3000 }');
 // A camera/time change must start a new stable window even when the scene's
 // registered mesh digest is identical. Otherwise an old ready age can race
 // the delayed shadow job after switching from the first view.
 source=source.replaceAll('warm.current.frames = 0; warm.current.stable = 0;',"warm.current.frames = 0; warm.current.stable = 0; warm.current.changed = performance.now(); warm.current.signature = '';" )
  .replace('warm.current.changed >= 1000','warm.current.changed >= 3000')
  .replace('!loading.active && targetReady','!loading.active && targetReady && railReviewStatus().ready')
  .replace('stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable });','stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable, review: railReviewStatus() });');
 // Read actual instance poses in addition to material/camera readiness.
 source=source.replace('materialRevision: 6,', `walkInstances: ['park-rail','park-rail-far','park-rail-physics-proxy'].map(name => {
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
