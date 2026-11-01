import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, LatheGeometry, MeshStandardMaterial, PlaneGeometry, Vector2, type Group, type Mesh } from 'three';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import WorldAlphaArchiveTickets from './WorldAlphaArchiveTickets';
import { exchangeActionAudio } from './alpha-exchange-audio';
import { exchangeChamferBox } from './alpha-exchange-craft';
import { exchangeWorld } from './alpha-exchange-layout';
import { EXCHANGE_PLAY_PROPS as P, EXCHANGE_PLAY_STATIONS as S } from './alpha-exchange-play-layout';
import { exchangeBody } from './alpha-exchange-motion';
import { adjustExchangePlay, canRequestExchangePlay, requestExchangePlay, useExchangePlay,
  type ExchangePlayState, type ExchangePlayStationId } from './alpha-exchange-play';
import type { Vec3 } from './types';

export function exchangePlayInstruction(state: ExchangePlayState, zh: boolean): string {
  const t = (a: string, b: string) => zh ? a : b;
  if (state.loading) return t('正在读取历史，完成后请再次取票。', 'Loading history. Return to take a ticket when ready.');
  if (state.notice === 'error') return t('历史暂不可用，回档案台重试。', 'History unavailable. Retry at the archive.');
  const r = state.round;
  if (!r || state.ticketReturned) return t('档案台取完整票，后方柜中可选年份票。', 'Take the full ticket at the counter, or choose a year at the drawers behind it.');
  if (r.message === 'insufficient') return t('点数不足，降低仓位后重新封单。', 'Insufficient points. Lower the target and seal again.');
  return ({ ticket: t('将手中时段票插入中央票槽。', 'Insert the ticket at the central desk.'),
    selecting: t('点选铜轨档位；选定后靠近票槽按 E 封单。', 'Click a brass detent. At the slot, press E to seal.'),
    sealed: t('前往大钟下拉铃，推进一段历史。', 'Pull the bell under the clock to advance one historical interval.'),
    clearing: t('去清算室压印并领取回执。', 'Visit clearing to stamp and collect the receipt.'),
    complete: t('上回廊拨动复盘台；回档案室可重演。', 'Review upstairs at the gallery selector. Replay at the archive.'),
  })[r.phase];
}
function Station({ id }: { id: ExchangePlayStationId }) {
  const state = useExchangePlay(), r = state.round;
  const label = id === 'archive' ? state.loading ? ['历史读取中', 'Loading history']
    : state.notice === 'error' ? ['重试读取历史', 'Retry historical data'] : ['领取完整历史票', 'Take the full history ticket']
    : id === 'desk' ? r?.phase === 'ticket' ? ['插入时段票', 'Insert the ticket'] : ['封存当前仓位，送往开市钟', 'Seal the selected position']
    : id === 'bell' ? ['拉铃，推进历史', 'Pull bell to advance history'] : id === 'review'
    ? [state.reviewIndex === null ? '拨动复盘台，查看第一段选择' : state.reviewIndex + 1 < (r?.choices.length ?? 0) ? '拨动复盘台，查看下一段' : '拨回复盘台，查看市场总览',
      state.reviewIndex === null ? 'Turn selector: review first interval' : state.reviewIndex + 1 < (r?.choices.length ?? 0) ? 'Turn selector: next interval' : 'Turn selector: market overview']
    : ['压印并领取清算回执', 'Stamp and collect receipt'];
  const s = S[id];
  useInteractable({ id: `alpha-exchange-${id}`, kind: 'exhibit', position: exchangeWorld([...s.stand]), radius: 1.05,
    label: { zh: label[0], en: label[1] }, enabled: () => canRequestExchangePlay(id), onInteract: () => { void requestExchangePlay(id); } });
  return null;
}
const detent = (units: number): Vec3 => S.desk.slideStart.map((a, i) => a + (S.desk.slideEnd[i] - a) * units / 50) as Vec3;
function paperFaceGeometry(width: number, depth: number, rect: number[]) {
  const g = new PlaneGeometry(width,depth), uv = g.getAttribute('uv'), [x,y,w,h] = rect;
  for (let i=0;i<uv.count;i++) uv.setXY(i,(x+uv.getX(i)*w)/1024,1-(y+(1-uv.getY(i))*h)/1024);
  g.rotateX(-Math.PI/2); g.translate(0,.009,0); return g;
}
function Nudge({ direction }: { direction: -1 | 1 }) {
  const at = detent(direction < 0 ? 0 : 50); at[0] += direction * .14;
  useInteractable({ id: `alpha-exchange-nudge-${direction}`, kind: 'exhibit', position: exchangeWorld(at), radius: 1.1,
    label: direction < 0 ? { zh: '左拨一档，减 10 份', en: 'Nudge left: minus 10 units' } : { zh: '右拨一档，加 10 份', en: 'Nudge right: plus 10 units' },
    enabled: () => { const r = useExchangePlay.getState().round; return canRequestExchangePlay('desk') && r?.phase === 'selecting' && r.targetUnits + direction * 10 >= 0 && r.targetUnits + direction * 10 <= 50; },
    onInteract: () => { const r = useExchangePlay.getState().round; if (r) adjustExchangePlay(r.targetUnits + direction * 10); } });
  return <mesh position={at} onClick={event => { event.stopPropagation(); const r = useExchangePlay.getState().round; if (r) adjustExchangePlay(r.targetUnits + direction * 10); }}>
    <boxGeometry args={[.075,.09,.11]} /><meshStandardMaterial color="#b8975a" roughness={.45} metalness={.5}/>
  </mesh>;
}

