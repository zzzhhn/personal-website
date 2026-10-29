import { AnimationMixer, LoopOnce, Quaternion, SkinnedMesh, Vector3, type AnimationAction, type AnimationClip, type Bone, type Object3D } from 'three';
import { skinnedWorldPoint } from './WorldGuideStop.ts';

/** Fallback rear-buttock patch datum. Actual cloned geometry is calibrated below at load time. */
export const GUIDE_SEAT_CONTACT_Y = .3555;

/** A seated surface is the buttock contact datum. The standing approach may start on a bench,
 * but must never become a lower bound on the final seated root. Use the current safe body root
 * as standingY on StandUp, rather than the surface cached before sitting. */
export function guideSeatRootY(standingY: number, seatY: number, weight: number, contactY = GUIDE_SEAT_CONTACT_Y) {
  const w = Math.min(1, Math.max(0, weight));
  return standingY * (1 - w) + (seatY - contactY) * w;
}

/** SitIdle is a measured 0.533 s settling take (asset loop:false), not a periodic gesture.
 * Keep its original settle once, then hold its relaxed last pose until StandUp replaces it. */
export function holdGuideSeatIdle(action: AnimationAction) {
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  return action;
}

type ContactPoint = { mesh: SkinnedMesh; index: number; weight: number };

/** A fixed bilateral patch of the actual rear trouser underside. The previous measurement took
 * the lowest thigh/shin vertex (0.239 m), 11 cm below the buttocks, and left the sitter floating.
 * Select downward faces around the pelvis in the settled pose, then the lower 14 mm band of
 * their posterior pelvis/upper-thigh vertices. Area weights and both sides define support, not one extremum.
 * References are retained after material merging and evaluated after each animation/additive. */
export class GuideSeatContact {
  readonly reference = new Vector3(-.4616, GUIDE_SEAT_CONTACT_Y, .0066);
  readonly points: ContactPoint[] = [];
  private p = new Vector3();
  private scene: Object3D;
  constructor(scene: Object3D, clips: AnimationClip[]) {
    this.scene = scene;
    const clip = clips.find(c => c.name === 'SitIdle'), pelvis = scene.getObjectByName('pelvis');
    if (!clip || !pelvis) return;
    const saved: { node: Object3D; p: Vector3; q: Quaternion; s: Vector3 }[] = [];
    scene.traverse(node => saved.push({ node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }));
    const mixer = new AnimationMixer(scene), action = holdGuideSeatIdle(mixer.clipAction(clip)).play();
    mixer.update(clip.duration); scene.updateWorldMatrix(true, true);
    const hip = pelvis.getWorldPosition(new Vector3()), candidates: (ContactPoint & { position: Vector3 })[] = [];
    scene.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return;
      const ids = o.geometry.getAttribute('skinIndex'), ws = o.geometry.getAttribute('skinWeight'), index = o.geometry.index;
      if (!ids || !ws) return;
      const pelvisWeight = (i: number) => { let w = 0; for (let k = 0; k < 4; k++) if (o.skeleton.bones[ids.getComponent(i, k)]?.name === 'pelvis') w += ws.getComponent(i, k); return w; };
      for (let t = 0; t < (index?.count ?? ids.count); t += 3) {
        const ii = [0, 1, 2].map(k => index ? index.getX(t + k) : t + k);
        if (ii.reduce((sum, i) => sum + pelvisWeight(i), 0) / 3 < .55) continue;
        const pp = ii.map(i => skinnedWorldPoint(o, i, new Vector3()));
        const centre = pp[0].clone().add(pp[1]).add(pp[2]).divideScalar(3);
        const normal = pp[1].clone().sub(pp[0]).cross(pp[2].clone().sub(pp[0]));
        const area = normal.length() / 2; normal.normalize();
        if (normal.y > -.3 || centre.x > hip.x + .03 || centre.x < hip.x - .12 || Math.abs(centre.z - hip.z) > .17 || centre.y > hip.y - .03 || centre.y < hip.y - .16) continue;
        ii.forEach((i, k) => { const p = pp[k]; if (pelvisWeight(i) >= .1 && p.x <= hip.x + .03 && Math.abs(p.z - hip.z) < .17) candidates.push({ mesh: o, index: i, weight: area / 3, position: p }); });
      }
    });
    const low = Math.min(...candidates.map(p => p.position.y));
    // Deduplicate hard-normal seams so triangulation density cannot favour one buttock.
    const unique = new Map<string, ContactPoint & { position: Vector3 }>();
    for (const p of candidates) if (p.position.y <= low + .014) {
      const key = p.position.toArray().map(x => x.toFixed(5)).join(',');
      const old = unique.get(key); if (old) old.weight += p.weight; else unique.set(key, { ...p });
    }
    const selected = [...unique.values()];
    const sides = [selected.filter(p => p.position.z < hip.z), selected.filter(p => p.position.z >= hip.z)];
    if (sides.every(side => side.length >= 2)) for (const side of sides) {
      const total = side.reduce((sum, p) => sum + p.weight, 0);
      for (const p of side) this.points.push({ mesh: p.mesh, index: p.index, weight: p.weight / total / 2 });
    }
    if (this.points.length) this.sample(this.reference);
    action.stop(); mixer.uncacheRoot(scene);
    for (const { node, p, q, s } of saved) { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }
    scene.updateWorldMatrix(true, true);
  }
  sample(out: Vector3) {
    if (!this.points.length) return out.copy(this.reference);
    this.scene.updateWorldMatrix(true, true); out.set(0, 0, 0);
    for (const p of this.points) out.addScaledVector(skinnedWorldPoint(p.mesh, p.index, this.p), p.weight);
    return out;
  }
}

