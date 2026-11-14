import { Material, Mesh, Raycaster, Sphere, Vector3, type Camera, type InstancedMesh, type Object3D } from 'three';
import { useWorldStore } from './store.ts';

/**
 * One cached corridor variant per mesh. `applied` means the copy is currently on the mesh; an inactive entry keeps
 * its copies (and therefore its compiled program reference) so re-entering the corridor does not recompile.
 */
type Fade = { mesh: Mesh; source: Material | Material[]; members: Material[]; geometry: Mesh['geometry']; copies: Material[];
  versions: number[]; amount: { value: number }; active: boolean; applied: boolean; idle: number };
/** Inactive cached variants are released after this long unused, or oldest-first above the cap. */
const CACHE_IDLE_S = 90, CACHE_MAX_INACTIVE = 128;

/**
 * View-corridor fade (shadows v4): any solid scene object between the camera and the player or the
 * driven vehicle fades only inside a narrow cylinder around the sight line; the rest of the object,
 * and other instances sharing its draw call, stay opaque (world-space mask in the fragment shader;
 * wind/cloth hooks of the source material are chained).
 *
 * Candidates are no longer a fixed asset-ID list. A mesh qualifies when it (or an ancestor) has
 * userData.occluder, or when it casts a shadow and is visible: in this scene castShadow is exactly
 * the set of solid things (camp GLBs, trees, bushes, rocks, tents, benches, buildings, greybox
 * blocks and canopies). Excluded: the player/guide (assetId G24), vehicles (userData.vehicle),
 * walkable surfaces (userData.surface; terrain, sea and grass do not cast shadows anyway) and
 * anything tagged userData.noOcclusionFade. The candidate list refreshes every 0.5 s, so assets
 * that stream in later are picked up. The sea is handled in its own material (environment).
 *
 * The sight line follows whatever the camera does (free orbit yaw/pitch, 2.5-30 m); first person
 * (camera at the pivot) disables the fade.
 */
/** QA only (?qa=1 toggles it through __worldDebug.shadowQa): false disables the fade for A/B evidence. */
export const occlusionQa: { enabled: boolean; last: WorldOcclusion | null } = { enabled: true, last: null };
const sphere = new Sphere(), closest = new Vector3(), dir = new Vector3(), aim = new Vector3(), side = new Vector3();

function excluded(o: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) {
    const u = p.userData;
    if (u.noOcclusionFade || u.shadowProxy || u.vehicle || u.vehicleId || u.surface || u.assetId === 'G24' || u.assetId === 'alpha-mine' || p.name === 'world-guide-G24') return true;
  }
  return false;
}
function assetOf(o: Object3D): string | null {
  for (let p: Object3D | null = o; p; p = p.parent) if (typeof p.userData.assetId === 'string') return p.userData.assetId;
  return null;
}
function flagged(o: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.userData.occluder) return true;
  return false;
}

