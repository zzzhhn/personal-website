import { BufferGeometry, MeshStandardMaterial, type IUniform } from 'three';
import { night } from './WorldNight';
import { facilityEnvironmentChunk, registerFacilityMaterial } from './WorldFacilitySurface';

/** Split only the authored shelter glass. Both outputs own their attributes;
 * the untouched Builder remains the source for collision and editable export. */
export function splitShelterGlazing(source: BufferGeometry) {
  const mat = source.getAttribute('aMat'), index = source.index!;
  const opaque: number[] = [], glass: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), slot = mat.getW(a);
    // L0 uses physical slot 4; original L1 retains its original material layout.
    const isGlass = slot === -4 || (slot === 0 && Math.abs(mat.getX(a) - .38) < .001 && mat.getY(a) === 0);
    (isGlass ? glass : opaque).push(a, index.getX(i + 1), index.getX(i + 2));
  }
  const piece = (indices: number[]) => { const g = source.clone(); g.setIndex(indices); g.computeBoundingSphere(); return g; };
  return { opaque: piece(opaque), glass: piece(glass) };
}

/** Low-cost frosted glazing approximation: real closed wall geometry, alpha
 * blending and rough environment reflection, with no scene transmission pass. */
export function createShelterGlazingMaterial() {
  const material = new MeshStandardMaterial({ vertexColors: true, transparent: true,
    opacity: .45, depthWrite: false, roughness: .46, metalness: 0 });
  material.name = 'facility-shelter-frosted-glass';
  material.onBeforeCompile = shader => {
    shader.uniforms.uFacilityNight = night as IUniform;
    shader.fragmentShader = 'uniform float uFacilityNight;\nconst float vFacilityKind = 4.0;\n' + shader.fragmentShader
      .replace('#include <envmap_physical_pars_fragment>', facilityEnvironmentChunk);
  };
  material.customProgramCacheKey = () => 'facility-shelter-frosted-glass-v1';
  return registerFacilityMaterial(material);
}
