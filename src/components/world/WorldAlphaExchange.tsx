import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { TrimeshCollider, RigidBody } from '@react-three/rapier';
import { CanvasTexture, CircleGeometry, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { exchangeCraftMaterial } from './alpha-exchange-craft';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry';
import WorldAlphaExchangePlay, { exchangePlayInstruction } from './WorldAlphaExchangePlay';
import { night } from './WorldNight';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { useExchangePlay, releaseExchangePlay } from './alpha-exchange-play';
import { roundEquity } from './alpha-exchange-round';
import { exchangePreviousMarks, exchangeReview } from './alpha-exchange-review';
import { drawExchangeReview } from './alpha-exchange-review-display';
import { useAlphaExchange } from './alpha-exchange-state';
import { ALPHA_EXCHANGE_ORIGIN, EXCHANGE_HALL, exchangeWorld } from './alpha-exchange-layout';
import { EXCHANGE_PLAY_STATIONS as S, EXCHANGE_SECOND_DESK, EXCHANGE_PLAY_PROPS } from './alpha-exchange-play-layout';
import type { Vec3 } from './types';
export { ALPHA_EXCHANGE_ORIGIN, ALPHA_EXCHANGE_FOOTPRINT, ALPHA_EXCHANGE_APPROACH, ALPHA_EXCHANGE_APPROACH_WIDTH } from './alpha-exchange-layout';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function texturePlane(width: number, height: number, position: Vec3, rect: number[], circle = false, pitch = 0) {
  const g = circle ? new CircleGeometry(width / 2, 32) : new PlaneGeometry(width, height), uv = g.getAttribute('uv');
  const [x,y,w,h] = rect;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / 1024, 1 - (y + (1 - uv.getY(i)) * h) / 1024);
  g.rotateX(pitch); g.translate(...position); return g;
}
function ProjectInput({ projectId }: { projectId?: string }) {
  useInteractable(projectId ? { id: 'alpha-exchange-project', kind: 'board', position: exchangeWorld(EXCHANGE_HALL.project), radius: 1.8,
    label: { zh: 'Alpha Agent · 项目与数据', en: 'Alpha Agent · project & data' },
    onInteract: () => useWorldStore.setState({ card: { kind: 'project', id: projectId } }) } : null);
  return null;
}