const listOf = (m: Material | Material[]) => Array.isArray(m) ? m : [m];
/** Does `current` still hold exactly `members` (same array-ness, length and members; in-place array edits count)? */
function holds(current: Material | Material[], members: Material[], array: boolean) {
  if (Array.isArray(current) !== array) return false;
  const list = listOf(current);
  return list.length === members.length && list.every((m, i) => m === members[i]);
}
function attachedTo(o: Object3D, root: Object3D) {
  let p: Object3D | null = o;
  while (p.parent) p = p.parent;
  return p === root;
}
/** Re-read the source's current properties into a cached copy (colours, maps, intensities set since it was made). */
function syncCopy(copy: Material, original: Material, version: number) {
  const shaderCopy = copy as Material & { uniforms?: Record<string, { value: unknown }> };
  const uniforms = shaderCopy.uniforms;
  copy.copy(original);
  if (uniforms) {
    // Keep the uniform objects the compiled program is bound to; take the source's live values.
    const live = (original as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms ?? {};
    shaderCopy.uniforms = uniforms;
    for (const k of Object.keys(live)) if (uniforms[k]) uniforms[k].value = live[k].value;
  }
  copy.transparent = true; copy.depthWrite = false;
  // Source defines/maps changed through needsUpdate: rebuild the variant too.
  if (original.version !== version) copy.needsUpdate = true;
}

export class WorldOcclusion {
  private ray = new Raycaster();
  private meshes: Mesh[] = [];
  private elapsed = 1;
  private fades = new Map<Mesh, Fade>();
  private start = { value: new Vector3() };
  private end = { value: new Vector3() };
  private radius = { value: new Vector3(1.1, 1.6, 0) };
  private blockers: string[] = [];
  private stats = { candidates: 0, tested: 0, rays: 0, ms: 0 };
  update(scene: Object3D, camera: Camera, target: Vector3, dt: number) {
    const t0 = performance.now();
    occlusionQa.last = this;
    const driving = !!useWorldStore.getState().activeVehicle;
    this.start.value.copy(camera.position); this.end.value.copy(target);
    // Corridor radius (inner, outer) in metres: a person vs. a car body seen from the chase camera.
    this.radius.value.set(driving ? 1.9 : 1.1, driving ? 2.5 : 1.6, 0);
    this.elapsed += dt;
    if (this.elapsed > .5 || !this.meshes.length) {
      this.elapsed = 0; this.meshes = [];
      scene.traverse(o => {
        const m = o as Mesh;
        if (!m.isMesh || !m.visible) return;
        if ((m.castShadow || flagged(m)) && !excluded(m)) this.meshes.push(m);
      });
      this.prune(scene);
    }
    const hitMeshes = new Set<Mesh>();
    const length = camera.position.distanceTo(target);
    let tested = 0, rays = 0;
    if (length > .6 && occlusionQa.enabled) {
      // Body sample points: head pivot down to the feet on foot; roof, centre and both flanks in a car.
      dir.subVectors(target, camera.position).normalize();
      side.set(-dir.z, 0, dir.x).normalize();
      const offsets: [number, number][] = driving ? [[0, 0], [0, -.9], [1.1, -.5], [-1.1, -.5]] : [[0, 0], [0, .45], [0, -.65], [0, -1.25]];
      // Cheap prefilter: world bounding sphere vs. the camera-target segment (widened by the corridor).
      const near: Mesh[] = [];
      for (const m of this.meshes) {
        // Instanced meshes: the mesh-level sphere covers every instance (the geometry's covers one).
        const im = m as InstancedMesh, g = m.geometry;
        if (im.isInstancedMesh) { if (!im.boundingSphere) im.computeBoundingSphere(); } else if (!g.boundingSphere) g.computeBoundingSphere();
        const local = im.isInstancedMesh ? im.boundingSphere : g.boundingSphere;
        if (!local) continue;
        sphere.copy(local).applyMatrix4(m.matrixWorld);
        const t = Math.max(0, Math.min(length, closest.subVectors(sphere.center, camera.position).dot(dir)));
        closest.copy(camera.position).addScaledVector(dir, t);
        if (closest.distanceTo(sphere.center) <= sphere.radius + 2.6) near.push(m);
      }
      tested = near.length;
      if (near.length) for (const [s, y] of offsets) {
        aim.copy(target).addScaledVector(side, s); aim.y += y;
        this.ray.set(camera.position, dir.clone().subVectors(aim, camera.position).normalize());
        this.ray.far = Math.max(0, camera.position.distanceTo(aim) - .35);
        this.ray.intersectObjects(near, false).forEach(h => hitMeshes.add(h.object as Mesh));
        rays++;
      }
      // Layered assets (three crown shells, canvas + trim): a ray may hit only one layer while the others
      // still cover the body. Fade every near-corridor part of a hit asset; the mask keeps it local.
      const hitAssets = new Set([...hitMeshes].map(assetOf).filter(Boolean));
      if (hitAssets.size) for (const m of near) if (hitAssets.has(assetOf(m))) hitMeshes.add(m);
    }
    this.blockers = [...hitMeshes].map(m => m.name || m.parent?.name || '(unnamed)');
    for (const fade of this.fades.values()) fade.active = false;
    for (const mesh of hitMeshes) {
      let fade = this.fades.get(mesh);
      // Owner changed the material (swap or in-place array edit) or geometry: the variant is stale, drop it.
      if (fade && this.stale(fade)) { this.release(fade, true); fade = undefined; }
      if (!fade) {
        const source = mesh.material, amount = { value: 0 };
        const copies = listOf(source).map(original => {
          const copy = original.clone();
          copy.transparent = true; copy.depthWrite = false;
          copy.onBeforeCompile = (shader, renderer) => {
            original.onBeforeCompile.call(copy, shader, renderer);
            shader.uniforms.uViewFadeStart = this.start; shader.uniforms.uViewFadeEnd = this.end;
            shader.uniforms.uViewFade = amount; shader.uniforms.uViewFadeRadius = this.radius;
            shader.vertexShader = 'varying vec3 vViewFadeWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
              vec4 fadePosition = vec4(transformed, 1.0);
              #ifdef USE_INSTANCING
                fadePosition = instanceMatrix * fadePosition;
              #endif
              vViewFadeWorld = (modelMatrix * fadePosition).xyz;`);
            shader.fragmentShader = 'varying vec3 vViewFadeWorld;\nuniform vec3 uViewFadeStart;\nuniform vec3 uViewFadeEnd;\nuniform float uViewFade;\nuniform vec3 uViewFadeRadius;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', `
              vec3 fadeRay = uViewFadeEnd - uViewFadeStart;
              float fadeT = dot(vViewFadeWorld-uViewFadeStart, fadeRay) / max(dot(fadeRay, fadeRay), 0.001);
              float fadeDistance = length(vViewFadeWorld-(uViewFadeStart+clamp(fadeT,0.0,1.0)*fadeRay));
              float fadeMask = (1.0-smoothstep(uViewFadeRadius.x,uViewFadeRadius.y,fadeDistance)) * step(0.0,fadeT) * step(fadeT,0.98);
              // Leaf layers accumulate opacity; leave only a 1% hint at the corridor centre.
              diffuseColor.a *= 1.0 - 0.99 * uViewFade * fadeMask;
              #include <alphatest_fragment>`);
          };
          // Read live: a source whose own hook changes later gets a matching variant key.
          copy.customProgramCacheKey = () => original.customProgramCacheKey() + '-view-corridor-v2';
          return copy;
        });
        fade = { mesh, source, members: [...listOf(source)], geometry: mesh.geometry, copies, versions: listOf(source).map(m => m.version),
          amount, active: true, applied: false, idle: 0 };
        this.fades.set(mesh, fade);
        this.created++;
      } else if (!fade.applied) {
        // Reuse: same program (no compile), current source properties.
        fade.copies.forEach((copy, i) => { syncCopy(copy, fade!.members[i], fade!.versions[i]); fade!.versions[i] = fade!.members[i].version; });
        this.reused++;
      }
      if (!fade.applied) { mesh.material = this.target(fade); fade.applied = true; fade.amount.value = 0; }
      fade.active = true; fade.idle = 0;
    }
    for (const fade of [...this.fades.values()]) {
      if (!fade.applied) { fade.idle += dt; continue; }
      // An external replacement made during an active fade wins; never write our source back over it.
      if (this.stale(fade)) { this.release(fade, true); continue; }
      fade.amount.value += ((fade.active ? 1 : 0) - fade.amount.value) * (1 - Math.exp(-dt * 12));
      if (!fade.active && fade.amount.value < .01) {
        // Back to the untouched source; the copies stay cached (not disposed) for the next pass.
        fade.mesh.material = fade.source;
        fade.applied = false; fade.amount.value = 0; fade.idle = 0;
      }
    }
    this.stats = { candidates: this.meshes.length, tested, rays, ms: performance.now() - t0 };
  }
  private created = 0;
  private reused = 0;
  private released = 0;
  /** A fresh array per application, so in-place edits by the owner are detectable and never touch `copies`. */
  private target(fade: Fade): Material | Material[] { return Array.isArray(fade.source) ? [...fade.copies] : fade.copies[0]; }
  private stale(fade: Fade) {
    const array = Array.isArray(fade.source);
    // Also catches the owner editing its own source array in place while our copy is applied.
    return fade.mesh.geometry !== fade.geometry || !holds(fade.source, fade.members, array)
      || !holds(fade.mesh.material, fade.applied ? fade.copies : fade.members, array);
  }
  /** Free a cached variant. `restore` puts the source back only if our (now disposed) copy is still on the mesh;
   * an external replacement is left alone. */
  private release(fade: Fade, restore: boolean) {
    if (restore && fade.applied && holds(fade.mesh.material, fade.copies, Array.isArray(fade.source))) fade.mesh.material = fade.source;
    fade.copies.forEach(m => m.dispose()); this.fades.delete(fade.mesh); this.released++;
  }
  /** Bounded cache: drop variants of unmounted meshes, swapped materials, long-idle entries and the oldest beyond the cap. */
  private prune(scene: Object3D) {
    const idle: Fade[] = [];
    for (const fade of [...this.fades.values()]) {
      if (fade.applied) continue;
      if (!attachedTo(fade.mesh, scene) || this.stale(fade) || fade.idle > CACHE_IDLE_S) this.release(fade, true);
      else idle.push(fade);
    }
    if (idle.length > CACHE_MAX_INACTIVE) idle.sort((a, b) => b.idle - a.idle).slice(0, idle.length - CACHE_MAX_INACTIVE).forEach(f => this.release(f, false));
  }
  debug() {
    return { blockers: this.blockers, fades: [...this.fades.values()].filter(f => f.applied).map(f => ({ name: f.mesh.name || f.mesh.parent?.name || '(unnamed)', amount: f.amount.value, scope: 'view corridor only' })),
      corridor_m: this.radius.value.toArray().slice(0, 2), ...this.stats,
      cache: { entries: this.fades.size, created: this.created, reused: this.reused, released: this.released } };
  }
  dispose() { for (const f of [...this.fades.values()]) this.release(f, true); this.fades.clear(); }
}
