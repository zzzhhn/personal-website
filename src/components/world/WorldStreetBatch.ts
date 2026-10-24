/**
 * Street props: one BatchedMesh per prop group (street session). Every kind contributes an L0 and an
 * L1 geometry; each instance picks its level by camera distance (hysteresis), is frustum culled per
 * object, dither-fades out beyond its far distance and while it resets (batch colour alpha). The
 * whole group is ONE draw call in the main pass; shadow passes cull per object against the cascade.
 *
 * BatchedMesh notes (three r186): the batch's own geometry holds kind-local vertices, so its
 * boundingSphere is replaced with the world sphere of all instance homes (+ margin) for scene-level
 * culling, WorldShadows' caster spheres and occlusion prefilters.
 */
import { BatchedMesh, BufferGeometry, Matrix4, Sphere, Vector3, Vector4, type Camera, type Material } from 'three';

export interface BatchKind { id: string; L0: BufferGeometry; L1: BufferGeometry; lodNear: number; far: number }
interface Inst { kind: number; geo: [number, number]; level: 0 | 1; fade: number; hidden: boolean; home: Vector3; radius: number; drawn: boolean }

const v = new Vector3(), white = new Vector4(1, 1, 1, 1), c4 = new Vector4();

export class StreetBatch {
  mesh: BatchedMesh;
  kinds: BatchKind[];
  private geo: [number, number][] = [];
  private inst: Inst[] = [];
  private matrices: Matrix4[] = [];
  readonly tris: [number, number][] = [];
  constructor(name: string, kinds: BatchKind[], counts: number[], material: Material) {
    this.kinds = kinds;
    let verts = 0, idx = 0, total = 0;
    kinds.forEach((k, i) => {
      verts += k.L0.getAttribute('position').count + k.L1.getAttribute('position').count;
      idx += k.L0.index!.count + k.L1.index!.count; total += counts[i];
    });
    this.mesh = new BatchedMesh(Math.max(1, total), verts, idx, material);
    this.mesh.name = name;
    this.mesh.sortObjects = false;
    this.mesh.perObjectFrustumCulled = true;
    for (const k of kinds) {
      this.geo.push([this.mesh.addGeometry(k.L0), this.mesh.addGeometry(k.L1)]);
      this.tris.push([k.L0.index!.count / 3, k.L1.index!.count / 3]);
    }
  }
  add(kind: number, matrix: Matrix4) {
    const id = this.mesh.addInstance(this.geo[kind][0]);
    this.mesh.setMatrixAt(id, matrix);
    this.mesh.setColorAt(id, white);
    const s = new Sphere(); this.kinds[kind].L0.computeBoundingSphere(); s.copy(this.kinds[kind].L0.boundingSphere!).applyMatrix4(matrix);
    this.inst[id] = { kind, geo: this.geo[kind], level: 0, fade: 1, hidden: false, home: s.center.clone(), radius: s.radius, drawn: true };
    this.matrices[id] = matrix.clone();
    return id;
  }
  /** After all instances: world culling sphere over every home (+ margin for knocked props). */
  finish(margin = 4) {
    const s = new Sphere().makeEmpty();
    for (const i of this.inst) s.union(new Sphere(i.home, i.radius));
    s.radius += margin;
    this.mesh.boundingSphere = s;
    this.mesh.geometry.boundingSphere = s.clone();
    this.mesh.frustumCulled = true;
  }
  setMatrix(id: number, m: Matrix4) { this.matrices[id].copy(m); this.mesh.setMatrixAt(id, m); }
  /** Add proximity tint while retaining the current reset/distance fade. */
  setTint(id: number, tint: number) { this.mesh.getColorAt(id, c4); c4.set(tint, tint, tint, c4.w); this.mesh.setColorAt(id, c4); }
  /** Visual fade 0..1 (dither) and logical hide (reset in progress). */
  setFade(id: number, fade: number) { this.inst[id].fade = fade; }
  setHidden(id: number, hidden: boolean) { this.inst[id].hidden = hidden; }
  get count() { return this.inst.length; }
  /** Per frame: LOD level, far dither and visibility. Returns { l0, l1 } drawn-triangle estimate. */
  update(camera: Camera) {
    const cam = camera.position;
    let t0 = 0, t1 = 0;
    for (let id = 0; id < this.inst.length; id++) {
      const it = this.inst[id], k = this.kinds[it.kind];
      v.setFromMatrixPosition(this.matrices[id]);
      const d = v.distanceTo(cam);
      const level: 0 | 1 = it.level === 0 ? (d > k.lodNear + 4 ? 1 : 0) : (d < k.lodNear - 4 ? 0 : 1);
      if (level !== it.level) { it.level = level; this.mesh.setGeometryIdAt(id, it.geo[level]); }
      const farFade = Math.min(1, Math.max(0, (k.far - d) / 12));
      const a = it.hidden ? 0 : it.fade * farFade, drawn = a > .02;
      if (drawn !== it.drawn) { it.drawn = drawn; this.mesh.setVisibleAt(id, drawn); }
      if (drawn) {
        this.mesh.getColorAt(id, c4);
        if (Math.abs(c4.w - a) > .01) { c4.set(1, 1, 1, a); this.mesh.setColorAt(id, c4); }
        if (level) t1 += this.tris[it.kind][1]; else t0 += this.tris[it.kind][0];
      }
    }
    return { l0: t0, l1: t1 };
  }
  dispose() { this.mesh.dispose(); for (const k of this.kinds) { k.L0.dispose(); k.L1.dispose(); } }
}
