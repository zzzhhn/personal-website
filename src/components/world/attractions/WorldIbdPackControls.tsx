import { useIbdYardStore } from './ibd-yard-store';
import { useIbdPackPlay,currentIbdPack,selectIbdPackPocket,requestIbdPackContact,cancelIbdPack } from './ibd-pack-play';
import type { IbdPackSlotIndex } from './ibd-pack-inspection';
import { isIbdStockKey } from './ibd-yard-layout';

export default function WorldIbdPackControls({zh}:{zh:boolean}) {
  const view=useIbdPackPlay();useIbdYardStore(s=>s.game);
  const c=currentIbdPack();if(!c)return null;
  const t=(a:string,b:string)=>zh?a:b, held=c.inspection.held!==null, measured=!!c.inspection.measurement;
  return <section className="ibd-pack-controls" aria-label={t('逐槽检查台','Pocket inspection bench')}>
    <div className="ibd-pack-slots" role="group" aria-label={t('选择检验槽','Choose a pocket')}>
      {c.inspection.slots.map(p=><button key={p.index} aria-pressed={view.selected===p.index} disabled={view.busy||held||p.complete}
        onClick={()=>selectIbdPackPocket(p.index as IbdPackSlotIndex)}>{p.complete?'✓ ':''}{t('槽','Pocket ')}{p.index+1}</button>)}
    </div>
    {held&&!measured&&view.feedback!=='returning'&&<p role="status">{view.feedback==='closing'
      ?t('夹爪正在合拢，接触杆身后停住。','Closing the jaws until they touch the shaft.')
      :t('按 E 或点击下方按钮，夹爪会合拢至杆身并读数。','Press E or the button below to close the jaws and read the gauge.')}</p>}
    {c.inspection.measurement&&<p className="ibd-pack-reading" role="status">
      {t('已贴合 · 实测','Contact · Measured')} <strong>{c.inspection.measurement}</strong></p>}
    {view.pack&&isIbdStockKey(view.pack)&&!held&&c.inspection.slots.some(p=>p.reading)&&
      <p>{t('已验样：','Samples checked: ')}{c.inspection.slots.filter(p=>p.reading).map(p=>`${p.index+1} · ${p.reading}`).join(' / ')}</p>}
    {view.feedback==='clamp-misaligned'&&<p role="status">{t('未能确认接触，请再次点击「合拢并读数」。','Contact could not be confirmed. Choose Close and read again.')}</p>}
    {view.feedback==='interrupted'&&<p role="status">{t('动作中断，零件已保留，可重试或归位退出。','Action interrupted. Your sample is retained; retry or put it back.')}</p>}
    {view.feedback==='move-closer'&&<p role="status">{t('再走近箱前一步后取样。','Step closer to the front of the carton before sampling.')}</p>}
    <div className="ibd-actions"><button className="ibd-primary" disabled={view.busy||(!held&&c.inspection.slots[view.selected].complete)} onClick={()=>requestIbdPackContact()}>
      {view.busy?view.feedback==='closing'?t('合拢中…','Closing…'):view.feedback==='measured'?t('读数完成','Reading captured')
        :['returning','returned','cancelled'].includes(view.feedback)?t('归位中…','Returning…'):t('送样中…','Presenting…')
        :held?measured?t('放回原槽','Return to pocket'):t('合拢并读数','Close and read'):t('取出所选槽','Present selected pocket')}</button>
      <button className="ibd-secondary" onClick={()=>cancelIbdPack()}>{view.pack&&isIbdStockKey(view.pack)?t('归位，继续选箱','Put back and choose a carton'):t('归位并退出','Put back and leave')}</button>
    </div>
  </section>;
}
