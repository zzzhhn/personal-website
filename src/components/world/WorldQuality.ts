import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Matrix4, Quaternion, Vector2, Vector3, type Object3D, type Mesh, type InstancedMesh } from 'three';
import { useWorldStore } from './store';

/** Drawing-buffer quality is based on the canvas size, with a bounded pixel budget.
 * A small high-quality canvas is supersampled to 1080 lines where the 2x cap allows it.
 * The debug API reports the actual result, never a marketing resolution label. */
export function useWorldResolution() {
  const { size, setDpr } = useThree();
  const quality = useWorldStore(s => s.quality);
  useEffect(() => {
    if (!size.width || !size.height) return;
    const high = quality === 'high';
    const budget = high ? 2560 * 1440 : 1920 * 1080;
    const desired = high ? Math.max(window.devicePixelRatio, 1080 / size.height) : window.devicePixelRatio;
    setDpr(Math.min(high ? 2 : 1.5, desired, Math.sqrt(budget / (size.width * size.height))));
  }, [size.width, size.height, quality, setDpr]);
}

export function objectIdentity(object?: Object3D, bodyData?: unknown) {
  let name: string | null = null, assetId: string | null = null;
  const data = { ...(bodyData as Record<string, unknown> | undefined) };
  for (let o = object; o; o = o.parent ?? undefined) {
    name ??= o.name || null;
    assetId ??= o.userData.assetId ?? null;
    Object.assign(data, o.userData);
  }
  return { name, assetId, kind: data.surface ? 'surface' : (data.vehicleId || data.vehicle) ? 'vehicle' : data.obstacle ? 'obstacle' : data.solid ? 'solid' : 'unknown' };
}
const aabb = (box: Box3) => ({ min: box.min.toArray(), max: box.max.toArray() });

/** Read-only QA geometry listing. This lists source visual primitives individually; it does
 * not claim their whole AABB is solid (tents have openings; trees collide only at the trunk). */
export function visualInventory(scene: Object3D) {
  const entries: unknown[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const meta = objectIdentity(mesh);
    if (meta.kind !== 'solid') return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return;
    const instanced = mesh as InstancedMesh;
    const instances: { aabb: ReturnType<typeof aabb> }[] = [];
    if (instanced.isInstancedMesh) {
      const matrix = new Matrix4();
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
        instances.push({ aabb: aabb(box.clone().applyMatrix4(matrix)) });
      }
    }
    entries.push({ ...meta, name: mesh.name || meta.name, solid: true, semantic: mesh.userData.semantic ?? null,
      aabb: aabb(box.clone().applyMatrix4(mesh.matrixWorld)), ...(instances.length ? { instances } : {}) });
  });
  return entries;
}

/** Shape-specific bounds for QA only. Indexed geometry uses referenced vertices, excluding
 * unused tent ropes/stakes that happen to share the GLB source vertex buffer. */
export function colliderBounds(shape: { vertices?: Float32Array; indices?: Uint32Array | null; halfExtents?: { x: number; y: number; z: number }; radius?: number; halfHeight?: number; type: number }, translation: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number; w: number }, capsule = false) {
  const box = new Box3(), p = new Vector3();
  const matrix = new Matrix4().compose(new Vector3(translation.x, translation.y, translation.z), new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), new Vector3(1, 1, 1));
  if (shape.vertices) {
    const vertices = shape.vertices;
    const indices = shape.indices ?? Array.from({ length: vertices.length / 3 }, (_, i) => i);
    for (const i of indices) box.expandByPoint(p.fromArray(vertices, i * 3).applyMatrix4(matrix));
  } else {
    const r = shape.radius ?? 0;
    const h = shape.halfExtents ?? { x: r, y: (shape.halfHeight ?? 0) + (capsule || !shape.halfHeight ? r : 0), z: r };
    for (let i = 0; i < 8; i++) box.expandByPoint(p.set((i & 1 ? 1 : -1) * h.x, (i & 2 ? 1 : -1) * h.y, (i & 4 ? 1 : -1) * h.z).applyMatrix4(matrix));
  }
  return aabb(box);
}
export const renderSize = new Vector2();

