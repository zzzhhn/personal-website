import { useIbdYardStore } from './ibd-yard-store';
import { useIbdPackPlay,currentIbdPack,selectIbdPackPocket,adjustIbdPackGap,requestIbdPackContact,cancelIbdPack } from './ibd-pack-play';
import type { IbdPackSlotIndex } from './ibd-pack-inspection';

export default function WorldIbdPackControls({zh}:{zh:boolean}) {
  const view=useIbdPackPlay();useIbdYardStore(s=>s.game);
  const c=currentIbdPack();if(!c)return null;
  const t=(a:string,b:string)=>zh?a:b, held=c.inspection.held!==null, measured=!!c.inspection.measurement;
  return <section className="ibd-pack-controls" aria-label={t('逐槽检查台','Pocket inspection bench')}>
    <div className="ibd-pack-slots" role="group" aria-label={t('选择检验槽','Choose a pocket')}>
      {c.inspection.slots.map(p=><button key={p.index} aria-pressed={view.selected===p.index} disabled={view.busy||held||p.complete}
        onClick={()=>selectIbdPackPocket(p.index as IbdPackSlotIndex)}>{p.complete?'✓ ':''}{t('槽','Pocket ')}{p.index+1}</button>)}
    </div>
    {held&&!measured&&<label>{t('夹爪开合','Jaw opening')}
      <input aria-label={t('夹爪开合','Jaw opening')} type="range" min=".18" max=".54" step=".02" value={view.gap}
        disabled={view.busy} onChange={e=>adjustIbdPackGap(Number(e.target.value))}/>
    </label>}
    {c.inspection.measurement&&<p role="status">{t('夹量记录：','Gauge record: ')}{c.inspection.measurement}</p>}
    {view.feedback==='clamp-misaligned'&&<p role="status">{t('夹爪还未贴合杆身，调节后再试。','The jaws do not fit the shaft yet. Adjust and try again.')}</p>}
    {view.feedback==='interrupted'&&<p role="status">{t('动作未完成，可重新操作。','The action was interrupted. Try again.')}</p>}
    {view.feedback==='move-closer'&&<p role="status">{t('再走近箱前一步后取样。','Step closer to the front of the carton before sampling.')}</p>}
    <div className="ibd-actions"><button disabled={view.busy||(!held&&c.inspection.slots[view.selected].complete)} onClick={()=>requestIbdPackContact()}>
      {view.busy?t('操作中…','Working…'):held?measured?t('放回原槽','Return to pocket'):t('夹量','Gauge sample'):t('取出所选槽','Present selected pocket')}</button>
      <button className="ibd-secondary" onClick={()=>cancelIbdPack()}>{t('归位并退出','Put back and leave')}</button>
    </div>
  </section>;
}
