/** Local street facility review. */
import config from './astro.batch6.facilities.config.mjs';import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
const views = [
 { id: 'G-barrier', item: 'roadblock-2', group: 'roadblock', eye: [21.5, 2.74, -21.3], target: [24, 1.65, -18] },
 { id: 'G-lamp', item: 'lamp-0', group: 'knock', eye: [22, 2.75, 17], target: [17, 3.60, 13] },
 { id: 'S-signal', item: 'signal-2', group: 'knock', eye: [24, 2.75, 4.4], target: [28.6, 3.9, -1.9] },
];
const sourceVersion={baseCommit:'689484b',hashes:Object.fromEntries(['WorldParkLamp.ts','WorldStreetAssets.ts','WorldStreetFacilityCraft.ts','WorldStreetGeometry.ts','WorldStreetMaterial.ts','WorldEnvironment.tsx','WorldParkWalk.tsx','WorldPark.tsx','WorldParkKit.ts','WorldParkLayout.ts','WorldFacilitySurface.ts']
 .map(name=>[name,createHash('sha256').update(readFileSync(new URL('./src/components/world/'+name,import.meta.url))).digest('hex')]))};
const review={name:'street-rework-review',enforce:'pre',transform(source,id){
 if(!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx'))return;
 const start=source.indexOf('  const views = useMemo(() => {'),end=source.indexOf('  }, []);',start);if(start<0||end<0)throw new Error('Review boundary changed');
 source=source.slice(0,start)+`  const views = useMemo(() => (${JSON.stringify(views)} as Array<{id:string;item:string;group:string;eye:Vec3;target:Vec3}>), []);`+source.slice(end+'  }, []);'.length);
 source="import { streetKnockRegistry } from './WorldStreetKnock';\nimport { windUniforms } from './WorldWind';\nimport { facilitySurfaceUniforms } from './WorldFacilitySurface';\nimport { Matrix4, Vector3 } from 'three';\n"+source;
 source=source.replace('  useEffect(() => {\n    const previous',`  const reworkModeAtMount = new URLSearchParams(location.search).get('streetRework') === 'baseline' ? 'baseline' : 'candidate';
  const reworkReviewStatus = () => {
    const view = views[selected.current], currentMode = new URLSearchParams(location.search).get('streetRework') === 'baseline' ? 'baseline' : 'candidate';
    const direction = camera.getWorldDirection(new Vector3()), wanted = new Vector3(...view.target).sub(new Vector3(...view.eye)).normalize();
    const cameraReady = camera.position.distanceToSquared(new Vector3(...view.eye)) < 1e-8 && direction.dot(wanted) > 1 - 1e-6;
    const textures = Object.entries(facilitySurfaceUniforms()).filter(([name]) => name !== 'uFacilityNight').map(([name, uniform]) => {
      const texture = uniform.value as any, image = texture?.image;
      return { name, uuid: texture?.uuid, width: image?.width ?? 0, height: image?.height ?? 0, version: texture?.version ?? 0,
        gpuVersion: texture ? gl.properties.get(texture).__version ?? 0 : 0 };
    });
    const state = streetKnockRegistry.find(s => s.item.id === view.item);
    const batch = scene.getObjectByName('street-' + view.group) as any;
    const geometryId = state && batch?.getGeometryIdAt(state.batchId);
    const range = geometryId === undefined ? null : batch.getGeometryRangeAt(geometryId);
    const mat = batch?.geometry?.getAttribute('aMat');
    const counts: Record<string,number> = {}, glow: Record<string,number> = {};
    if (range && mat) for (let j = range.vertexStart; j < range.vertexStart + range.vertexCount; j++) {
      const slot = Math.max(0,-mat.getW(j)), code = mat.getZ(j);
      counts[slot] = (counts[slot] ?? 0) + 1;
      if (code) glow[code] = (glow[code] ?? 0) + 1;
    }
    const matrix = new Matrix4();
    if (state && batch) batch.getMatrixAt(state.batchId,matrix);
    const actualHome = matrix.elements.slice(12,15);
    const sampleHome = state?.item.position;
    const sampleReady = !!sampleHome && state?.phase === 'home' && sampleHome.every((x,j)=>Math.abs(actualHome[j]-x)<1e-4);
    const geometryReady = !!range && range.indexCount > 0 && !!mat;
    const texturesReady = textures.length === 3 && textures.every(t => t.width > 0 && t.height > 0 && t.version > 0 && t.gpuVersion === t.version);
    return { viewId: view.id, currentMode, expectedMode: reworkModeAtMount, sampleHome, actualHome, sampleReady, geometryReady, counts, glow, triangles: (range?.indexCount ?? 0)/3, windTime: windUniforms.uWindTime.value, cameraPosition: camera.position.toArray(), cameraDirection: direction.toArray(), cameraReady, textures, texturesReady,
      ready: cameraReady && currentMode === reworkModeAtMount && texturesReady && sampleReady && geometryReady };
  };
  useEffect(() => {\n    const previous`);
 source=source.replace('exposure: gl.toneMappingExposure,', 'exposure: gl.toneMappingExposure, dpr: gl.getPixelRatio(), devicePixelRatio: window.devicePixelRatio,').replace("baseline: '7702c3d'",`baseline: '689484b', sourceVersion: ${JSON.stringify(sourceVersion)}, group: 'street-rework', surfaceMode: new URLSearchParams(location.search).get('streetRework') === 'baseline' ? 'baseline' : 'candidate'`)
  .replace('materialRevision: 2','materialRevision: 6, reviewReady: reworkReviewStatus(), reviewWarmup: { stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable, minimumStableMs: 3000 }');
 // A camera/time change must start a new stable window even when the scene's
 // registered mesh digest is identical. Otherwise an old ready age can race
 // the delayed shadow job after switching from the first view.
 source=source.replaceAll('warm.current.frames = 0; warm.current.stable = 0;',"warm.current.frames = 0; warm.current.stable = 0; warm.current.changed = performance.now(); warm.current.signature = '';" )
  .replace('warm.current.changed >= 1000','warm.current.changed >= 3000')
  .replace('!loading.active && targetReady','!loading.active && targetReady && reworkReviewStatus().ready')
  .replace('stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable });','stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable, review: reworkReviewStatus() });');
 return{code:source,map:null};
}};
export default{...config,vite:{...config.vite,plugins:[review,...config.vite.plugins],server:{...config.vite.server,fs:{allow:[...config.vite.server.fs.allow,
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-facilities/public',
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-bench-bin/public',
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-rails/public']}}}};
