/**
 * Layout v4 road paving, formal replacement of the `paved` greybox (terrain session, DESIGN.md §2-§3).
 * Geometry from WorldTerrainPaving (closed carriageway field with gutter, rolled kerb, sidewalk pavers;
 * frozen ramp / bridge decks; boardwalk; windmill pad; the v4 building forecourt surfaces).
 * One draw per spatial chunk (paving and paint merged); nothing casts shadows. The
 * original triangles feed Rapier: walkable tops (incl. the rolled kerb face) are `surface`, the outer
 * skirts and prism walls are `solid`. Formal park handover clips only the old spur VISUAL; its
 * original collision arrays remain throughout. Claims `paved` once mounted (visual and colliders ready).
 */
import { memo, useEffect, useMemo } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { PAVE_STRIDE, pavingMesh, parkPlazaPavingVisual, type PaveChunk } from './WorldTerrainPaving';
import { useGreyboxClaim, useIsClaimed } from './WorldVisualClaims';

const NOISE = /* glsl */`
float pHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), u.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float pFbm(vec2 p) { return 0.55 * pNoise(p) + 0.3 * pNoise(p * 2.03 + 7.1) + 0.15 * pNoise(p * 4.11 - 3.7); }
// Distance (0 at the joint) to the nearest grid line of period per, in metres.
float pJoint(float x, float per) { float f = fract(x / per); return min(f, 1.0 - f) * per; }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
`;

