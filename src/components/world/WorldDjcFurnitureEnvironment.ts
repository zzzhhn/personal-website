import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat, type Texture } from 'three';

/** A small private outdoor reflection map. No scene environment, exposure or global lights change. */
export function useDjcFurnitureEnvironment() {
  const renderer = useThree(s => s.gl), [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    const width = 256, height = 128, pixels = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sky = Math.max(0, 1 - y / (height / 2)), ground = y > height / 2;
      const key = Math.exp(-(((x - width * .32) / 18) ** 2 + ((y - height * .3) / 12) ** 2));
      const i = (y * width + x) * 4;
      pixels[i] = (ground ? .16 : .7 - sky * .32) + key * 1.3;
      pixels[i + 1] = (ground ? .145 : .76 - sky * .23) + key * 1.1;
      pixels[i + 2] = (ground ? .11 : .82 - sky * .08) + key * .8; pixels[i + 3] = 1;
    }
    const source = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
    source.mapping = EquirectangularReflectionMapping; source.colorSpace = LinearSRGBColorSpace; source.needsUpdate = true;
    const generator = new PMREMGenerator(renderer);
    let target: ReturnType<PMREMGenerator['fromEquirectangular']> | undefined;
    try { target = generator.fromEquirectangular(source); }
    catch (error) { console.warn('[djc-bar] private reflections unavailable; PBR textures retained', error); }
    finally { source.dispose(); generator.dispose(); }
    if (!target) return;
    const owned = target;
    setMap(target.texture);
    return () => owned.dispose();
  }, [renderer]);
  return map;
}
