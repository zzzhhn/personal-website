import { memo, useEffect, useMemo } from 'react';
import { CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SpriteMaterial, SRGBColorSpace } from 'three';
import { Builder, cbox, type V3 } from '../WorldStreetGeometry.ts';
import { useWorldStore } from '../store';
import { ibdLocal, ibdReach, ibdStation, IBD_SLOTS, IBD_CARGO_HOME, IBD_MOVED_COIL, IBD_TRUCK } from './ibd-yard-layout.ts';
import { ibdGuideRoute, ibdGuideStep } from './ibd-yard-guide.ts';
import { yardItemJudged, yardItemDifferent, yardItemId } from './ibd-yard-game.ts';
import { useIbdYardStore } from './ibd-yard-store.ts';
import { buildIbdTools } from './ibd-yard-geometry.ts';
import { IBD_YARD } from './attraction-layout.ts';
import { sceneWorkProbe } from '../world-scene-work';

const paper = { color: '#f5efda', rough: .9, metal: 0 }, ink = { color: '#263e48', rough: .8, metal: 0 };
function workObjects() {
  const b = new Builder();
  cbox(b, [0, 0, 0], [.95, .06, .7], ink, .03);
  cbox(b, [0, .04, 0], [.82, .015, .58], paper, 0);
  for (let i = 0; i < 4; i++) cbox(b, [-.06, .052, -.18 + i * .11], [.5, .006, .025], ink, 0);
  cbox(b, [0, .08, -.29], [.28, .08, .1], ink, .02);
  return b.build();
}

/** Physical affordances remain when guidance is skipped: a manifest, a takeable kit and checked cargo. */
export default memo(function WorldIbdGuide() {
  const game = useIbdYardStore(s => s.game), enabled = useIbdYardStore(s => s.guideEnabled);
  const lang = useWorldStore(s => s.lang);
  const suppressed = useWorldStore(s => s.paused || !!s.card || s.poolInspect || !!s.shot || !!s.activeVehicle || !!s.seat);
  const step = ibdGuideStep(game), station = ibdStation(step.action.station, game.core.moved);
  const near = useWorldStore(s => s.nearbyInteract?.id === `ibd-${station.id}` && ibdReach(ibdLocal(s.position), station));
  const atWorkstation = useWorldStore(s => ibdReach(ibdLocal(s.position), station));
  const inYard = useWorldStore(s => Math.abs(s.position[0] - IBD_YARD.center[0]) <= IBD_YARD.size[0] / 2 + 4
    && Math.abs(s.position[2] - IBD_YARD.center[2]) <= IBD_YARD.size[1] / 2 + 6);
  const props = useMemo(() => sceneWorkProbe.measure('ibd-guide-props', () => ({ paper: workObjects(), tools: buildIbdTools(), stamp: new RingGeometry(.1, .16, 12),
    checked: new RingGeometry(.27, .42, 16), standing: new RingGeometry(.7, .87, 32),
    good: new MeshBasicMaterial({ color: '#84ce9b', toneMapped: false }), bad: new MeshBasicMaterial({ color: '#ee8252', toneMapped: false }),
    amber: new MeshBasicMaterial({ color: '#efbd57', toneMapped: false }),
    material: new MeshStandardMaterial({ vertexColors: true, roughness: .8, emissive: '#857b59', emissiveIntensity: .2 }) })), []);
  useEffect(() => () => { Object.values(props).forEach(resource => resource.dispose()); }, [props]);
  const cue = useMemo(() => sceneWorkProbe.measure('ibd-guide-cue', () => {
    const b = new Builder(), route = ibdGuideRoute(game, step);
    const paint = { color: '#efbd57', rough: 1, metal: 0 };
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], end = route[i + 1], dx = end[0] - a[0], dz = end[2] - a[2], length = Math.hypot(dx, dz);
      if (length < .1) continue;
      const ux = dx / length, uz = dz / length, uy = (end[1] - a[1]) / length;
      for (let d = .7; d < length - .4; d += 2.4) {
        const x = a[0] + ux * d, z = a[2] + uz * d;
        const p = (along: number, across: number): V3 => [x + ux * along - uz * across, a[1] + uy * (d + along), z + uz * along + ux * across];
        b.face([p(.45, 0), p(-.3, -.36), p(-.1, 0), p(-.3, .36)], paint, [0, 1, 0]);
      }
    }
    const geometry = b.build(), material = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 160;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#243740'; c.fillRect(0, 0, 768, 160);
    c.strokeStyle = near ? '#9bdfa8' : '#efbd57'; c.lineWidth = 8; c.strokeRect(4, 4, 760, 152);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#efbd57'; c.font = '500 26px sans-serif';
    c.fillText(`${game.pending ? (lang === 'zh' ? '正在作业' : 'WORKING') : near ? 'E / Y' : (lang === 'zh' ? '下一处' : 'NEXT')} · ${station.title[lang]}`, 384, 42, 724);
    c.fillStyle = '#fff5e1'; c.font = '600 39px sans-serif'; c.fillText(step.title[lang], 384, 106, 724);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const label = new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false });
    return { geometry, material, texture, label };
  }), [step.action.kind, step.action.station, game.completedAction?.station, game.core.moved, game.pending?.token, game.released, lang, near]);
  useEffect(() => () => { cue.geometry.dispose(); cue.material.dispose(); cue.texture.dispose(); cue.label.dispose(); }, [cue]);
  return <group name="ibd-work-guidance" dispose={null}>
    <mesh name="ibd-pickup-manifest" geometry={props.paper} material={props.material} position={[-3, .96, 26]} rotation={[.12, 0, 0]} scale={1.5} />
    <mesh name="ibd-takeable-tools" geometry={props.tools} material={props.material} position={[-6, 1.4, 19]} scale={1.6} visible={!game.equipped} />
    <mesh name="ibd-received-stamp" position={[-2.65, 1.06, 26.1]} rotation={[-Math.PI / 2, 0, 0]} visible={game.started} geometry={props.stamp} material={props.good} />
    {IBD_SLOTS.map(slot => {
      const id = yardItemId(game, slot), loaded = game.core.loaded.includes(id), checked = yardItemJudged(game, slot);
      const at = loaded ? IBD_TRUCK[slot]! : slot === 'coil-front' && game.core.moved.includes(id) ? IBD_MOVED_COIL : IBD_CARGO_HOME[slot];
      return <mesh key={slot} name={`ibd-cargo-checked-${slot}`} position={[at[0], at[1] + (slot.startsWith('coil') ? 2.35 : 1.55), at[2]]}
        rotation={[-Math.PI / 2, 0, 0]} visible={checked && !game.pending} geometry={props.checked} material={yardItemDifferent(game, slot) ? props.bad : props.good} />;
    })}
    <group visible={enabled && inYard && !suppressed && !game.released}>
      <mesh name="ibd-next-work-route" geometry={cue.geometry} material={cue.material} />
      <mesh name="ibd-next-work-standing-point" position={[station.at[0], station.id.startsWith('gallery') ? 4.13 : .15, station.at[2]]} rotation={[-Math.PI / 2, 0, 0]}
        geometry={props.standing} material={near ? props.good : props.amber} />
      <sprite name="ibd-next-work-label" visible={!atWorkstation && !game.pending}
        position={[station.at[0], station.at[1] + 2.25, station.at[2]]} scale={[4, .84, 1]} material={cue.label} renderOrder={10} />
    </group>
  </group>;
});