/** Shadow texel budget per quality tier (shadows v4.1, spec v3 §14.3: total sun texels capped at v4's
 * 2 x 3072^2 / 2 x 1536^2). The sun uses a 3-cascade atlas row of fixed-size windows:
 * high 3 x 2508^2 (18.87 M texels, ~75 MB depth), balanced 3 x 1254^2 (4.72 M, ~19 MB).
 * The campfire cube (6 faces, whitelist casters only) is 1024 high / 512 balanced. */
export const SHADOW_BUDGET = {
  high: { sunCascade: 2508, fireCube: 1024 },
  balanced: { sunCascade: 1254, fireCube: 512 },
} as const;
export type ShadowTier = keyof typeof SHADOW_BUDGET;

// ------------------------------------------------------------------------------ on-screen budget
/** Per-zone on-screen budget (SESSION-RULES §5; docs/world/render/budget.md). Zone rows are the main pass of
 * that zone; `shadow` is every shadow submission (sun cascades + campfire cube) whoever casts it; `total` is
 * the whole frame (main + shadow), the hard line. */
export const BUDGET_ZONES = {
  'sky-sea': { calls: 3, triangles: 40_000 },
  terrain: { calls: 8, triangles: 80_000 },
  grass: { calls: 2, triangles: 40_000 },
  camp: { calls: 40, triangles: 60_000 },
  town: { calls: 45, triangles: 80_000 },
  park: { calls: 40, triangles: 55_000 },
  street: { calls: 30, triangles: 30_000 },
  vehicles: { calls: 18, triangles: 30_000 },
  character: { calls: 6, triangles: 12_000 },
  greybox: { calls: 0, triangles: 0 },
  other: { calls: 0, triangles: 0 },
} as const;
export const BUDGET_SHADOW = { calls: 85, triangles: 68_000 } as const;
export const BUDGET_TOTAL = { calls: 300, triangles: 500_000 } as const;
export type BudgetZone = keyof typeof BUDGET_ZONES;

/** Name rules, nearest ancestor first. Any object can override with userData.budgetZone (a BudgetZone);
 * districts mounted under world-town / world-park / world-street / world-camp-content are classified by
 * their mount group, so new GLBs need no tagging. Shadow proxies point back with userData.budgetSource. */
const ZONE_RULES: [RegExp, BudgetZone][] = [
  [/^(world-sea|world-sky|world-seabed|greybox-seabed)/, 'sky-sea'],
  [/^(island-terrain|v4-paved|v4-ridge)/, 'terrain'],
  [/^(ground-grass|ground-pebbles)/, 'grass'],
  [/^world-guide/, 'character'],
  [/^(world-vehicle|vehicle-)/, 'vehicles'],
  [/^(world-town|greybox-building|world-years)/, 'town'],
  [/^(world-park|park-plaza|greybox-submerged-plaza)/, 'park'],
  [/^(world-street|v4-knock|v4-windmill|v4-decor|v4-markings)/, 'street'],
  [/^(world-camp|camp-|world-fire-static)/, 'camp'],
  [/^(world-greybox-environment|world-districts-v4|world-surface|world-solid|v4-)/, 'greybox'],
];
export function budgetZoneOf(object: Object3D | null | undefined): BudgetZone {
  for (let o = object; o; o = o.parent ?? undefined) {
    const u = o.userData;
    if (u.budgetSource) return budgetZoneOf(u.budgetSource as Object3D);
    if (typeof u.budgetZone === 'string' && u.budgetZone in BUDGET_ZONES) return u.budgetZone as BudgetZone;
    if (u.vehicle || u.vehicleId) return 'vehicles';
    if (o.name) for (const [re, zone] of ZONE_RULES) if (re.test(o.name)) return zone;
  }
  return 'other';
}

type Cost = { calls: number; triangles: number };
type DrawGeometry = { index: { count: number } | null; attributes: { position?: { count: number } }; drawRange: { start: number; count: number }; isInstancedBufferGeometry?: boolean; instanceCount?: number };
type DrawObject = Object3D & { count?: number; isInstancedMesh?: boolean; isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
type ProbeRenderer = {
  render: (...a: unknown[]) => void; renderBufferDirect: (...a: unknown[]) => void;
  shadowMap: { render: (...a: unknown[]) => void }; info: { render: { calls: number; triangles: number; frame: number } };
  getPixelRatio(): number; getContext(): WebGL2RenderingContext;
};
const add = (row: Cost, calls: number, triangles: number) => { row.calls += calls; row.triangles += triangles; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));

