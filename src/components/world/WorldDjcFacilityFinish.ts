import type { MeshStandardMaterial } from 'three';

const surface = /* glsl */`
varying vec3 vDjcFinish;

// A filtered pattern retains its mean rather than flickering into thin stripes.
float djcCourse(float phase, float width) {
  float pixel = max(fwidth(phase), .0001);
  return (1. - smoothstep(width, width + pixel, abs(fract(phase + .5) - .5)))
    * (1. - smoothstep(.18, .65, pixel));
}
float djcCell(vec2 cell) {
  return fract(sin(dot(cell, vec2(34.171, 72.813))) * 15731.137);
}
float djcStoneCloud(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(djcCell(cell), djcCell(cell + vec2(1., 0.)), f.x),
    mix(djcCell(cell + vec2(0., 1.)), djcCell(cell + 1.), f.x), f.y);
}
vec3 djcStone(vec2 p, float role) {
  // Mineral bands dominate at walking distance. The finer dark patches
  // cluster irregularly inside those bands and fade at grazing angles.
  vec2 grainUv = vec2(p.x * 1.13 + p.y * .51, p.y * .82 - p.x * .35);
  float cloud = .68 * djcStoneCloud(grainUv * 2.5) + .32 * djcStoneCloud(grainUv * 7.);
  vec2 poreUv = grainUv * 95.;
  float footprint = length(fwidth(poreUv));
  float pit = smoothstep(.64, .88, djcStoneCloud(poreUv)) * smoothstep(.29, .66, cloud)
    * (1. - smoothstep(.25, .85, footprint));
  if (role < 4.5) return vec3(1.02 + .24 * (cloud - .5) - .045 * pit, .79 + .18 * cloud, -.00055 * pit + .004 * cloud);
  if (role < 5.5) return vec3(1.01 + .12 * (cloud - .5) - .020 * pit, .60 + .16 * cloud, -.0003 * pit + .002 * cloud);
  if (role < 6.5) return vec3(.92 + .15 * cloud - .042 * pit, .93 + .06 * cloud, -.0005 * pit);
  return vec3(1.04 + .19 * (cloud - .5) - .026 * pit, .67 + .21 * cloud, -.00035 * pit + .003 * cloud);
}
vec3 djcFinish(vec2 p, float role) {
  if (role < 2.5) {
    // Roof straw runs down the slope. The staggered weave is broad enough
    // to survive the ordinary walk-up view; fibres disappear at distance.
    float column = floor(p.x / .24);
    float course = (p.y + djcCell(vec2(column, 0.)) * .19) / .44;
    float warp = djcCourse(p.x / .24, .085);
    float weft = djcCourse(course, role < 1.5 ? .13 : .075);
    float fibre = djcCourse(p.x / .045 + .12 * sin(p.y * 8.), .13);
    float cell = djcCell(vec2(column, floor(course)));
    float band = .06 * sin(p.x * 4.8 + sin(p.y * .8));
    return vec3(1.04 + band + .18 * (cell - .5) - .19 * warp - .13 * weft - .08 * fibre,
      .90 + .07 * cell + .06 * weft, .009 * warp + .004 * weft + .003 * fibre);
  }
  if (role > 3.5) return djcStone(p, role);
  // The UV follows the actual rod axis. Splitting, tonal streaks and nodes
  // run at distinct scales so the bamboo never becomes uniform screen noise.
  float grain = djcCourse(p.x / .058 + .20 * sin(p.y * 2. + p.x * 7.), .085);
  float ridge = djcCourse(p.x / .19 + .12 * sin(p.y * 1.7), .16);
  float node = djcCourse(p.y / .66, .034);
  float streak = .5 + .5 * sin(p.x * 24. + sin(p.y * 1.9));
  return vec3(1.08 + .16 * streak - .18 * grain - .27 * node - .13 * ridge,
    .64 + .17 * grain + .22 * node, .005 * (grain + ridge + node));
}
vec3 djcBump(vec3 normal, float height, vec3 viewPosition) {
  vec3 dx = dFdx(-viewPosition), dy = dFdy(-viewPosition);
  vec3 r1 = cross(dy, normal), r2 = cross(normal, dx);
  float determinant = dot(dx, r1);
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(max(abs(determinant), 1e-8) * normal - gradient);
}
`;

export function applyDjcFacilityFinish(material: MeshStandardMaterial) {
  material.customProgramCacheKey = () => 'djc-facility-finish-r1';
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec3 aDjcFinish; varying vec3 vDjcFinish;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDjcFinish = aDjcFinish;');
    shader.fragmentShader = surface + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float djcRole = vDjcFinish.z;
        vec3 djcDetail = vec3(1., roughness, 0.);
        if (djcRole > .5) djcDetail = djcFinish(vDjcFinish.xy, djcRole);
        diffuseColor.rgb *= djcDetail.x;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (djcRole > .5) roughnessFactor = clamp(djcDetail.y, .28, 1.);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (djcRole > .5) normal = djcBump(normal, djcDetail.z, vViewPosition);');
    material.userData.djcFinishCompiled = true;
  };
  return material;
}