/** Shared paving material: per-triangle mode + strip-local coordinates select the surface recipe. */
function pavingMaterial() {
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  m.name = 'world-paving-v4';
  m.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float paveMode;\nattribute vec3 paveUv;\nvarying float vMode;\nvarying vec3 vPaveUv;\nvarying vec3 vPaveWorld;\n'
      + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vMode = paveMode; vPaveUv = paveUv; vPaveWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = 'varying float vMode;\nvarying vec3 vPaveUv;\nvarying vec3 vPaveWorld;\n' + NOISE + `
float pH = 0.0; float pRough = 0.95;
` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 w = vPaveWorld.xz; float o = vPaveUv.x, s = vPaveUv.y, lat = vPaveUv.z;
        int mode = int(vMode + 0.5);
        float fine = 1.0 - smoothstep(0.02, 0.12, length(fwidth(w)));
        vec3 c = vec3(1.0);
        float patchN = pFbm(w / 7.0);
        if (mode == 0 || mode == 7 || mode == 6 || mode == 13) {
          // Asphalt: aggregate speckle, large-scale tone, sealed crack lines, tyre polish, edge dust.
          c = lin(mode >= 6 && mode != 7 ? vec3(0.49, 0.475, 0.45) : vec3(0.43, 0.425, 0.415));
          // Ring shoulder edge: crumbling asphalt into soil.
          if (mode == 13) c = mix(c, lin(vec3(0.55, 0.47, 0.36)), smoothstep(0.35, 0.75, pFbm(w / 0.5) + (o - vPaveUv.x)));
          float agg = pNoise(w / 0.035), agg2 = pNoise(w / 0.011 + 3.0);
          c *= 1.0 + ((agg - 0.5) * 0.16 + (agg2 - 0.5) * 0.12) * fine;
          c *= 0.9 + 0.2 * patchN;
          // Rectangular repair patches (slightly darker, crisp edge) on ~4 % of 3 m cells.
          vec2 pc = floor(w / 3.0 + vec2(0.37, 0.71)); vec2 pf = fract(w / 3.0 + vec2(0.37, 0.71));
          float isPatch = step(0.96, pHash(pc + 11.0)) * step(0.15, pf.x) * step(pf.x, 0.85) * step(0.2, pf.y) * step(pf.y, 0.75);
          c *= 1.0 - 0.12 * isPatch;
          // Sealed cracks: thin dark meanders where a warped noise crosses 0.5.
          float cr = abs(pFbm(w / 2.4 + pNoise(w / 0.6) * 0.35) - 0.5);
          // Width in metres via the derivative, so cracks stay hairline (~8 mm) instead of fat worms.
          float crW = max(fwidth(cr), 1e-4);
          float crack = (1.0 - smoothstep(0.5, 1.5, cr / crW)) * step(0.7, pNoise(w / 9.0 + 4.0)) * step(cr, 0.004);
          c *= 1.0 - 0.22 * crack * fine;
          // Wheel paths: two polished bands per lane (|lat| ~ 1.1 and 2.9 m from the centreline).
          float al = abs(lat);
          float track = (1.0 - smoothstep(0.25, 0.55, abs(al - 1.0))) + (1.0 - smoothstep(0.25, 0.55, abs(al - 2.9)));
          track *= step(al, 4.6) * (0.6 + 0.4 * pNoise(vec2(s, al) * 0.3 + w * 0.05));
          c *= 1.0 - 0.07 * track;
          pRough = 0.92 - 0.14 * track + 0.06 * agg;
          // Dust and grit settle against the kerb (last 0.7 m before the gutter) and over the centre line.
          float dust = (mode == 0 ? smoothstep(-0.7, 0.0, o) : 0.0) * (0.55 + 0.45 * pNoise(w / 0.8));
          c = mix(c, lin(vec3(0.66, 0.6, 0.5)), 0.32 * dust);
          pH = (agg - 0.5) * 0.002 + (agg2 - 0.5) * 0.0012 - crack * 0.004 - isPatch * 0.0;
        } else if (mode == 1 || mode == 8) {
          // Concrete gutter pan / bridge edge slabs: transverse joints, trowel tone, dust.
          c = lin(vec3(0.6, 0.585, 0.55));
          float per = mode == 1 ? 2.0 : 1.5;
          float j = pJoint(s, per);
          float slab = floor(s / per);
          c *= 0.9 + 0.12 * pHash(vec2(slab, 3.0)) + (pNoise(w / 0.05) - 0.5) * 0.08 * fine;
          c = mix(c, lin(vec3(0.68, 0.62, 0.52)), 0.25 * pNoise(w / 0.9));
          c *= 1.0 - 0.35 * (1.0 - smoothstep(0.004, 0.012, j));
          pH = -0.003 * (1.0 - smoothstep(0.0, 0.012, j)) + (pNoise(w / 0.04) - 0.5) * 0.0006;
          pRough = 0.9;
        } else if (mode == 2 || mode == 3) {
          // Granite kerb: speckled light grey, 1 m units with fine joints and chipped arrises.
          c = lin(vec3(0.72, 0.7, 0.66));
          float unit = floor(s / 1.0);
          c *= 0.92 + 0.1 * pHash(vec2(unit, 9.0));
          float sp = pNoise(w / 0.012), sp2 = pNoise(w / 0.03 + 5.0);
          c *= 1.0 + ((sp - 0.5) * 0.25 + (sp2 - 0.5) * 0.12) * fine;
          c *= mix(1.0, 0.88, step(0.8, sp) * fine);
          float j = pJoint(s, 1.0);
          c *= 1.0 - 0.45 * (1.0 - smoothstep(0.003, 0.009, j));
          // Kerb face is grimier than the top.
          if (mode == 2) c *= 0.86 + 0.08 * pNoise(w / 0.3);
          pH = -0.004 * (1.0 - smoothstep(0.0, 0.009, j)) + (sp - 0.5) * 0.0008;
          pRough = 0.82;
        } else if (mode == 4 || mode == 5) {
          // Concrete pavers 0.30 x 0.15 m, running bond, laid parallel to the kerb; per-paver tone,
          // bevelled joints with sand, wear near the kerb and in a walking line.
          vec2 q = vec2(s / 0.30, (o - 0.66) / 0.15);
          float row = floor(q.y);
          q.x += 0.5 * mod(row, 2.0);
          vec2 id = floor(q), f = fract(q);
          vec2 e = min(f, 1.0 - f) * vec2(0.30, 0.15);
          float edge = min(e.x, e.y);
          float tone = pHash(id + 17.0);
          c = lin(vec3(0.8, 0.765, 0.7)) * (0.88 + 0.16 * tone);
          c = mix(c, lin(vec3(0.66, 0.62, 0.56)), step(0.9, pHash(id + 41.0)) * 0.6);
          c *= 1.0 + (pNoise(w / 0.02) - 0.5) * 0.12 * fine;
          float joint = 1.0 - smoothstep(0.003, 0.011, edge);
          c = mix(c, lin(vec3(0.55, 0.5, 0.42)), joint * 0.75);
          float wear = pNoise(vec2(s * 0.15, o * 1.2) + 3.0) * (1.0 - smoothstep(0.0, 1.6, abs(o - 1.6)));
          c *= 1.0 - 0.06 * wear;
          if (mode == 5) { c = mix(c, lin(vec3(0.6, 0.57, 0.5)), 0.5); }
          pH = -0.006 * (1.0 - smoothstep(0.0, 0.011, edge)) + tone * 0.0015;
          pRough = 0.88 + 0.08 * tone;
        } else if (mode == 12) {
          // Road paint: off-white, worn by traffic.
          c = lin(vec3(0.85, 0.82, 0.76));
          float wear = smoothstep(0.45, 0.8, pFbm(w / 0.9)) * 0.7 + (pNoise(w / 0.05) - 0.5) * 0.25;
          c = mix(c, lin(vec3(0.43, 0.425, 0.415)), clamp(wear, 0.0, 0.75));
          pRough = 0.72;
        } else if (mode == 9) {
          // Boardwalk planks across the walk (0.2 m) with gaps and grain.
          float j = pJoint(s, 0.2);
          float plank = floor(s / 0.2);
          c = lin(vec3(0.56, 0.43, 0.33)) * (0.85 + 0.2 * pHash(vec2(plank, 1.0)));
          c *= 1.0 + (pNoise(vec2(o * 2.0, s * 40.0) + plank) - 0.5) * 0.18;
          c *= 1.0 - 0.6 * (1.0 - smoothstep(0.006, 0.014, j));
          pH = -0.006 * (1.0 - smoothstep(0.0, 0.014, j));
          pRough = 0.9;
        } else if (mode == 10) {
          c = lin(vec3(0.69, 0.54, 0.37)) * (0.88 + 0.2 * pFbm(w / 0.7));
          pRough = 1.0;
        } else {
          // Forecourt stone slabs 0.6 m (world grid), light Art Lock edge stone.
          vec2 q = w / 0.6; vec2 id = floor(q), f = fract(q);
          float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 0.6;
          c = lin(vec3(0.85, 0.82, 0.76)) * (0.9 + 0.12 * pHash(id + 5.0));
          c *= 1.0 - 0.3 * (1.0 - smoothstep(0.003, 0.01, edge));
          pH = -0.004 * (1.0 - smoothstep(0.0, 0.01, edge));
          pRough = 0.9;
        }
        diffuseColor.rgb *= c;
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = pRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        // Procedural bump from pH (joints, aggregate) by screen-space derivatives.
        vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp);
        vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
        float det = dot(sx, r1);
        vec3 grad = sign(det) * (dFdx(pH) * r1 + dFdy(pH) * r2);
        normal = normalize(abs(det) * normal - grad);
      }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.specularColor = vec3(0.03); material.specularColorBlended = vec3(0.03); material.specularF90 = 0.5;`);
  };
  m.customProgramCacheKey = () => 'world-paving-v4';
  return m;
}

function geometryOf(v: number[]) {
  const n = v.length / PAVE_STRIDE, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), mode = new Float32Array(n), uv = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const b = i * PAVE_STRIDE;
    pos.set([v[b], v[b + 1], v[b + 2]], i * 3); nrm.set([v[b + 3], v[b + 4], v[b + 5]], i * 3); mode[i] = v[b + 6]; uv.set([v[b + 7], v[b + 8], v[b + 9]], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('paveMode', new Float32BufferAttribute(mode, 1));
  g.setAttribute('paveUv', new Float32BufferAttribute(uv, 3));
  g.computeBoundingSphere();
  return { g, pos };
}

function ChunkColliders({ name, pos, top, walls }: { name: string; pos: Float32Array; top: number[]; walls: number[] }) {
  const t = useMemo(() => new Uint32Array(top), [top]), w = useMemo(() => new Uint32Array(walls), [walls]);
  return <>
    {t.length > 0 && <RigidBody name={`${name}-support`} type="fixed" colliders={false} userData={{ surface: true }}>
      <TrimeshCollider name={`${name}-top`} args={[pos, t]} friction={.95} restitution={0} />
    </RigidBody>}
    {w.length > 0 && <RigidBody name={`${name}-sides`} type="fixed" colliders={false} userData={{ solid: true }}>
      <TrimeshCollider name={`${name}-walls`} args={[pos, w]} friction={.65} restitution={0} />
    </RigidBody>}
  </>;
}

function Chunk({ c, material }: { c: PaveChunk; material: MeshStandardMaterial }) {
  // Town replaces pillars and boards; v4 paving owns their walkable forecourt throughout handover.
  const main = useMemo(() => geometryOf([...c.v, ...c.fv]), [c]);
  const fore = useMemo(() => c.fv.length ? geometryOf(c.fv) : null, [c]);
  const parkReady = useMemo(() => c.parkSpurTriangles.length ? geometryOf([...parkPlazaPavingVisual(c), ...c.fv]) : null, [c]);
  const plazaClaimed = useIsClaimed('park-plaza');
  useEffect(() => () => { main.g.dispose(); fore?.g.dispose(); parkReady?.g.dispose(); }, [main, fore, parkReady]);
  return <group name={`paving-v4-${c.key}`}>
    <mesh name={`paving-v4-chunk-${c.key}`} geometry={plazaClaimed && parkReady ? parkReady.g : main.g} material={material} receiveShadow userData={{ surface: true }} />
    <ChunkColliders name={`paving-v4-${c.key}`} pos={main.pos} top={c.top} walls={c.walls} />
    {fore && <ChunkColliders name={`paving-v4-forecourts-${c.key}`} pos={fore.pos} top={c.ftop} walls={c.fwalls} />}
  </group>;
}

export default memo(function WorldTerrainRoads() {
  const mesh = useMemo(pavingMesh, []);
  const material = useMemo(pavingMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  useGreyboxClaim('paved');
  return <group name="world-paving-v4">
    {mesh.chunks.map(c => <Chunk key={c.key} c={c} material={material} />)}
  </group>;
});
