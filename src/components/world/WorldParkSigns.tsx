import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { BufferAttribute, BufferGeometry, CanvasTexture, Matrix4, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ParkLOD } from './WorldParkLOD';
import { HUTS, HUT_FRONT_Z } from './WorldParkLayout';
import { gltfPieces, gltfTrimesh, mergeBatch, parkMaterial, parkUrl, withDraco, yawMatrix, type GLTF } from './WorldParkKit';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import type { Vec3, WorldProject } from './types';

type Sign = { id: string; project?: WorldProject; matrix: Matrix4; position: Vec3; width: number; height: number; bottom: number };
function ProjectSignInput({ sign }: { sign: Sign }) {
  useInteractable({ id: sign.id, kind: 'sign', position: sign.position, radius: 1.65,
    label: { en: `Read ${sign.project?.title ?? ''}`, zh: `了解${sign.project?.titleZh ?? ''}` },
    onInteract: () => { if (sign.project) useWorldStore.setState({ card: { kind: 'project', id: sign.project.slug } }); } });
  return null;
}
/** P05/P19: shallow wooden signs. Shared GLB frame batch + one non-emissive bilingual canvas atlas.
 * Physical board/post geometry is imported once and supplies the fixed collision in the same matrix.
 */
export default function WorldParkSigns({ projects }: { projects: WorldProject[] }) {
  const lang = useWorldStore(s => s.lang);
  const gltf = useLoader(GLTFLoader, parkUrl('signs'), withDraco) as GLTF;
  const built = useMemo(() => {
    const signs: Sign[] = [{ id: 'park-directory', matrix: yawMatrix([51.7, 1.15, -50.4], 0), position: [51.7, 2.6, -50.4], width: 2.4, height: 1.3, bottom: 1 }];
    HUTS.forEach(h => {
      const p = h.local(h.width / 2 - 0.72, 0, HUT_FRONT_Z - 0.85);
      signs.push({ id: `park-project-${h.id}`, project: projects.find(v => v.slug === h.slug), matrix: yawMatrix(p, h.yaw),
        position: h.local(h.width / 2 - 0.72, 1.0, HUT_FRONT_Z - 0.35), width: 1.1, height: .72, bottom: .7 });
    });
    const pieces: BufferGeometry[] = [], faces: BufferGeometry[] = [];
    const colliders = signs.map((s, i) => {
      const root = gltf.scene.getObjectByName(i ? 'P19' : 'P05');
      if (!root) throw new Error('signs.glb is missing its sign variant');
      const part = gltfPieces(root, s.matrix, () => true);
      part.forEach(g => { (g.getAttribute('aEmit').array as Float32Array).fill(0); });
      pieces.push(...part);
      const face = new PlaneGeometry(s.width - .03, s.height - .03);
      const uv = face.getAttribute('uv') as BufferAttribute;
      for (let v = 0; v < uv.count; v++) uv.setY(v, 1 - (i + 1 - uv.getY(v)) / 8);
      face.applyMatrix4(s.matrix.clone().multiply(new Matrix4().makeTranslation(0, s.bottom + s.height / 2, .034)));
      faces.push(face);
      return gltfTrimesh(root, s.matrix, () => true);
    });
    return { signs, colliders, body: mergeBatch(pieces), faces: mergeGeometries(faces) };
  }, [gltf, projects]);
  const atlas = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 4096;
    const ctx = c.getContext('2d')!;
    const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
    const mat = new MeshStandardMaterial({ map: tex, roughness: .95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    return { canvas: c, ctx, tex, mat };
  }, []);
  useEffect(() => {
    const { ctx, canvas, tex } = atlas, W = canvas.width, rowH = canvas.height / 8;
    ctx.fillStyle = '#E6DCCB'; ctx.fillRect(0, 0, W, canvas.height);
    const wrap = (text: string, x: number, y: number, max: number, line: number, maxLines: number) => {
      const words = lang === 'zh' ? [...text] : text.split(/\s+/).map(w => w + ' ');
      let cur = '', n = 0;
      for (const word of words) { if (ctx.measureText(cur + word).width > max && cur) { ctx.fillText(cur.trim(), x, y + n++ * line); cur = word; if (n >= maxLines - 1) break; } else cur += word; }
      if (cur && n < maxLines) ctx.fillText(cur.trim(), x, y + n * line);
    };
    built.signs.forEach((s, i) => {
      ctx.save(); ctx.translate(0, i * rowH);
      // Compensate atlas tile aspect so glyphs retain natural proportions on both board sizes.
      const naturalH = W * s.height / s.width; ctx.scale(1, rowH / naturalH);
      ctx.fillStyle = '#4E647D'; ctx.font = '600 26px Geist, "PingFang SC", sans-serif';
      ctx.fillText(lang === 'zh' ? '项目园区' : 'PROJECT PARK', 52, 52);
      ctx.fillStyle = '#3B332B';
      if (!s.project) {
        ctx.font = '600 52px Geist, "PingFang SC", sans-serif'; ctx.fillText(lang === 'zh' ? '在这里，把想法做出来' : 'Ideas, made tangible', 52, 123);
        ctx.font = '500 28px Geist, "PingFang SC", sans-serif';
        HUTS.forEach((h, j) => { const p = projects.find(v => v.slug === h.slug); if (p) ctx.fillText(`${String(j + 1).padStart(2, '0')}  ${lang === 'zh' ? p.titleZh : p.title}`, 52, 190 + j * 46, W - 104); });
      } else {
        const p = s.project, title = lang === 'zh' ? p.titleZh : p.title;
        let size = 58; ctx.font = `600 ${size}px Geist, "PingFang SC", sans-serif`;
        while (ctx.measureText(title).width > W - 104 && size > 31) ctx.font = `600 ${--size}px Geist, "PingFang SC", sans-serif`;
        ctx.fillText(title, 52, 142);
        ctx.font = '500 35px Geist, "PingFang SC", sans-serif'; wrap(lang === 'zh' ? p.taglineZh : p.tagline, 52, 220, W - 104, 51, 4);
        ctx.fillStyle = '#4E647D'; ctx.font = '600 30px Geist, "PingFang SC", sans-serif';
        const status = p.maintenance === 'actively-maintained' ? (lang === 'zh' ? '持续维护' : 'Actively maintained') : p.maintenance === 'completed' ? (lang === 'zh' ? '已完结' : 'Completed') : (lang === 'zh' ? '已归档' : 'Archived');
        ctx.fillText(status, 52, naturalH - 110);
        ctx.fillStyle = '#6D6256'; ctx.font = '500 27px Geist, "PingFang SC", sans-serif'; ctx.fillText(lang === 'zh' ? 'E · 阅读项目卡片' : 'E · Read project card', 52, naturalH - 48);
      }
      ctx.restore();
    }); tex.needsUpdate = true;
  }, [atlas, built.signs, lang, projects]);
  useEffect(() => () => { built.body.dispose(); built.faces?.dispose(); }, [built]);
  useEffect(() => () => { atlas.tex.dispose(); atlas.mat.dispose(); }, [atlas]);
  return <group name="park-signs">
    <ParkLOD id="signs" center={[64, 1.14, -28]} nearTriangles={7 * 720 + 14} near={<><mesh name="park-sign-frames" geometry={built.body} material={parkMaterial()} castShadow receiveShadow userData={{ solid: true, occluder: true }} />
    <mesh name="park-sign-text" geometry={built.faces!} material={atlas.mat} receiveShadow />
    </>} />
    {built.colliders.map((c, i) => <RigidBody key={built.signs[i].id} name={built.signs[i].id} type="fixed" colliders={false} userData={{ solid: true, interactable: built.signs[i].id }}>
      <TrimeshCollider args={[c.vertices, c.indices]} friction={.65} restitution={.03} />
    </RigidBody>)}
    {built.signs.filter(s => s.project).map(s => <ProjectSignInput key={s.id} sign={s} />)}
  </group>;
}
