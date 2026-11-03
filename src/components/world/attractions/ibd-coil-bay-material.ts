import { IBD_SHEDS } from './ibd-yard-layout';
import type { MeshStandardMaterial } from 'three';
import { IBD_STOCK_WOOD } from './ibd-stock-wood-material';

const cladding = (expanded: boolean) => /* glsl */`
varying vec4 vCoilCladding;

const vec3 shedBackZ = vec3(${IBD_SHEDS.map(s => (s.z-s.depth/2).toFixed(4)).join(',')});
const vec3 shedLeftX = vec3(${IBD_SHEDS.map(s => (s.x-s.width/2).toFixed(4)).join(',')});
float coilFold(float metres, float spacing) {
  float phase = metres / spacing;
  float edge = max(fwidth(phase), .002);
  float centre = abs(fract(phase + .5) - .5);
  return (1. - smoothstep(.05, .13 + edge, centre)) * (1. - smoothstep(.16, .55, edge));
}

// Color factor, roughness, metalness, relief in meters. Position is in the
// yard's local frame; the roof sheets run eave-to-ridge and the wall runs up.
vec4 coilFinish(vec3 p, float role, float building) {
  int bay = int(building);
  float along = ${expanded ? "p.z - shedBackZ[bay]" : "p.z + 9.5"};
  if (role < 1.5 || role == 6.) {
    float span = role == 6. ? p.x - shedLeftX[bay] : along;
    float fold = coilFold(span, .36);
    float millCoordinate = ${expanded ? "span" : "p.z"};
    float mill = sin((millCoordinate + .27 * sin(millCoordinate * .68)) * 6.4);
    return vec4(1.02 + .024 * mill - .13 * fold, .62 + .08 * fold, .22, .0034 * fold);
  }
  if (role < 2.5 || role == 5.) {
    float fold = coilFold(along, .48);
    float lap = coilFold(along, 1.2);
    float broad = sin(p.z * 2.3 + .28 * sin(p.x * .41));
    return vec4(1.01 + .041 * broad - .15 * fold - .065 * lap,
      .54 + .17 * fold, role > 4.5 ? .32 : .23, .006 * fold + .002 * lap);
  }
  if (role < 3.5) {
    // Broad, smooth mill variation with restrained sheen, no speckled grid.
    float roll = sin(p.z * 5.1 + .7 * sin(p.x * 4.6 + p.y * 11.3));
    return vec4(.99 + .046 * roll, .46 + .082 * roll, .68, .001 * roll);
  }
  float coat = .5 + .5 * sin(p.y * 3.7 + .48 * sin(p.x * 5.3));
  return vec4(.96 + .085 * coat, .47 + .13 * coat, .24, 0.);
}
`;

/** Decorates the actual IBD static draw's own material. Existing light, ground
 * and work-light code compiles first; no cloned or borrowed textures. */
export function applyCoilBayMaterial(material: MeshStandardMaterial, expanded: boolean, wood = false) {
  const baseCompile = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => baseKey + (expanded ? ':ibd-envelope-v2' : ':coil-bay-v1') + (wood ? ':stock-wood-v2' : '');
  material.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(material, shader, renderer);
    shader.vertexShader = 'attribute float aIbdCladding; varying vec4 vCoilCladding;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoilCladding = vec4(position, aIbdCladding);');
    shader.fragmentShader = cladding(expanded) + (wood ? IBD_STOCK_WOOD : '') + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float coilRole = mod(vCoilCladding.w, 16.);
        vec4 coilResponse = vec4(1., vIbdSurface.x, vIbdSurface.y, 0.);
        float stockBoard = floor(vCoilCladding.w / 16.);
        ${wood ? 'if (coilRole > 6.5) coilResponse = stockWoodFinish(vCoilCladding.xyz, coilRole, stockBoard, vIbdSurface.x); else' : ''}
        if (coilRole > .5) coilResponse = coilFinish(vCoilCladding.xyz, coilRole, stockBoard);
        diffuseColor.rgb *= coilResponse.x;`)
      .replace('roughnessFactor = vIbdSurface.x;', 'roughnessFactor = coilResponse.y;')
      .replace('metalnessFactor = vIbdSurface.y;', 'metalnessFactor = coilResponse.z;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (coilRole > .5) normal = ibdConcreteNormal(-vViewPosition, normal, coilResponse.w, faceDirection);`);
    material.userData.ibdCladdingCompiled = true;
    if (wood) material.userData.ibdStockWoodCompiled = true;
  };
  return material;
}
