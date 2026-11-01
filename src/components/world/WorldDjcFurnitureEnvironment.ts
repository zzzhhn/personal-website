import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat, type Texture } from 'three';
import { createDjcEnvironmentRadiance } from './djc-environment-radiance';
import { SUN_OFFSET } from './WorldShadows';

/** A small private outdoor reflection map. No scene environment, exposure or global lights change. */
export function useDjcFurnitureEnvironment() {
  const renderer = useThree(s => s.gl), [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    const width = 256, height = 128, pixels = createDjcEnvironmentRadiance(width,height,SUN_OFFSET);
    const source = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
    source.mapping = EquirectangularReflectionMapping; source.colorSpace = LinearSRGBColorSpace; source.needsUpdate = true;
    const generator = new PMREMGenerator(renderer);
    let target: ReturnType<PMREMGenerator['fromEquirectangular']> | undefined;
    try { target = generator.fromEquirectangular(source); }
    catch (error) { console.warn('[djc-furniture] private reflections unavailable; PBR textures retained', error); }
    finally { source.dispose(); generator.dispose(); }
    if (!target) return;
    const owned = target;
    setMap(target.texture);
    return () => owned.dispose();
  }, [renderer]);
  return map;
}