/** QA-only budget probe, installed as __worldDebug.budget (WorldLights). All reads are of the real render
 * path: renderBufferDirect is wrapped for exactly one renderer.render call, so totals equal gl.info. */
export function createBudgetProbe(scene: Object3D, renderer: () => unknown, sunCameras: () => readonly unknown[] = () => []) {
  const gl = () => renderer() as ProbeRenderer | null;
  /** One frame, every draw: pass (main / sun-cN / fire), zone, object. */
  const frame = (top = 25) => new Promise(resolve => {
    const r = gl();
    if (!r) return resolve(null);
    const origRender = r.render, origDraw = r.renderBufferDirect, origShadow = r.shadowMap.render;
    let capture = false, pass = 'main';
    const byPass: Record<string, Cost> = {}, byZone: Record<string, { main: Cost; shadow: Cost }> = {};
    const objects = new Map<string, { pass: string; zone: string; name: string; calls: number; triangles: number }>();
    const zoneCache = new Map<Object3D, BudgetZone>();
    r.shadowMap.render = function (this: unknown, ...a: unknown[]) { pass = 'shadow'; try { return origShadow.apply(this, a); } finally { pass = 'main'; } };
    r.renderBufferDirect = function (this: unknown, ...a: unknown[]) {
      if (capture) {
        const cam = a[0] as { isOrthographicCamera?: boolean }, geometry = a[2] as DrawGeometry, object = a[4] as DrawObject, group = a[5] as { start: number; count: number } | null;
        const vertices = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
        let n = Math.max(0, Math.min(vertices - (geometry.drawRange.start ?? 0), geometry.drawRange.count));
        if (group) n = Math.min(n, group.count);
        const instances = object.isInstancedMesh ? object.count ?? 1 : geometry.isInstancedBufferGeometry ? geometry.instanceCount ?? 1 : 1;
        const triangles = object.isMesh ? Math.floor(n / 3) * instances : 0;
        const sunIdx = pass === 'main' ? -1 : sunCameras().indexOf(cam);
        const who = pass === 'main' ? 'main' : sunIdx >= 0 ? `sun${sunIdx}` : cam.isOrthographicCamera ? 'sun' : 'fire';
        let zone = zoneCache.get(object);
        if (!zone) { zone = budgetZoneOf(object); zoneCache.set(object, zone); }
        add(byPass[who] ??= { calls: 0, triangles: 0 }, 1, triangles);
        const z = byZone[zone] ??= { main: { calls: 0, triangles: 0 }, shadow: { calls: 0, triangles: 0 } };
        add(who === 'main' ? z.main : z.shadow, 1, triangles);
        const name = object.name || object.parent?.name || '(unnamed)', key = `${who}|${zone}|${name}`;
        const row = objects.get(key) ?? { pass: who, zone, name, calls: 0, triangles: 0 };
        add(row, 1, triangles); objects.set(key, row);
      }
      return origDraw.apply(this, a);
    };
    r.render = function (this: unknown, ...a: unknown[]) {
      capture = true;
      try { return origRender.apply(this, a); } finally {
        capture = false;
        r.render = origRender; r.renderBufferDirect = origDraw; r.shadowMap.render = origShadow;
        const total = Object.values(byPass).reduce((s, c) => ({ calls: s.calls + c.calls, triangles: s.triangles + c.triangles }), { calls: 0, triangles: 0 });
        const sh = Object.entries(byPass).filter(([k]) => k !== 'main').map(([, v]) => v);
        const shadow = { calls: sh.reduce((a, v) => a + v.calls, 0), triangles: sh.reduce((a, v) => a + v.triangles, 0) };
        byPass.sun = { calls: 0, triangles: 0 };
        for (const [k, v] of Object.entries(byPass)) if (/^sun\d$/.test(k)) add(byPass.sun, v.calls, v.triangles);
        resolve({ total, info: { calls: r.info.render.calls, triangles: r.info.render.triangles }, byPass, shadow, byZone,
          top: [...objects.values()].sort((p, q) => q.triangles - p.triangles || q.calls - p.calls).slice(0, top),
          topCalls: [...objects.values()].sort((p, q) => q.calls - p.calls).slice(0, top) });
      }
    };
  });
  /** Whole-frame gl.info over n frames (max and median). */
  const series = async (n = 6) => {
    const rows: Cost[] = [];
    for (let i = 0; i < n; i++) { await nextFrame(); const r = gl(); if (r) rows.push({ calls: r.info.render.calls, triangles: r.info.render.triangles }); }
    const c = rows.map(x => x.calls).sort((a, b) => a - b), t = rows.map(x => x.triangles).sort((a, b) => a - b);
    return { frames: rows.length, calls: { max: c.at(-1) ?? 0, p50: c[c.length >> 1] ?? 0 }, triangles: { max: t.at(-1) ?? 0, p50: t[t.length >> 1] ?? 0 } };
  };
  /** Hide every renderable of each zone (incl. its shadow proxies), measure, restore: cost = baseline - hidden. */
  const hideDiff = async (zones: BudgetZone[] = Object.keys(BUDGET_ZONES) as BudgetZone[], frames = 4) => {
    const base = await series(frames), out: Record<string, unknown> = { baseline: base };
    for (const zone of zones) {
      const hidden: Object3D[] = [];
      scene.traverse(o => { const d = o as DrawObject; if ((d.isMesh || d.isPoints || d.isLine || d.isSprite) && o.visible && budgetZoneOf(o) === zone) { o.visible = false; hidden.push(o); } });
      if (!hidden.length) { out[zone] = { objects: 0 }; continue; }
      await nextFrame();
      const s = await series(frames);
      for (const o of hidden) o.visible = true;
      out[zone] = { objects: hidden.length, calls: base.calls.p50 - s.calls.p50, triangles: base.triangles.p50 - s.triangles.p50 };
    }
    await nextFrame();
    return out;
  };
  /** Lights that reach material shaders (three compiles every light into every lit material). */
  const lights = () => {
    const out = { point: 0, pointLit: 0, spot: 0, directional: 0, hemisphere: 0, shadowCasting: [] as string[], points: [] as { name: string; intensity: number; distance: number; castShadow: boolean }[] };
    scene.traverse(o => {
      const l = o as Object3D & { isPointLight?: boolean; isSpotLight?: boolean; isDirectionalLight?: boolean; isHemisphereLight?: boolean; intensity?: number; distance?: number; castShadow: boolean };
      if (!o.visible) return;
      if (l.isPointLight) { out.point++; if ((l.intensity ?? 0) > 0) out.pointLit++; out.points.push({ name: o.name || '(unnamed)', intensity: +(l.intensity ?? 0).toFixed(2), distance: l.distance ?? 0, castShadow: l.castShadow }); }
      if (l.isSpotLight) out.spot++;
      if (l.isDirectionalLight) out.directional++;
      if (l.isHemisphereLight) out.hemisphere++;
      if ((l.isPointLight || l.isSpotLight || l.isDirectionalLight) && l.castShadow) out.shadowCasting.push(o.name || o.type);
    });
    return out;
  };
  /** Renderable inventory per zone (static size; not what is drawn this frame). */
  const inventory = () => {
    const out: Record<string, { objects: number; triangles: number }> = {};
    scene.traverse(o => {
      const d = o as DrawObject & { geometry?: { index: { count: number } | null; attributes: { position?: { count: number } } } };
      if (!d.isMesh || !d.geometry) return;
      const n = d.geometry.index ? d.geometry.index.count : d.geometry.attributes.position?.count ?? 0;
      const row = out[budgetZoneOf(o)] ??= { objects: 0, triangles: 0 };
      row.objects++; row.triangles += Math.floor(n / 3) * (d.isInstancedMesh ? d.count ?? 1 : 1);
    });
    return out;
  };
  return { zones: BUDGET_ZONES, shadowBudget: BUDGET_SHADOW, totalBudget: BUDGET_TOTAL, frame, series, hideDiff, lights, inventory, zoneOf: (name: string) => budgetZoneOf(scene.getObjectByName(name)) };
}
