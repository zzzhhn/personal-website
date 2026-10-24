/**
 * Street props: one shared material for every procedural street asset (street session).
 * Reads the per-vertex attributes written by WorldStreetGeometry.Builder:
 *   aMat = (roughness, metalness, glow code, sign flag), aSuv = sign-atlas uv (already remapped).
 * Works on Mesh, InstancedMesh and BatchedMesh. Per-instance fade comes from the batching colour
 * alpha (BatchedMesh.setColorAt with a Vector4) as an ordered-dither discard, so a fading prop never
 * needs transparency sorting.
 * Glow codes: 1 warm lamp lens (#FFD08A, night), 2 cyan light-tech strip (dim at dusk, Art Lock 5),
 * 3/4/5 signal red/amber/green (one cycle on the shared, pausable wind clock), 6 retro reflector.
 */
import { CanvasTexture, LinearMipmapLinearFilter, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, SRGBColorSpace } from 'three';
import { windUniforms } from './WorldWind';

export const streetUniforms = { uNight: { value: 0 } };

const vertexHead = /* glsl */`
attribute vec4 aMat;
attribute vec2 aSuv;
varying vec4 vMat;
varying vec2 vSuv;
varying float vPhase;
`;
const vertexBody = /* glsl */`#include <begin_vertex>
  vMat = aMat; vSuv = aSuv; vPhase = 0.0;
  #ifdef USE_BATCHING
  {
    // Signal phase from the instance heading: crossing approaches run half a cycle apart.
    vec3 ax = batchingMatrix[0].xyz;
    vPhase = abs(ax.x) > abs(ax.z) ? 0.0 : 0.5;
  }
  #endif
`;
const bayer = /* glsl */`
float streetBayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + .5) / 16.;
}
`;
const fragmentHead = /* glsl */`
uniform float uNight;
uniform float uTime;
uniform sampler2D uAtlas;
varying vec4 vMat;
varying vec2 vSuv;
varying float vPhase;
` + bayer;
const fragmentColor = /* glsl */`#include <color_fragment>
  if (diffuseColor.a < streetBayer(gl_FragCoord.xy)) discard;
  diffuseColor.a = 1.0;
  if (vMat.w > .5) diffuseColor.rgb = texture2D(uAtlas, vSuv).rgb;
`;
const fragmentEmissive = /* glsl */`#include <emissivemap_fragment>
  {
    float g = floor(vMat.z + .5);
    if (g == 1.0) totalEmissiveRadiance += vec3(1.0, .74, .42) * (.05 + uNight * 2.4);
    else if (g == 2.0) totalEmissiveRadiance += vec3(.31, .82, .77) * (.08 + uNight * .8);
    else if (g >= 3.0 && g <= 5.0) {
      // 14 s cycle: green 6 s, amber 1.5 s, red 6.5 s.
      float t = fract(uTime / 14.0 + vPhase) * 14.0;
      float state = t < 6.0 ? 5.0 : t < 7.5 ? 4.0 : 3.0;
      vec3 c = g == 3.0 ? vec3(1.0, .22, .14) : g == 4.0 ? vec3(1.0, .62, .16) : vec3(.3, 1.0, .55);
      totalEmissiveRadiance += c * (g == state ? .9 + uNight * 1.3 : .01);
    }
    else if (g == 6.0) totalEmissiveRadiance += diffuseColor.rgb * uNight * .22;
  }
`;

export function createStreetMaterial(atlas: CanvasTexture | null, key = 'street-props-v1') {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = streetUniforms.uNight;
    shader.uniforms.uTime = windUniforms.uWindTime;
    shader.uniforms.uAtlas = { value: atlas };
    shader.vertexShader = vertexHead + shader.vertexShader.replace('#include <begin_vertex>', vertexBody);
    shader.fragmentShader = fragmentHead + shader.fragmentShader
      .replace('#include <color_fragment>', fragmentColor)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMat.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMat.y;')
      .replace('#include <emissivemap_fragment>', fragmentEmissive);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Shadow depth for batched / instanced props that honours the per-instance dither fade (a faded
 * prop must not leave its shadow behind). */
export function createStreetDepthMaterial() {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = shader => {
    shader.vertexShader = 'varying float vFade;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFade = 1.0;
      #ifdef USE_BATCHING_COLOR
        vFade = getBatchingColor(getIndirectIndex(gl_DrawID)).a;
      #endif`);
    shader.fragmentShader = 'varying float vFade;\n' + bayer + shader.fragmentShader.replace('void main() {', 'void main() {\n  if (vFade < streetBayer(gl_FragCoord.xy)) discard;');
  };
  m.customProgramCacheKey = () => 'street-depth-fade-v1';
  return m;
}

/* ------------------------------------------------------------------ sign atlas (runtime canvas, bilingual) */

export const ATLAS_SIZE = 2048;
export type AtlasPainter = (g: CanvasRenderingContext2D, w: number, h: number) => void;
export const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Avenir Next", "Helvetica Neue", sans-serif';

/** Paints cells (pixel rects on a 2048 canvas) and returns the texture; null outside the browser. */
export function paintAtlas(cells: { rect: [number, number, number, number]; paint: AtlasPainter }[]) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#E6DCCB'; g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  for (const c of cells) {
    g.save(); g.translate(c.rect[0], c.rect[1]);
    g.beginPath(); g.rect(0, 0, c.rect[2], c.rect[3]); g.clip();
    c.paint(g, c.rect[2], c.rect[3]);
    g.restore();
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace; t.anisotropy = 8; t.minFilter = LinearMipmapLinearFilter;
  return t;
}
/** Pixel rect -> Builder.cell (normalised, top-left origin). */
export const cellOf = (r: [number, number, number, number]): [number, number, number, number] => [r[0] / ATLAS_SIZE, r[1] / ATLAS_SIZE, r[2] / ATLAS_SIZE, r[3] / ATLAS_SIZE];
