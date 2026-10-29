import { PointLight, Raycaster, Vector2, Vector3, type Camera, type Frustum, type Object3D } from 'three';
import { applyFirePass, shadowBiasQa } from './WorldShadows';
import type { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { CAMP_CENTER } from './layout';
import { SHADOW_BUDGET, createBudgetProbe, type ShadowTier } from './WorldQuality';
import { useWorldStore } from './store';
import { occlusionQa } from './WorldOcclusion';

/**
 * Campfire shadow (shadows v4.1, spec v3 §14.1): the existing fire key light in WorldEnvironment (warm
 * #FF8A3A, inverse square, 26 m, flickering) casts the shadow; no second light is added. The cool night
 * fill, the warm spill and the lamp pool stay shadowless.
 *
 * Whitelist, enforced in the real per-face render path: the point light's getFrustum(face) hook
 * (called by WebGLShadowMap once per cube face, right before that face's caster traversal) switches
 * castShadow so that only these casters draw into the cube, and only on faces whose frustum they touch:
 *   - the guide (G24) and any vehicle body within FIRE_RANGE m of the fire (dynamic),
 *   - the fire ring C05 and the four benches C06 (static; drawn as per-instance plain meshes so each
 *     face only gets the instances it sees).
 * Trees, bushes, rocks, tents, props and the rest of the island never enter the fire's cube; their sun
 * shadows and the main pass are untouched (flags are restored after every shadow render). Tents are
 * left out: their shells are 17.5 m from the fire (about 4 % of the light at the benches) and their
 * wind-animated canvas has no matching distance material.
 *
 * Update policy (no 2 Hz refresh of moving bodies): the cube is re-rendered every frame while a dynamic
 * caster is in range. When the last one leaves, it is rendered once more with the static casters only,
 * then held (autoUpdate=false) until a dynamic caster returns, so no stale person/vehicle silhouette is
 * ever left behind. Size changes (quality tier) invalidate the map. Balanced uses 512 per face.
 */
export const FIRE_RANGE = 12;
const FIRE_XZ = [CAMP_CENTER[0], CAMP_CENTER[2]] as const;
let qaFireOff = false;
const qa: { camera: Camera | null; sun: SunLight | null; renderer: unknown } = { camera: null, sun: null, renderer: null };
/** QA: the renderer, for frame breakdowns (set by WorldShadows from onBeforeRender). */
export const setQaRenderer = (r: unknown) => { qa.renderer = r; };
const qaRay = new Raycaster(), qaNdc = new Vector2(), qaPoint = new Vector3();
let fire: PointLight | null = null, searchedAt = -1e9, frame = 0, renders = 0, dynamicWasIn = false, staticDirty = true;
const info = { found: false, name: null as string | null, mapSize: 0, distanceToFocus_m: 0, mode: 'off' as 'every-frame' | 'static-held' | 'off', dynamicInRange: false, renders: 0, near_m: 0, far_m: 0, bias: 0, normalBias: 0, intensity: 0, renderedThisFrame: false };

let vehicleRoots: Object3D[] = [], vehicleScan = -1e9;
const vp = new Vector3();
/** World positions of vehicle bodies (rigid-body objects tagged userData.vehicle), rescanned every 2 s. */
function vehiclePositions(scene: Object3D) {
  if (frame - vehicleScan > 120) { vehicleScan = frame; vehicleRoots = []; scene.traverse(o => { if (o.userData.vehicle || o.userData.vehicleId) vehicleRoots.push(o); }); }
  return vehicleRoots.map(o => o.getWorldPosition(vp).toArray());
}

function findFire(scene: Object3D) {
  let named: PointLight | null = null, match: PointLight | null = null;
  const p = new Vector3();
  scene.traverse(o => {
    const l = o as PointLight;
    if (!l.isPointLight) return;
    if (l.name === 'camp-fire-key') named = l;
    l.getWorldPosition(p);
    if (!l.name && Math.hypot(p.x - FIRE_XZ[0], p.y - 6.5, p.z - FIRE_XZ[1]) < .5) match = l;
  });
  return named ?? match;
}

export function worldLightsFrame(scene: Object3D, camera: Camera, tier: ShadowTier, sun: SunLight, focus: readonly number[]) {
  frame++;
  qa.camera = camera; qa.sun = sun;
  if (!fire?.parent && frame - searchedAt > 60) { searchedAt = frame; fire = findFire(scene); }
  if (!fire) { info.found = false; return; }
  const size = SHADOW_BUDGET[tier].fireCube;
  if (!fire.castShadow && !qaFireOff) {
    fire.castShadow = true;
    fire.shadow.camera.near = .3;
    fire.shadow.bias = -.004;
    fire.shadow.normalBias = .03;
    fire.shadow.radius = 2;
    staticDirty = true;
  }
  const shadow = fire.shadow as typeof fire.shadow & { _frustum: Frustum; __worldWhitelist?: boolean };
  if (!shadow.__worldWhitelist) {
    shadow.__worldWhitelist = true;
    const lightPos = new Vector3();
    shadow.getFrustum = function (this: typeof shadow, face?: number) {
      fire!.getWorldPosition(lightPos);
      applyFirePass(face ?? 0, this._frustum, { position: lightPos, range: FIRE_RANGE + 2 });
      return this._frustum;
    };
  }
  if (shadow.mapSize.x !== size) { shadow.map?.dispose(); shadow.map = null; shadow.mapSize.set(size, size); staticDirty = true; }
  // Dynamic casters in range: the followed body (guide or the car being driven) and any vehicle near the fire.
  const vehicles = vehiclePositions(scene);
  const d = Math.hypot(focus[0] - FIRE_XZ[0], focus[2] - FIRE_XZ[1]);
  const dynamicIn = d < FIRE_RANGE + 1.5 || vehicles.some(v => Math.hypot(v[0] - FIRE_XZ[0], v[2] - FIRE_XZ[1]) < FIRE_RANGE + 3);
  shadow.autoUpdate = false;
  const render = dynamicIn || dynamicWasIn || staticDirty;
  if (render) { shadow.needsUpdate = true; renders++; staticDirty = false; }
  dynamicWasIn = dynamicIn;
  Object.assign(info, { found: true, name: fire.name || '(unnamed WorldEnvironment fire key)', mapSize: size, distanceToFocus_m: d, mode: dynamicIn ? 'every-frame' : 'static-held', dynamicInRange: dynamicIn, renders,
    near_m: fire.shadow.camera.near, far_m: fire.distance, bias: fire.shadow.bias, normalBias: fire.shadow.normalBias, intensity: fire.intensity, renderedThisFrame: render });
  const debug = (window as unknown as { __worldDebug?: Record<string, unknown> }).__worldDebug;
  if (debug) {
    // Budget probe (tools/world/playtest/budget-peak.mjs): per-pass / per-zone draws of one real frame.
    debug.budget ??= createBudgetProbe(scene, () => qa.renderer, () => (qa.sun?.shadow as unknown as { _cameras?: unknown[] })?._cameras ?? []);
    debug.fireShadowInfo ??= () => ({ ...info, light: useWorldStore.getState().light, position: fire?.getWorldPosition(new Vector3()).toArray() ?? null });
    // QA-only A/B switches for evidence (never reachable on the normal entry).
    debug.shadowQa ??= {
      guideCastShadow: (on: boolean) => { let n = 0; scene.getObjectByName('world-guide-G24')?.traverse(o => { if ((o as { isMesh?: boolean }).isMesh) { o.castShadow = on; n++; } }); return n; },
      fireShadowIntensity: (k: number) => { if (fire) fire.shadow.intensity = k; return fire?.shadow.intensity ?? null; },
      fireCastShadow: (on: boolean) => { qaFireOff = !on; staticDirty = true; if (fire) fire.castShadow = on; return fire?.castShadow ?? null; },
      occlusion: (on: boolean) => { occlusionQa.enabled = on; return on; },
      occlusionInfo: () => occlusionQa.last?.debug() ?? null,
      /** Per-pass draw-call/triangle breakdown of the next frame (wraps renderer.renderBufferDirect once). */
      frameBreakdown: () => new Promise(resolve => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = qa.renderer as { renderBufferDirect: (...a: any[]) => void; shadowMap: { render: (...a: any[]) => void } } | null;
        if (!r) return resolve(null);
        const orig = r.renderBufferDirect, origShadow = r.shadowMap.render;
        let pass = 'main', firstFrame = -1;
        const rows = new Map<string, { pass: string; name: string; calls: number; triangles: number }>();
        r.shadowMap.render = function (this: unknown, ...a: unknown[]) { pass = 'shadow'; try { return origShadow.apply(this, a); } finally { pass = 'main'; } };
        r.renderBufferDirect = function (this: unknown, cam: { isOrthographicCamera?: boolean; isPerspectiveCamera?: boolean; uuid: string }, sc: unknown, geometry: { index: { count: number } | null; attributes: { position?: { count: number } }; drawRange: { count: number } }, material: unknown, object: { name: string; parent?: { name: string } | null; count?: number; isInstancedMesh?: boolean; isSkinnedMesh?: boolean }, group: { count: number } | null) {
          const n = group ? group.count : Math.min(geometry.drawRange.count, geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0);
          const inst = object.isInstancedMesh ? object.count ?? 1 : 1;
          const sunIdx = ((qa.sun?.shadow as unknown as { _cameras: unknown[] })?._cameras ?? []).indexOf(cam);
          const who = pass === 'main' ? 'main' : sunIdx >= 0 ? `sun-c${sunIdx}` : 'fire-cube';
          const name = object.name || object.parent?.name || '(unnamed)';
          const frameNo = (qa.renderer as { info: { render: { frame: number } } }).info.render.frame;
          if (firstFrame < 0) firstFrame = frameNo;
          if (frameNo !== firstFrame) return orig.apply(this, [cam, sc, geometry, material, object, group]);
          const key = who + '|' + name;
          const row = rows.get(key) ?? { pass: who, name, calls: 0, triangles: 0 };
          row.calls++; row.triangles += n / 3 * inst; rows.set(key, row);
          return orig.apply(this, [cam, sc, geometry, material, object, group]);
        };
        requestAnimationFrame(() => requestAnimationFrame(() => {
          r.renderBufferDirect = orig; r.shadowMap.render = origShadow;
          resolve([...rows.values()].sort((a, b) => b.triangles - a.triangles));
        }));
      }),
      /** Inventory of shadow casters: name, instances, triangles per instance, bounds, depth/distance materials. */
      casters: () => { const out: unknown[] = []; scene.traverse(o => { const m = o as unknown as { isMesh?: boolean; castShadow: boolean; visible: boolean; name: string; parent: Object3D | null; geometry: { index: { count: number } | null; attributes: Record<string, { count: number }>; boundingSphere: { radius: number } | null; computeBoundingSphere(): void }; isInstancedMesh?: boolean; count?: number; frustumCulled: boolean; customDepthMaterial?: unknown; customDistanceMaterial?: unknown; getWorldPosition(v: Vector3): Vector3 }; if (!m.isMesh || !m.castShadow) return; const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); out.push({ name: m.name || m.parent?.name, instances: m.isInstancedMesh ? m.count : 1, tris: (g.index ? g.index.count : g.attributes.position.count) / 3, radius: g.boundingSphere?.radius, at: m.getWorldPosition(new Vector3()).toArray().map(v => +v.toFixed(1)), culled: m.frustumCulled, depth: !!m.customDepthMaterial, distance: !!m.customDistanceMaterial, wind: !!g.attributes._wind, cloth: !!g.attributes._cloth, visible: m.visible }); }); return out; },
      /** Fragment-source facts of compiled programs that receive the sun shadow. */
      programs: () => { const r = qa.renderer as { info: { programs: { name: string; cacheKey: string; program: WebGLProgram }[] }; getContext(): WebGL2RenderingContext } | null; if (!r) return null; const gl = r.getContext(); return r.info.programs.map(p => { const sh = gl.getAttachedShaders(p.program) ?? []; const src = sh.map(x => gl.getShaderSource(x) ?? '').join('\n'); const hasPoint = src.includes('pointShadowMap'); const hasMain = src.includes('getShadowMask') || src.includes('RE_Direct'); const i = src.indexOf('NUM_SUN'); const j = src.indexOf('NUM_DIR_LIGHT_SHADOWS'); return { name: p.name, len: src.length, window: src.includes('WORLD_SUN_WINDOW'), sunShadows: src.includes('sunShadowMap'), cascades3: src.includes('SUN_LIGHT_CASCADES 3'), snippet: i >= 0 ? src.slice(i, i + 120) : 'none', dir: j >= 0 ? src.slice(j, j + 40) : 'none', dirShadow: src.includes('directionalShadowMap'), hasPoint, hasMain, shaders: sh.length }; }); },
      /** Hide the guide from the main pass only (colorWrite/depthWrite off); its shadow passes are unchanged. */
      guideColor: (on: boolean) => { let n = 0; scene.getObjectByName('world-guide-G24')?.traverse(o => { const m = (o as { material?: { colorWrite: boolean; depthWrite: boolean } | { colorWrite: boolean; depthWrite: boolean }[] }).material; if (!m) return; for (const x of Array.isArray(m) ? m : [m]) { x.colorWrite = on; x.depthWrite = on; n++; } }); return n; },
      sunBias: (bias_m: number | null, normal_m: number | null) => { shadowBiasQa.bias_m = bias_m; shadowBiasQa.normal_m = normal_m; return { ...shadowBiasQa }; },
      /** Per-frame totals of the next n rendered frames (all passes; read in scene.onAfterRender). */
      frameSeries: (n: number) => new Promise(resolve => {
        const r = qa.renderer as { info: { render: { calls: number; triangles: number } } } | null;
        if (!r) return resolve(null);
        const rows: { calls: number; triangles: number; fire: boolean }[] = [];
        const previous = scene.onAfterRender;
        scene.onAfterRender = function (this: Object3D, ...a: Parameters<Object3D['onAfterRender']>) {
          rows.push({ calls: r.info.render.calls, triangles: r.info.render.triangles, fire: info.renderedThisFrame });
          if (rows.length >= n) { scene.onAfterRender = previous; const c = rows.map(x => x.calls).sort((x, y) => x - y), t = rows.map(x => x.triangles).sort((x, y) => x - y);
            resolve({ frames: rows.length, fireFrames: rows.filter(x => x.fire).length, calls: { max: c.at(-1), p50: c[c.length >> 1], min: c[0] }, triangles: { max: t.at(-1), p50: t[t.length >> 1], min: t[0] } }); }
          return previous.apply(this, a);
        };
      }),
      vehicleVisible: (on: boolean) => { let n = 0; scene.traverse(o => { if (o.userData.vehicle) { o.traverse(c => { if ((c as { isMesh?: boolean }).isMesh) { c.visible = on; n++; } }); } }); return n; },
      sunShadowIntensity: (k: number) => { if (qa.sun) qa.sun.shadow.intensity = k; return qa.sun?.shadow.intensity ?? null; },
      guideVisible: (on: boolean) => { const g = scene.getObjectByName('world-guide-G24'); if (g) g.visible = on; return !!g; },
      /** World points -> drawing-buffer pixels (origin top-left) with this frame's camera. */
      project: (points: number[][], w: number, h: number) => points.map(p => { qaPoint.set(p[0], p[1], p[2]).project(qa.camera!); return [(qaPoint.x + 1) / 2 * w, (1 - qaPoint.y) / 2 * h, qaPoint.z]; }),
      /** Drawing-buffer pixel -> intersection with the horizontal plane at height y. */
      groundHit: (px: number, py: number, w: number, h: number, y: number) => {
        qaRay.setFromCamera(qaNdc.set(px / w * 2 - 1, 1 - py / h * 2), qa.camera!);
        const d = qaRay.ray.direction, o = qaRay.ray.origin; if (Math.abs(d.y) < 1e-6) return null;
        const t = (y - o.y) / d.y; return t > 0 ? [o.x + d.x * t, y, o.z + d.z * t] : null;
      },
    };
  }
}
