import { Matrix4, Vector3, type InstancedMesh, type Mesh, type Object3D } from 'three';

export type SuitcaseContactSlot = {
  root: Object3D | null; revision: number; fade: number; update: (() => void) | null;
  register: (root: Object3D) => () => void;
};
export function createSuitcaseContactSlot(): SuitcaseContactSlot {
  const slot: SuitcaseContactSlot = { root: null, revision: 0, fade: 1, update: null, register(root) {
    const revision = ++slot.revision; slot.root = root;
    return () => { if (slot.revision === revision) { slot.root = null; slot.revision++; } };
  } };
  return slot;
}

export type ContactWheel = { vertices: Float64Array; radiusX: number; radiusZ: number };
/** Extract connected rubber shells once, in the ready C15 root's local frame. The four lowest
 * shells are its actual tires; handles and corner bumpers are separate, higher components. */
export function suitcaseContactWheels(root: Object3D): ContactWheel[] {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), local = new Matrix4(), point = new Vector3();
  const components: { vertices: Float64Array; low: number; dx: number; dz: number }[] = [];
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.name !== 'camp_craft_rubber' || !/^C15_case(?:_|$)/.test(mesh.name)) return;
    local.multiplyMatrices(inverse, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const ids: number[] = [], keys = new Map<string, number>(), points: number[][] = [], parents: number[] = [];
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(local);
      const key = `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`;
      let id = keys.get(key);
      if (id === undefined) { id = points.length; keys.set(key, id); points.push([point.x, point.y, point.z]); parents.push(id); }
      ids.push(id);
    }
    const find = (i: number): number => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    const count = index?.count ?? position.count, at = (i: number) => ids[index ? index.getX(i) : i];
    for (let i = 0; i < count; i += 3) { parents[find(at(i + 1))] = find(at(i)); parents[find(at(i + 2))] = find(at(i)); }
    const groups = new Map<number, number[]>();
    points.forEach((xyz, i) => { const key = find(i), values = groups.get(key) ?? []; values.push(...xyz); groups.set(key, values); });
    for (const values of groups.values()) {
      let low = Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < values.length; i += 3) { x0 = Math.min(x0, values[i]); x1 = Math.max(x1, values[i]); low = Math.min(low, values[i + 1]); z0 = Math.min(z0, values[i + 2]); z1 = Math.max(z1, values[i + 2]); }
      components.push({ vertices: new Float64Array(values), low, dx: x1 - x0, dz: z1 - z0 });
    }
  });
  const low = Math.min(...components.map(component => component.low));
  const wheels = components.filter(component => component.low < low + .003);
  // Unknown/future packs fail closed instead of drawing shadows under guessed corners.
  if (wheels.length !== 4) return [];
  // Expose a narrow 30 mm halo beyond each real tire shell; support checks still gate every corner.
  return wheels.map(wheel => ({ vertices: wheel.vertices, radiusX: wheel.dx / 2 + .03, radiusZ: wheel.dz / 2 + .03 }));
}

export type ContactSupport = { heightAt: (x: number, z: number) => number | null };
/** Cache only real, upward-facing triangles from the finite flagstone mesh, including its
 * instance transforms. No collider plane, scene query or raycast is involved in pose updates. */
export function suitcaseContactSupport(root: Object3D): ContactSupport {
  root.updateWorldMatrix(true, true);
  const triangles: number[][] = [], matrix = new Matrix4(), instance = new Matrix4();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3(), edge = new Vector3();
  root.traverse(object => {
    const mesh = object as InstancedMesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index?.count ?? position.count, at = (i: number) => index ? index.getX(i) : i;
    for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(n, instance); matrix.multiplyMatrices(mesh.matrixWorld, instance); }
      else matrix.copy(mesh.matrixWorld);
      for (let i = 0; i < count; i += 3) {
        a.fromBufferAttribute(position, at(i)).applyMatrix4(matrix); b.fromBufferAttribute(position, at(i + 1)).applyMatrix4(matrix); c.fromBufferAttribute(position, at(i + 2)).applyMatrix4(matrix);
        normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
        if (normal.y < .95) continue;
        const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(denominator) > 1e-10) triangles.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, denominator]);
      }
    }
  });
  return { heightAt(x, z) {
    let height: number | null = null;
    for (const t of triangles) {
      const u = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / t[9];
      const v = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / t[9];
      if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
      const y = u * t[1] + v * t[4] + (1 - u - v) * t[7];
      if (height === null || y > height) height = y;
    }
    return height;
  } };
}

