import { useEffect } from 'react';
import { CRANE_STEPS,setCraneInput,useIbdCraneControl,type CraneDirection } from './ibd-crane-control';

export default function WorldIbdCraneControls({zh}:{zh:boolean}){
  const state=useIbdCraneControl(),t=(cn:string,en:string)=>zh?cn:en;
  useEffect(()=>{
    const directions:Record<string,CraneDirection>={ArrowUp:'raise',ArrowLeft:'travel',ArrowDown:'lower'};
    const down=(e:KeyboardEvent)=>{const d=directions[e.code];if(!d)return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)setCraneInput(d);};
    const up=(e:KeyboardEvent)=>{if(!directions[e.code])return;e.preventDefault();e.stopImmediatePropagation();setCraneInput(null);};
    const release=()=>setCraneInput(null);
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);
    window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);
      window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);release();};
  },[]);
  const labels=[t('吊起','Lift'),t('横移','Traverse'),t('落稳','Lower')],keys=['↑','←','↓'];
  return <section className="ibd-crane-controls" aria-label={t('吊架手动控制','Manual crane controls')}>
    <p role="status">{state.stage===3?t('钢卷已落稳，松开控制杆。','Cargo landed. Releasing the controls.')
      :!state.ready?t('正在握住控制杆……','Taking the controls…')
      :state.wrong?t(`先${labels[state.stage]}，到位后再换方向。`,`First ${labels[state.stage].toLowerCase()}, then change direction.`)
      :t('按住方向控制，松开即停。','Hold a direction to move. Release to stop.')}</p>
    <div className="ibd-crane-directions">{CRANE_STEPS.map((direction,i)=><button key={direction}
      disabled={!state.ready} aria-pressed={state.held===direction} aria-current={state.stage===i?'step':undefined}
      onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);setCraneInput(direction);}}
      onPointerUp={()=>setCraneInput(null)} onPointerCancel={()=>setCraneInput(null)} onLostPointerCapture={()=>setCraneInput(null)}
      onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)setCraneInput(direction);}}}
      onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setCraneInput(null);}}} onBlur={()=>setCraneInput(null)}>
      <kbd>{keys[i]}</kbd>{labels[i]}{state.stage>i?' ✓':''}</button>)}</div>
  </section>;
}