/** The physics clock owns contact. Frames only move this scene's few dynamic visual parts. */
export default function WorldAlphaExchangePlay({ brass, paperFace }: { brass: MeshStandardMaterial; paperFace: MeshStandardMaterial }) {
  const state = useExchangePlay(), stamp = useRef<Mesh>(null), slider = useRef<Mesh>(null), ticket = useRef<Mesh>(null),
    receipt = useRef<Mesh>(null), bell = useRef<Group>(null), pull = useRef<Mesh>(null), rope = useRef<Mesh>(null);
  const sliderStart = useRef({ id: -1, x: 0 });
  const previous = useRef({ ready:false, active:false, target:0, phase:undefined as string|undefined,
    returned:false, carried:null as typeof exchangeBody.carried });
  const parts = useMemo(() => ({ ticket: new BoxGeometry(...P.archive.ticketSize), receipt: new BoxGeometry(...P.clearing.receiptSize),
    grip: exchangeChamferBox(P.desk.sliderGripSize,.018), stamp: exchangeChamferBox(P.clearing.stampSize,.018),
    marker: new BoxGeometry(.055,.025,.095), pull: exchangeChamferBox([.22,.075,.075],.015), rope: new CylinderGeometry(.014,.014,1,6),
    ticketFace: paperFaceGeometry(.245,.16,[0,608,512,128]), receiptFace: paperFaceGeometry(.27,.19,[256,752,384,256]),
    bell: new LatheGeometry([new Vector2(.39,-.4),new Vector2(.4,-.34),new Vector2(.3,-.27),new Vector2(.18,-.04),new Vector2(.04,.02)],16),
    ink: new MeshStandardMaterial({ color: '#544736', roughness: .9 }), paper: new MeshStandardMaterial({ color: '#eadfc2', roughness: .9 }),
  }), []);
  useEffect(() => () => { Object.values(parts).forEach(part => part.dispose()); }, [parts]);
  useEffect(() => exchangeActionAudio.mount(), []);
  useFrame(() => {
    const world = useWorldStore.getState();
    const last = previous.current;
    if (world.paused || world.card || world.shot || world.poolInspect || document.hidden) { last.ready=false; return; }
    if (!stamp.current || !slider.current || !ticket.current || !receipt.current || !bell.current || !pull.current || !rope.current) { last.ready=false; return; }
    const live = useExchangePlay.getState(), r = live.round, a = exchangeBody.action;
    const target=r?.targetUnits??0, phase=r?.phase, returned=live.ticketReturned, carried=exchangeBody.carried;
    // Active motion keeps the original per-frame interpolation. Its final or
    // cancelled pose, state-only visibility changes and resume each flush once.
    if (!a&&last.ready&&!last.active&&last.target===target&&last.phase===phase&&last.returned===returned&&last.carried===carried) return;
    Object.assign(last,{ready:true,active:!!a,target,phase,returned,carried});
    const elapsed = a?.phase === 'perform' ? a.elapsed : 0, p = a ? Math.min(1, elapsed / a.contactAt) : 0;
    const at = detent(r?.targetUnits ?? 0);
    if (a?.kind === 'adjust') {
      if (sliderStart.current.id !== a.id) sliderStart.current = { id: a.id, x: slider.current?.position.x ?? at[0] };
      at[0] = sliderStart.current.x + (a.anchor.target[0] - exchangeWorld([0,0,0])[0] - sliderStart.current.x) * p;
    }
    slider.current?.position.set(...at);
    if (ticket.current) ticket.current.visible = !r || live.ticketReturned || r.phase === 'complete';
    if (receipt.current) receipt.current.visible = r?.phase === 'clearing' || r?.phase === 'complete' && exchangeBody.carried !== 'receipt';
    if (stamp.current) stamp.current.position.y = P.clearing.stampRest[1] - (a?.kind === 'collect' ? Math.sin(Math.PI * Math.min(1, p * 1.7)) * P.clearing.stampTravel : 0);
    const bellTime = a?.kind === 'ring' && a.committed ? elapsed - a.contactAt : 0;
    if (bell.current) bell.current.rotation.z = Math.sin(bellTime * 24) * .25 * Math.exp(-bellTime * 5);
    const pullY = P.bell.pullRest[1] - (a?.kind === 'ring' && a.committed ? Math.sin(Math.PI * Math.min(1, (elapsed - a.contactAt) / (a.duration - a.contactAt))) * P.bell.pullTravel : 0);
    if (pull.current) pull.current.position.y = pullY;
    if (rope.current) { const top = P.bell.clapperPivot[1]; rope.current.position.y = (top + pullY) / 2; rope.current.scale.y = top - pullY; }
  });
  return <group name="alpha-exchange-play-props">
    {(['archive','desk','bell','clearing','review'] as const).map(id => <Station key={id} id={id}/>)}
    <group name="exchange-review-selector" position={P.review.selector} rotation={[0,(state.reviewIndex ?? -1)*Math.PI/2,0]}>
      <mesh material={brass}><cylinderGeometry args={[.14,.17,.05,12]}/></mesh>
      <mesh material={parts.ink} position={[0,.04,.035]}><boxGeometry args={[.035,.045,.2]}/></mesh>
    </group>
    <mesh ref={ticket} name="exchange-archive-ticket" geometry={parts.ticket} material={parts.paper} position={P.archive.ticketRest}>
      <mesh geometry={parts.ticketFace} material={paperFace}/></mesh>
    <WorldAlphaArchiveTickets paper={parts.paper} ticket={parts.ticket}/>
    <mesh ref={receipt} name="exchange-clearing-receipt" geometry={parts.receipt} material={parts.paper} position={P.clearing.receiptRest} visible={false}>
      <mesh geometry={parts.receiptFace} material={paperFace}/></mesh>
    <mesh ref={stamp} name="exchange-clearing-stamp" geometry={parts.stamp} material={brass} position={P.clearing.stampRest}/>
    <mesh ref={slider} name="exchange-position-grip" geometry={parts.grip} material={brass} position={detent(state.round?.targetUnits ?? 0)}/>
    {[0,10,20,30,40,50].map(units => <mesh key={units} name={`exchange-detent-${units}`} geometry={parts.marker} material={brass}
      position={detent(units)} onClick={event => { event.stopPropagation(); adjustExchangePlay(units); }}/>) }
    <Nudge direction={-1}/><Nudge direction={1}/>
    <group ref={bell} name="exchange-opening-bell" position={P.bell.pivot}><mesh geometry={parts.bell} material={brass}/></group>
    <mesh ref={pull} name="exchange-bell-pull" geometry={parts.pull} material={brass} position={P.bell.pullRest}/>
    <mesh ref={rope} name="exchange-bell-cord" geometry={parts.rope} material={parts.ink} position={[0,1.95,P.bell.pullRest[2]]}/>
    {state.round?.choices.map(choice => <mesh key={choice.checkpoint} name={`exchange-paper-segment-${choice.checkpoint}`} geometry={parts.ticket}
      material={parts.paper} position={[0,2.58-choice.checkpoint*.14,-19.825]} rotation={[Math.PI/2,0,0]}/>) }
  </group>;
}
