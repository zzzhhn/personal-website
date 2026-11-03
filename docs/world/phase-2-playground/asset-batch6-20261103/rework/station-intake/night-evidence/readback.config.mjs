import base from './review.config.mjs';
const readback = {name:'coaster-night-readback',enforce:'pre',transform(code,id){
  if(!id.endsWith('/WorldRuntime.tsx')) return;
  const marker='  const { camera, gl, scene, clock, invalidate, size, get } = useThree();';
  if(!code.includes(marker)) throw Error('Missing runtime hook');
  return `import { climate as craftClimate } from './WorldNight';
import { shadowChunkWork as craftShadowWork } from './WorldShadows';
`+code.replace(marker,`${marker}
  useFrame(() => {
    const s = useWorldStore.getState();
    const canvas = gl.domElement;
    canvas.dataset.coasterReadback = JSON.stringify({
      shot:s.shot,quality:s.quality,time:s.worldMinutes,weather:s.weather,
      position:camera.position.toArray(), direction:camera.getWorldDirection(camera.position.clone()).toArray(),
      fov:'fov' in camera ? camera.fov : null, exposure:gl.toneMappingExposure,
      blend:craftClimate.blend,night:night.value,shadowPending:craftShadowWork().pending,
      loading:s.loading.active,frame:gl.info.render.frame,
      pixelRatio:gl.getPixelRatio(),canvas:[canvas.width,canvas.height]
    });
  }, 0);
`);
}};
export default {...base,vite:{...base.vite,plugins:[readback,...base.vite.plugins]}};
