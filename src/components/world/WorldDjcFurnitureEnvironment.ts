import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat, type Texture } from 'three';
import { createDjcEnvironmentRadiance } from './djc-environment-radiance';
import { SUN_OFFSET } from './WorldShadows';

type EnvironmentTarget={texture:Texture;dispose:()=>void};
const environments=new WeakMap<object,{target:EnvironmentTarget|null;users:number}>();
/** The renderer owns one reflection target. A microtask grace period lets React
 * StrictMode reacquire it during effect replay without using a disposed map. */
export function retainDjcFurnitureEnvironment(renderer:object,create:()=>EnvironmentTarget|null) {
  let entry=environments.get(renderer);
  if(!entry){entry={target:create(),users:0};environments.set(renderer,entry);}
  entry.users++;
  const retained=entry;let released=false;
  return {texture:entry.target?.texture??null,release(){
    if(released)return;released=true;retained.users--;
    queueMicrotask(()=>{if(retained.users===0&&environments.get(renderer)===retained){environments.delete(renderer);retained.target?.dispose();}});
  }};
}

/** A small private outdoor reflection map. No scene environment, exposure or global lights change. */
export function useDjcFurnitureEnvironment() {
  const renderer = useThree(s => s.gl), [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    const retained=retainDjcFurnitureEnvironment(renderer,()=>{
      const width = 256, height = 128, pixels = createDjcEnvironmentRadiance(width,height,SUN_OFFSET);
      const source = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
      source.mapping = EquirectangularReflectionMapping; source.colorSpace = LinearSRGBColorSpace; source.needsUpdate = true;
      const generator = new PMREMGenerator(renderer);
      let target: ReturnType<PMREMGenerator['fromEquirectangular']> | undefined;
      try { target = generator.fromEquirectangular(source); }
      catch (error) { console.warn('[djc-furniture] private reflections unavailable; PBR textures retained', error); }
      finally { source.dispose(); generator.dispose(); }
      return target??null;
    });
    setMap(retained.texture);
    return retained.release;
  }, [renderer]);
  return map;
}