/** One finite replay, physical contacts and one event-driven 1024² display atlas. Mounting never fetches. */
export default function WorldAlphaExchange({ projectId }: { projectId?: string }) {
  const state = useExchangePlay(), zh = useWorldStore(s => s.lang === 'zh');
  const built = useMemo(() => {
    const architecture = buildAlphaExchangeGeometry();
    const planes = [texturePlane(9.8,2.75,EXCHANGE_HALL.board,[0,0,1024,288]),
      texturePlane(8.6,.95,[0,5.65,1.15],[0,300,1024,112]),
      ...[S.desk,EXCHANGE_SECOND_DESK].map((s,i) => texturePlane(.6,.4,[s.stand[0],1.43,-15.77],[i*512,432,512,160])),
      texturePlane(2.5,.42,[-11.7,.9,-18.648],[512,608,512,128]),
      texturePlane(1.6,.65,[11.7,2.17,-26.48],[640,752,384,128]),
      texturePlane(.52,.15,[-1.35,1.064,-15.32],[640,896,384,112],false,-Math.PI/2),
      texturePlane(3,3,[EXCHANGE_HALL.clock[0],EXCHANGE_HALL.clock[1],EXCHANGE_HALL.clock[2]+.42],[0,752,256,256],true),
      texturePlane(...EXCHANGE_PLAY_PROPS.review.displaySize,EXCHANGE_PLAY_PROPS.review.display,[0,0,1024,288],false,EXCHANGE_PLAY_PROPS.review.displayPitch),
    ];
    const faces = mergeGeometries(planes)!; planes.forEach(g => g.dispose());
    return { ...architecture, faces };
  }, []);
  const atlas = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
    return { canvas, texture,
      architecture: exchangeCraftMaterial(),
      material: new MeshStandardMaterial({ map: texture, roughness: .85, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: .16 }),
      brass: new MeshStandardMaterial({ color: '#b8975a', metalness: .55, roughness: .42, emissive: '#9d7541', emissiveIntensity: 0 }),
      glass: new MeshStandardMaterial({ vertexColors: true, color: '#f3dba8', transparent: true, opacity: .29, roughness: .35,
        metalness: 0, depthWrite: false, emissive: '#c19b56', emissiveIntensity: .04 }),
    };
  }, []);
  useEffect(() => {
    const c = atlas.canvas.getContext('2d')!, r = state.round, row = r?.history[r.day];
    const previous = r ? exchangePreviousMarks(r,r.equityTrace.filter(mark=>mark.day===r.day))?.[0] : null;
    const review = exchangeReview(r,state.reviewIndex);
    const source = useAlphaExchange.getState(), ticketHistory = state.catalog[0]?.history ?? (source.phase === 'open' ? source.history : []);
    const t = (cn: string, en: string) => zh ? cn : en;
    const font = (size: number, heading = false) => `${heading ? 600 : 500} ${size}px ${heading ? 'Georgia,"Songti SC",serif' : '"Avenir Next","PingFang SC",sans-serif'}`;
    const text = (value: string, x: number, y: number, size = 20, color = '#e6dccb', width = 960) => {
      c.font = font(size); c.fillStyle = color; c.fillText(value,x,y,width);
    };
    const panel = (x: number, y: number, w: number, h: number, color = '#253e39') => { c.fillStyle = color; c.fillRect(x,y,w,h); };
    c.clearRect(0,0,1024,1024); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    panel(0,0,1024,288);
    text(t('SPY 历史净值回放','SPY HISTORICAL NAV REPLAY'),28,34,24,'#ccb88b');
    text(row ? `${row.date}  ·  ${t('已推进','INTERVALS')} ${r!.checkpoint}/3` : t('到档案室领取时段票','TAKE A TICKET AT THE ARCHIVE'),570,34,19,'#ccb88b',430);
    text(row ? `NAV ${row.value.toFixed(2)}` : 'ALPHA AGENT',28,92,43,'#f0e5cf');
    text(`${t('虚拟点数','POINTS')} ${money(r?.cash ?? 10000)}    ${t('持仓','UNITS')} ${r?.units ?? 0}`,360,70,24);
    text(`${t('权益','EQUITY')} ${money(r ? roundEquity(r) : 10000)}    ${t('目标','TARGET')} ${r?.targetUnits ?? 0}`,360,106,24);
    text(exchangePlayInstruction(state,zh),28,143,21,'#dccba6');
    // Only dates already reached by this round contribute to the plot or its scale.
    if (r) {
      const values = r.history.slice(0,r.day+1).map(point => point.value), lo = Math.min(...values), hi = Math.max(...values), span = Math.max(.1,hi-lo);
      c.strokeStyle = '#c7b36d'; c.lineWidth = 3; c.beginPath();
      values.forEach((value,i) => { const x = 30 + i / Math.max(1,r.day) * 520, y = 230 - (value-lo)/span*65; if (i) c.lineTo(x,y); else c.moveTo(x,y); }); c.stroke();
      r.choices.forEach((choice,i) => text(`${choice.date}   ${choice.units} ${t('份','UNITS')}  →  ${money(choice.equityAfter)}`,600,180+i*25,16,'#cfbf9d',395));
      if (r.receipt) text(`${t('清算回执','RECEIPT')}  ${r.receipt.pnl >= 0 ? '+' : ''}${money(r.receipt.pnl)}  (${r.receipt.returnPct.toFixed(2)}%)`,28,258,20,'#d9c98f');
    }
    text(t('来源：Alpha Agent API 历史 SPY 基准。虚拟积分，无真实下单，不计手续费或滑点。','SOURCE: ALPHA AGENT API SPY BENCHMARK. VIRTUAL POINTS; NO REAL ORDERS; FEES / SLIPPAGE EXCLUDED.'),28,280,13,'#91a295');
    if(review)drawExchangeReview(c,review,zh);
    panel(0,300,1024,112,'#d7ccb9'); c.fillStyle = '#354d43'; c.font = font(58,true); c.textAlign = 'center'; c.fillText('ALPHA AGENT',512,363);
    text(t('历史中的一次选择','A DECISION THROUGH HISTORY'),512,397,23,'#354d43'); c.textAlign = 'left';
    panel(0,432,512,160); text(t('本轮仓位','THIS RUN'),18,462,25,'#ccb88b',470);
    text(`${t('目标','TARGET')} ${r?.targetUnits ?? 0} / 50`,18,502,31,'#f0e5cf',470);
    text(r?.phase === 'selecting' ? t('点铜轨选档，E 封单','CLICK DETENT; E TO SEAL') : exchangePlayInstruction(state,zh),18,540,19,'#d7ccb9',470);
    text(t('拨杆：Q 切换，E 操作','NUDGES: Q TO CHOOSE, E TO USE'),18,576,16,'#91a295',470);
    panel(512,432,512,160); text(t('上一轮 · 同一日期','PREVIOUS RUN · SAME DATE'),530,462,23,'#ccb88b',470);
    text(previous ? `${t('权益','EQUITY')} ${money(previous.equity)}` : t('完成首轮后留下对照','FINISH A RUN TO LEAVE A COMPARISON'),530,505,previous ? 30 : 20,'#eadfc5',470);
    text(previous ? previous.date : t('上回廊，逐段复盘自己的选择','REVIEW EACH CHOICE AT THE UPPER GALLERY'),530,542,18,'#91a295',470);
    if (previous) text(`${t('本轮差额','EQUITY DIFFERENCE')} ${money(roundEquity(r!)-previous.equity)}`,530,577,21,'#d9c98f',470);
    panel(0,608,512,128,'#eadfc2');
    text('ALPHA API · SPY HISTORY',20,640,27,'#354d43',470);
    text(ticketHistory.length ? `${ticketHistory[0].date} → ${ticketHistory.at(-1)!.date}` : t('先按 E 读取真实历史','E: LOAD VALIDATED HISTORY'),20,675,22,'#544736',470);
    text(t('虚拟积分 · 最多三次选择','VIRTUAL POINTS · UP TO THREE CHOICES'),20,714,17,'#544736',470);
    panel(512,608,512,128); text(t('历史档案室','HISTORICAL ARCHIVE'),530,641,28,'#ccb88b',470);
    text(state.loading ? t('读取中，请稍候再取票','LOADING; TAKE TICKET WHEN READY') : state.notice === 'error'
      ? t('按 E 重试，没有替代行情','E TO RETRY; NO SUBSTITUTE PRICES') : t('完整历史 · E 取票','FULL HISTORY · E TO TAKE TICKET'),530,681,20,'#eadfc5',470);
    text(t('柜台后方：按年份查档','BEHIND THE COUNTER: CHOOSE A YEAR'),530,718,19,'#91a295',470);
    panel(256,752,384,256,'#eadfc2'); text(t('清算回执','CLEARING RECEIPT'),274,790,27,'#354d43',345);
    if (r?.receipt) {
      text(`${r.receipt.startDate} → ${r.receipt.endDate}`,274,826,17,'#544736',345);
      text(`${t('权益','EQUITY')} ${money(r.receipt.finalEquity)}`,274,867,24,'#544736',345);
      text(`${t('盈亏','P/L')} ${money(r.receipt.pnl)}`,274,903,24,'#544736',345);
      text(`${r.receipt.choices.length} ${t('次选择','CHOICES')}`,274,940,22,'#544736',345);
    }
    text(t('历史 SPY · 不计费用或滑点','SPY HISTORY · NO FEES / SLIPPAGE'),274,984,16,'#544736',345);
    panel(640,752,384,128); text(t('清算室','CLEARING'),656,790,30,'#ccb88b',350);
    text(r?.phase === 'clearing' ? t('按 E 压印并取回执','E: STAMP AND COLLECT') : r?.phase === 'complete'
      ? t('带回执上回廊，拨台复盘','TAKE RECEIPT UPSTAIRS TO REVIEW') : t('推进完本轮历史后领取','COLLECT AFTER THE LAST INTERVAL'),656,836,17,'#eadfc5',350);
    panel(640,896,384,112,'#d7ccb9'); c.textAlign = 'center';
    [0,10,20,30,40,50].forEach((units,i) => text(String(units),672+i*64,963,34,'#354d43',60));
    panel(0,752,256,256,'#e6dccb'); c.strokeStyle = '#867041'; c.lineWidth = 4;
    for (let i=0;i<12;i++) { const a=i*Math.PI/6; c.beginPath(); c.moveTo(128+Math.sin(a)*100,880-Math.cos(a)*100); c.lineTo(128+Math.sin(a)*112,880-Math.cos(a)*112); c.stroke(); }
    c.strokeStyle = '#354d43'; c.lineWidth = 8; c.beginPath(); c.moveTo(128,880); c.lineTo(65,880); c.moveTo(128,880); c.lineTo(128,960); c.stroke();
    text('REPLAY',128,826,17,'#867041'); c.textAlign = 'left'; atlas.texture.needsUpdate = true;
  }, [atlas,state,zh]);
  useEffect(() => () => {
    releaseExchangePlay(); built.body.dispose(); built.glass.dispose(); built.faces.dispose();
    atlas.texture.dispose(); atlas.material.dispose(); atlas.architecture.dispose(); atlas.brass.dispose(); atlas.glass.dispose();
  }, [built,atlas]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const api = { read: () => { const s=useExchangePlay.getState(), r=s.round; return { phase:r?.phase ?? s.notice, notice:s.notice,
      day:r?.day ?? 0, days:r?.history.length ?? 0, date:r?.history[r.day].date ?? null, nav:r?.history[r.day].value ?? null,
      cash:r?.cash ?? 10000, units:r?.units ?? 0, targetUnits:r?.targetUnits ?? 0, checkpoint:r?.checkpoint ?? 0,
      equity:r ? roundEquity(r) : 10000, choices:r?.choices ?? [], traceLength:r?.equityTrace.length ?? 0,
      receipt:r?.receipt ? { pnl:r.receipt.pnl, finalEquity:r.receipt.finalEquity, choices:r.receipt.choices.length } : null,
      previousRun:r?.previousRun ? { available:true, currentMark:exchangePreviousMarks(r,r.equityTrace.filter(mark=>mark.day===r.day))?.[0]??null } : null,
      ticketId:s.ticketId, archive:s.catalog.map(t=>({id:t.id,label:t.label,start:t.history[0].date,end:t.history.at(-1)!.date,days:t.history.length})),
      reviewIndex:s.reviewIndex,
      contacts:s.contacts, ticketReturned:s.ticketReturned, error:s.error }; } };
    const host=window as unknown as { __worldExchange?: typeof api }; host.__worldExchange=api;
    return () => { if (host.__worldExchange===api) delete host.__worldExchange; };
  }, []);
  useFrame(() => {
    atlas.glass.emissiveIntensity=.025+.13*night.value;
    atlas.material.emissiveIntensity=.16+.32*night.value;
    atlas.brass.emissiveIntensity=.12*night.value;
  });
  return <group name="alpha-agent-exchange" position={ALPHA_EXCHANGE_ORIGIN} userData={{ noOcclusionFade:true }}>
    <mesh name="alpha-exchange-architecture" geometry={built.body} material={atlas.architecture} castShadow receiveShadow/>
    <mesh name="alpha-exchange-displays" geometry={built.faces} material={atlas.material}/>
    <mesh name="alpha-exchange-skylights" geometry={built.glass} material={atlas.glass} receiveShadow renderOrder={1}/>
    <pointLight position={[-7,6,-18]} color="#ffdb9d" intensity={130} distance={26} decay={2} castShadow={false}/>
    <pointLight position={[7,6,-31]} color="#ffd293" intensity={130} distance={26} decay={2} castShadow={false}/>
    {(['surface','solid'] as const).map(kind => <RigidBody key={kind} type="fixed" colliders={false} userData={{ [kind]:true, assetId:'alpha-exchange' }}>
      {/* Rapier accepts flags as the third argument; R3 Rapier's tuple type omits it. */}
      <TrimeshCollider name={`alpha-exchange-${kind}`}
        args={[built.colliders[kind].vertices,built.colliders[kind].indices,built.colliders[kind].flags] as unknown as [Float32Array,Uint32Array]}
        friction={.85}/>
    </RigidBody>)}
    <WorldAlphaExchangePlay brass={atlas.brass} paperFace={atlas.material}/><ProjectInput projectId={projectId}/>
  </group>;
}
