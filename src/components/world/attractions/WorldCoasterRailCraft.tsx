import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { MeshBasicMaterial, MeshStandardMaterial, NoColorSpace, RepeatWrapping, type BufferGeometry } from 'three';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { shadowOnlyRange } from './coaster-shadow-range';
import metalMapUrl from '../../../../docs/world/phase-2-playground/coaster-gate-craft-20261105/directional-hardware-roughness-256.png?url';
import mineralMapUrl from '../../../../docs/world/phase-2-playground/coaster-gate-craft-20261105/honed-mineral-roughness-256.png?url';

export const RAIL_FINISHES = {
  runningSteel: { color: '#b6c2c5', roughness: .48, metalness: .92 },
  coatedSteel: { color: '#426270', roughness: .67, metalness: .12 },
  jointSteel: { color: '#9aaeb3', roughness: .54, metalness: .8 },
  concrete: { color: '#b4b0a0', roughness: .98, metalness: 0 },
} as const;

/** Four physical finishes retain fabrication UVs. Shared baked incident light
 * illuminates paint/mineral surfaces at night without one light per support. */
export default function WorldCoasterRailCraft({ geometry, shadow }: {
  geometry: Record<string, BufferGeometry>; shadow: BufferGeometry;
}) {
  const environment = useDjcFurnitureEnvironment();
  const shadowRange = useMemo(() => shadowOnlyRange(shadow), [shadow]);
  useEffect(() => () => shadowRange.restore(), [shadowRange]);
  const [metalSource, mineralSource] = useTexture([metalMapUrl, mineralMapUrl]);
  const pack = useMemo(() => {
    const maps = [metalSource, mineralSource].map(source => {
      const texture = source.clone();
      texture.colorSpace = NoColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.needsUpdate = true;
      return texture;
    });
    const materials = Object.fromEntries(Object.entries(RAIL_FINISHES).map(([key, finish]) => {
      const material = new MeshStandardMaterial({ ...finish, roughnessMap: maps[key === 'concrete' ? 1 : 0] });
      material.name = `Coaster rail ${key}`;
      material.onBeforeCompile = shader => {
        shader.uniforms.uRailNight = night;
        shader.vertexShader = 'attribute vec3 nightRadiance; varying vec3 vRailIncident;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRailIncident = nightRadiance;');
        shader.fragmentShader = 'uniform float uRailNight; varying vec3 vRailIncident;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vRailIncident * diffuseColor.rgb * (1.0 - metalnessFactor) * uRailNight;');
      };
      material.customProgramCacheKey = () => 'coaster-rail-pbr-baked-incident-v1';
      return [key, material];
    }));
    // Match the old FrontSide caster's shadow-side convention. This material
    // has explicit ownership because all geometry below is cache-owned.
    const depth = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    let users = 0, disposed = false;
    return { materials, depth, retain() {
      if (disposed) throw Error('Retaining disposed rail finishes');
      users++; let released = false;
      return () => { if (released) return; released = true; users--;
        queueMicrotask(() => { if (users || disposed) return; disposed = true;
          Object.values(materials).forEach(material => material.dispose()); maps.forEach(map => map.dispose()); depth.dispose();
        });
      };
    } };
  }, [metalSource, mineralSource]);
  const previous = useRef(NaN);
  useEffect(() => {
    for (const material of Object.values(pack.materials)) {
      material.envMap = environment; material.envMapIntensity = .85 - .35 * night.value; material.needsUpdate = true;
    }
    previous.current = night.value;
  }, [pack, environment]);
  useEffect(() => pack.retain(), [pack]);
  useFrame(() => {
    if (previous.current === night.value) return;
    previous.current = night.value;
    for (const material of Object.values(pack.materials)) material.envMapIntensity = .85 - .35 * night.value;
  });
  return <group name="coaster-rail-craft" dispose={null}>
    {Object.entries(geometry).map(([key, shape]) => <mesh key={key} name={`rail-${key}`} geometry={shape} material={pack.materials[key]} receiveShadow />)}
    <mesh name="coaster-retained-rail-shadow" geometry={shadow} material={pack.depth} castShadow
      onBeforeRender={shadowRange.beforeColour} onAfterRender={shadowRange.restore}
      onBeforeShadow={shadowRange.restore} />
  </group>;
}
