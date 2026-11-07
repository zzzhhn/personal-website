/** User-visible controls, compiled only in the local review build. */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useWorldStore, selectWorldTime } from '../../../src/components/world/store';
import { WORLD_SHOTS } from '../../../src/components/world/layout';
import { climate } from '../../../src/components/world/WorldNight';
import { shadowChunkWork } from '../../../src/components/world/WorldShadows';
import { worldActorDebug } from '../../../src/components/world/WorldActors';
import { campColliderRecords } from '../../../src/components/world/WorldCampPhysics';
import { windUniforms } from '../../../src/components/world/WorldWind';

export default function TentPilotReview() {
  const { gl, camera, scene, invalidate } = useThree();
  const variant = new URLSearchParams(window.location.search).get('tentCraft') === 'legacy' ? 'before' : 'after';
  const probe = useRef({ active: false, previous: 0, warm: 0, start: 0, frame: [] as number[], calls: [] as number[], tris: [] as number[], output: null as HTMLOutputElement | null });
  const result = useRef<unknown>(null);
  useEffect(() => {
    const root = document.createElement('aside');
    root.setAttribute('aria-label', '帐篷验收');
    root.style.cssText = 'position:fixed;z-index:9998;top:10px;left:10px;background:#102c32ed;color:white;padding:8px;font:12px system-ui;max-width:510px';
    const body = document.createElement('div'), toggle = document.createElement('button');
    toggle.textContent = '收起验收';
    toggle.onclick = () => { body.hidden = !body.hidden; toggle.textContent = body.hidden ? '展开验收' : '收起验收'; };
    root.append(toggle, body);
    const add = (name: string, action: () => void) => { const b = document.createElement('button'); b.textContent = name; b.style.cssText = 'margin:3px;padding:5px'; b.onclick = action; body.append(b); };
    const shots = document.createElement('select'); shots.setAttribute('aria-label', '帐篷验收视角');
    for (const shot of WORLD_SHOTS.filter(s => s.id.startsWith('tent-pilot-'))) shots.append(new Option(shot.id, shot.id));
    shots.value = useWorldStore.getState().shot ?? '';
    shots.onchange = () => { probe.current.active = false; useWorldStore.setState({ shot: shots.value, paused: false, timeRunning: false }); selectWorldTime(shots.value.endsWith('-night') ? 'night' : 'noon'); invalidate(); };
    body.append(shots);
    const out = document.createElement('output'); out.setAttribute('aria-label', '帐篷验收结果'); out.style.cssText = 'display:block;white-space:pre-wrap;max-height:140px;overflow:auto'; probe.current.output = out;
    let pauseCheck: ReturnType<typeof setTimeout> | undefined;
    add('读取资产', () => {
      const tent = scene.getObjectByName('camp-asset-C03-large-tent'), mats = new Map(); let meshes = 0, clothVertices = 0, depthMaterials = 0;
      tent?.traverse((o: any) => {
        if (!o.isMesh) return; meshes++; clothVertices += o.geometry.attributes._cloth?.count ?? 0; depthMaterials += Number(!!o.customDepthMaterial);
        for (const m of [o.material].flat()) if (m?.name && !mats.has(m.name)) mats.set(m.name, { name: m.name, uv: !!o.geometry.attributes.uv, map: !!m.map, normal: !!m.normalMap, rough: !!m.roughnessMap, env: !!m.envMap, mapColorSpace: m.map?.colorSpace, normalColorSpace: m.normalMap?.colorSpace, anisotropy: m.normalMap?.anisotropy });
      });
      const actor = worldActorDebug.snapshot();
      out.textContent = JSON.stringify({ variant, meshes, clothVertices, depthMaterials, materials: [...mats.values()], colliders: campColliderRecords().filter(c => c.id === 'C03'), player: actor.player, grounded: actor.grounded, windTime: windUniforms.uWindTime.value, paused: useWorldStore.getState().paused, loading: useWorldStore.getState().loading.active, shadow: shadowChunkWork().pending });
    });
    add('检查门洞', () => {
      const actor = worldActorDebug.snapshot();
      if (!actor.physicsStep) { out.textContent = '请先点击门前试玩，让物理世界完成初始化，再检查通道。'; return; }
      // The existing entrance pad is 10 cm above camp ground. A flat shape cast
      // isolates the doorway above it; actual stepping is checked by walking.
      const height = 4.99 + actor.playerCollider.centerHeight;
      out.textContent = JSON.stringify({
        doorway: worldActorDebug.castPlayer([-42, height, 16], [-42, height, 13]),
        sideWall: worldActorDebug.castPlayer([-38, height, 12.5], [-42, height, 12.5]),
        exit: worldActorDebug.castPlayer([-42, height, 13], [-42, height, 16]),
      });
    });
    add('测量 360 帧', () => { Object.assign(probe.current, { active: true, previous: 0, warm: 0, start: performance.now(), frame: [], calls: [], tris: [] }); out.textContent = '等待加载收敛，预热 90 帧并采集 360 帧'; invalidate(); });
    add('输出测量', () => { out.textContent = JSON.stringify(result.current); });
    add('门前试玩', () => { probe.current.active = false; worldActorDebug.teleportPlayer([-42, 4.8 + worldActorDebug.snapshot().playerCollider.centerHeight, 17]); useWorldStore.setState({ shot: null, paused: false, timeRunning: false }); invalidate(); });
    add('暂停', () => { probe.current.active = false; useWorldStore.setState({ paused: true }); });
    add('检查暂停风钟', () => { probe.current.active = false; const before = windUniforms.uWindTime.value; useWorldStore.setState({ paused: true }); clearTimeout(pauseCheck); pauseCheck = setTimeout(() => { out.textContent = JSON.stringify({ before, after: windUniforms.uWindTime.value, paused: useWorldStore.getState().paused }); }, 1500); });
    body.append(out); document.body.append(root);
    return () => { probe.current.active = false; clearTimeout(pauseCheck); root.remove(); };
  }, [variant, gl, camera, scene, invalidate]);
  useFrame(() => {
    const p = probe.current; if (!p.active) return;
    const now = performance.now(), state = useWorldStore.getState();
    if (document.hidden || state.paused) { p.active = false; if (p.output) p.output.textContent = '测量中断'; return; }
    if (state.loading.active || shadowChunkWork().pending || climate.blend < 1) { p.previous = 0; p.warm = 0; invalidate(); if (now - p.start > 60000) { p.active = false; if (p.output) p.output.textContent = '加载未收敛'; } return; }
    if (p.previous && p.warm++ >= 90) { p.frame.push(now - p.previous); p.calls.push(gl.info.render.calls); p.tris.push(gl.info.render.triangles); }
    p.previous = now;
    if (p.frame.length >= 360) {
      const summarize = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { n: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) }; };
      result.current = { variant, shot: state.shot, camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: 'fov' in camera ? camera.fov : null, exposure: gl.toneMappingExposure, canvas: [gl.domElement.width, gl.domElement.height], dpr: gl.getPixelRatio(), frameMs: summarize(p.frame), calls: summarize(p.calls), triangles: summarize(p.tris), memory: { ...gl.info.memory }, windTime: windUniforms.uWindTime.value };
      p.active = false; if (p.output) p.output.textContent = JSON.stringify(result.current);
    } else invalidate();
  }, -58);
  return null;
}
