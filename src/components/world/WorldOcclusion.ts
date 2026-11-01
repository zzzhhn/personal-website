import { Material, Mesh, Raycaster, Sphere, Vector3, type Camera, type InstancedMesh, type Object3D } from 'three';
import { useWorldStore } from './store.ts';

type Fade = { mesh: Mesh; source: Material | Material[]; copies: Material[]; amount: { value: number }; active: boolean };

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
      if (!fade) {
        const source = mesh.material, amount = { value: 0 };
        const copies = (Array.isArray(source) ? source : [source]).map(original => {
          const copy = original.clone();
          const originalKey = original.customProgramCacheKey();
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
          copy.customProgramCacheKey = () => originalKey + '-view-corridor-v2';
          return copy;
        });
        mesh.material = Array.isArray(source) ? copies : copies[0];
        fade = { mesh, source, copies, amount, active: true }; this.fades.set(mesh, fade);
      }
      fade.active = true;
    }
    for (const [mesh, fade] of this.fades) {
      fade.amount.value += ((fade.active ? 1 : 0) - fade.amount.value) * (1 - Math.exp(-dt * 12));
      if (!fade.active && fade.amount.value < .01) {
        mesh.material = fade.source; fade.copies.forEach(m => m.dispose()); this.fades.delete(mesh);
      }
    }
    this.stats = { candidates: this.meshes.length, tested, rays, ms: performance.now() - t0 };
  }
  debug() {
    return { blockers: this.blockers, fades: [...this.fades.values()].map(f => ({ name: f.mesh.name || f.mesh.parent?.name || '(unnamed)', amount: f.amount.value, scope: 'view corridor only' })),
      corridor_m: this.radius.value.toArray().slice(0, 2), ...this.stats };
  }
  dispose() { for (const f of this.fades.values()) { f.mesh.material = f.source; f.copies.forEach(m => m.dispose()); } this.fades.clear(); }
}