/** Small authored upper-body life over the held CMU settle. No pelvis or leg writer; restore()
 * runs before the next mixer evaluation, including on hidden/exit paths, preventing accumulation. */
export class GuideSeatedIdle {
  elapsed = 0;
  private entries: { bone: Bone; base: Quaternion; yaw: Vector3; pitch: Vector3; applied: boolean }[] = [];
  private q = new Quaternion();
  constructor(scene: Object3D) {
    scene.updateWorldMatrix(true, true); const sceneQ = scene.getWorldQuaternion(new Quaternion());
    scene.traverse(o => {
      if (!(o as Bone).isBone || !/^(head|chest|spine)$/.test(o.name)) return;
      const inverse = o.getWorldQuaternion(new Quaternion()).invert();
      const axis = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(sceneQ).applyQuaternion(inverse).normalize();
      this.entries.push({ bone: o as Bone, base: new Quaternion(), yaw: axis(0, 1, 0), pitch: axis(0, 0, 1), applied: false });
    });
  }
  restore() { for (const e of this.entries) if (e.applied) { e.bone.quaternion.copy(e.base); e.applied = false; } }
  reset() { this.restore(); this.elapsed = 0; }
  apply(dt: number, eligible: boolean) {
    if (!eligible) { this.elapsed = 0; return; }
    this.elapsed += dt;
    const fade = Math.min(1, this.elapsed / 1.4), breath = Math.sin(this.elapsed * Math.PI * 2 / 4.7) * fade;
    const cycle = this.elapsed % 19, look = cycle > 8 && cycle < 12.2 ? Math.sin(Math.PI * (cycle - 8) / 4.2) ** 2 : 0;
    const direction = Math.floor(this.elapsed / 19) % 2 ? -1 : 1;
    for (const e of this.entries) {
      e.base.copy(e.bone.quaternion); e.applied = true;
      const head = e.bone.name === 'head', chest = e.bone.name === 'chest';
      e.bone.quaternion.multiply(this.q.setFromAxisAngle(e.pitch, breath * (head ? -.004 : chest ? .012 : .004)))
        .multiply(this.q.setFromAxisAngle(e.yaw, look * direction * (head ? .15 : chest ? .025 : 0)));
    }
  }
}
