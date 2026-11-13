import { useEffect } from 'react';
import { useWorldStore } from '../../store';
import { useTransportStatus,transportActions,transportNames as names } from './transport-status';
export default function AlphaTransportHud(){
 const s=useTransportStatus(),lang=useWorldStore(w=>w.lang),paused=useWorldStore(w=>w.paused);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(s.id&&!paused&&e.code==='KeyE'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName??'')){e.preventDefault();transportActions.requestExit();}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[s.id,paused]);
 if(!s.id||!s.kind||paused)return null;
 const zh=lang==='zh';return <div style={{position:'absolute',left:'50%',bottom:78,transform:'translateX(-50%)',background:'rgba(21,30,34,.92)',color:'#fff4de',padding:'12px 18px',borderRadius:12,pointerEvents:'auto',maxWidth:'90vw',textAlign:'center'}}>
  <strong>{names[s.kind][lang]}</strong> · {zh?({approach:'走向座位','turn-in':'转身入座',sit:'坐下',riding:s.cancelled?'前往安全站台':'沿途观景',stand:'起身','turn-out':'转向出口','walk-out':'走下站台',complete:'到站'}[s.phase]??s.phase):s.phase}
  <div style={{display:'flex',gap:12,marginTop:8,justifyContent:'center'}}><button onClick={transportActions.resetView}>{zh?'视角归位':'Reset view'}</button><button onClick={transportActions.requestExit} disabled={s.cancelled}>{zh?(s.cancelled?'已请求安全退乘':'E 安全退乘'):'E · Leave safely'}</button></div>
  {s.blocked&&<p>{zh?'通道被挡住了，请等待或返回营地。':'The path is blocked. Wait or return to camp.'}</p>}
  <small>{zh?'拖动观察 · 滚轮缩放 · Esc 暂停':'Drag to look · Scroll to zoom · Esc pause'}</small>
 </div>;
}