export type ContactUpload = (change: 'pose' | 'fade' | 'hidden', positions: Float32Array, strengths: Float32Array, visible: boolean) => void;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** At most four quads. Stable poses return before vertex/support work, even while the body sleeps.
 * Fade-only changes reuse the last support solution. All output buffers are allocated once. */
export function createSuitcaseContactModel(wheels: ContactWheel[], support: ContactSupport, upload: ContactUpload) {
  const previous = new Float64Array(16).fill(NaN), positions = new Float32Array(48), strengths = new Float32Array(16), base = new Float64Array(4);
  let previousFade = NaN, previousInputVisible = false, shown = false, disposed = false, poseDirty = true;
  const hide = () => { if (shown) { shown = false; upload('hidden', positions, strengths, false); } };
  return {
    update(matrix: Matrix4, fade: number, visible = true) {
      if (disposed) return;
      const e = matrix.elements;
      let changed = visible !== previousInputVisible;
      for (let i = 0; i < 16; i++) if (e[i] !== previous[i]) { changed = true; break; }
      if (!changed && fade === previousFade) return;
      if (changed) {
        previous.set(e); previousInputVisible = visible; base.fill(0); poseDirty = true;
        const up = e[5] / Math.hypot(e[4], e[5], e[6]), tilt = smooth(.85, .985, up);
        const xLength = Math.hypot(e[0], e[2]), zLength = Math.hypot(e[8], e[10]);
        if (visible && tilt > 0 && xLength > 0 && zLength > 0 && wheels.length === 4) for (let wheelIndex = 0; wheelIndex < 4; wheelIndex++) {
          const wheel = wheels[wheelIndex], vertices = wheel.vertices;
          let minY = Infinity;
          for (let i = 0; i < vertices.length; i += 3) minY = Math.min(minY, e[1] * vertices[i] + e[5] * vertices[i + 1] + e[9] * vertices[i + 2] + e[13]);
          let x = 0, z = 0, samples = 0;
          for (let i = 0; i < vertices.length; i += 3) {
            const y = e[1] * vertices[i] + e[5] * vertices[i + 1] + e[9] * vertices[i + 2] + e[13];
            if (y > minY + .0003) continue;
            x += e[0] * vertices[i] + e[4] * vertices[i + 1] + e[8] * vertices[i + 2] + e[12];
            z += e[2] * vertices[i] + e[6] * vertices[i + 1] + e[10] * vertices[i + 2] + e[14]; samples++;
          }
          x /= samples; z /= samples;
          const height = support.heightAt(x, z);
          if (height === null) continue;
          const gap = minY - height;
          let strength = tilt * smooth(-.008, -.003, gap) * (1 - smooth(.003, .03, gap));
          if (strength <= 0) continue;
          for (let corner = 0; corner < 4; corner++) {
            const sx = corner === 0 || corner === 3 ? -1 : 1, sz = corner < 2 ? -1 : 1;
            const px = x + sx * wheel.radiusX * e[0] + sz * wheel.radiusZ * e[8];
            const pz = z + sx * wheel.radiusX * e[2] + sz * wheel.radiusZ * e[10];
            const cornerHeight = support.heightAt(px, pz);
            if (cornerHeight === null || Math.abs(cornerHeight - height) > .003) strength = 0;
            const offset = wheelIndex * 12 + corner * 3;
            positions[offset] = px; positions[offset + 1] = height + .0006; positions[offset + 2] = pz;
          }
          base[wheelIndex] = strength;
        }
      }
      previousFade = fade;
      let any = false;
      for (let wheel = 0; wheel < 4; wheel++) {
        const strength = base[wheel] * Math.max(0, Math.min(1, fade));
        strengths.fill(strength, wheel * 4, wheel * 4 + 4); if (strength > 0) any = true;
      }
      if (!any) { hide(); return; }
      upload(poseDirty ? 'pose' : 'fade', positions, strengths, true); shown = true; poseDirty = false;
    },
    dispose() { hide(); disposed = true; },
  };
}
