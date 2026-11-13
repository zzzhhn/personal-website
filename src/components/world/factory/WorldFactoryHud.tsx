import { useEffect } from 'react';
import { useWorldStore } from '../store';
import { FACTORY_STATION_NAMES, FACTORY_STATION_PURPOSE, factoryActionLabel } from './factory-copy';
import { nextFactoryStation, factoryHoistCue, factoryExperimentRoutes } from './factory-guidance';
import { useFactoryStore, factoryStationActions, startFactoryOperation, closeFactoryStation, factoryControl, clearFactoryInput, observeFactoryTrial, guideFactoryStation, printFactoryReport, startNextFactoryBatch } from './factory-store';
import WorldFactoryReadings, { FactoryTrialReadings } from './WorldFactoryReadings';
import { factoryWheelExperiment } from './factory-experiment-feedback';
import './factory.css';

export default function WorldFactoryHud(){
  const station=useWorldStore(s=>s.factoryStation),lang=useWorldStore(s=>s.lang),paused=useWorldStore(s=>s.paused||s.poolInspect);
  const state=useFactoryStore(),zh=lang==='zh',p=state.game.pending;
  useEffect(()=>{
    if(!station)return;
    const held=new Set<string>();
    const update=()=>{factoryControl.input.x=Number(held.has('KeyD'))-Number(held.has('KeyA'));
      factoryControl.input.z=Number(held.has('KeyS'))-Number(held.has('KeyW'));factoryControl.input.held=held.has('KeyE');};
    const down=(e:KeyboardEvent)=>{
      if(e.metaKey||e.ctrlKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName??''))return;
      if(useWorldStore.getState().paused||useWorldStore.getState().poolInspect)return;
      if(['KeyW','KeyA','KeyS','KeyD','KeyE'].includes(e.code)){e.preventDefault();held.add(e.code);update();if(e.code==='KeyE'&&!e.repeat)factoryControl.input.confirm=true;}
    };
    const up=(e:KeyboardEvent)=>{held.delete(e.code);update();};
    const clear=()=>{held.clear();clearFactoryInput();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);
    const unsubscribe=useWorldStore.subscribe((s,old)=>{if(s.paused!==old.paused||s.poolInspect!==old.poolInspect)clear();});
    return ()=>{unsubscribe();clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);};
  },[station]);
  if(!station||paused)return null;
  const actions=factoryStationActions(state.game,station),crane=p&&['extract','trial-assemble','final-assemble'].includes(p.action.type);
  const title=FACTORY_STATION_NAMES[station][zh?0:1];
  const inspection=factoryControl.inspection;
  const next=nextFactoryStation(state.game),op=factoryControl.operation;
  const experiments=factoryExperimentRoutes(state.game,station);
  const experimentLabels:Partial<Record<typeof station,[string,string]>>={test:['去试另一段路','Try another course'],compare:['和基准机同场试跑','Run beside the benchmark'],rework:['去换一套轮组','Change the wheel configuration'],finish:['满意了，去扣合外壳','Satisfied? Fit the shell']};
  const automatic=crane&&!['aim','carry'].includes(state.phase);
  const inspectionHints=zh?['检查底盘是否落入夹具。','检查四轮是否全部扣合。','检查外壳接缝。','启动轮组，再按一次 E 测试急停。','等待轮组完全停止。','核对铭牌并打印产品卡。']:
    ['Check the frame in its fixture.','Check all four wheel mounts.','Check the shell seam.','Start the wheels, then press E again for the emergency stop.','Wait for the wheels to stop.','Verify the plate and print the product card.'];
  const hint=inspection?(inspection.step===3&&inspection.motor?
    (zh?'轮组正在转动。按 E 急停，检查是否完全停止。':'Wheels are turning. Press E for the emergency stop.'):
    inspectionHints[inspection.step]):crane&&op?factoryHoistCue(op,state.aligned,zh):
    p?.action.type==='process'?(state.phase==='outfeed'?(zh?'加工完成，部件正沿输送线出料。':'The finished part is travelling down the line.'):
    (zh?'按住 E，护罩闭合后开始冲压。松开会安全收回。':'Hold E to close the guard and press. Release to retract safely.')):
    p?.action.type==='test'?(zh?'观察机械伙伴通过试验段。结果来自实际运行。':'Watch the companion on the course. Readings come from this run.'):
    state.phase==='cycle'?(zh?'工序正在进行，完成后会保留进度。':'The machine is working. Progress is retained when it finishes.'):
    zh?'按 E 操作手柄。':'Press E to operate the lever.';
  return <section className="factory-console" aria-label={title}>
    <header><h2>{title}</h2><button onClick={closeFactoryStation} aria-label={zh?'退出操作':'Leave console'}>Esc</button></header>
    {(station==='test'||station==='compare')&&<WorldFactoryReadings game={state.game}
      mode={station==='compare'?'comparison':'single'} zh={zh} onObserve={observeFactoryTrial}/>}
    {p?<>
      <p className="factory-action-name">{factoryActionLabel(p.action,zh)}</p><p>{hint}</p>
      {crane&&<div className="factory-direction-pad" aria-label={zh?'移动吊头':'Hoist controls'}>
        {[[0,-1,'↑'],[-1,0,'←'],[0,1,'↓'],[1,0,'→']].map(([x,z,label],i)=><button key={i} disabled={!!automatic}
          onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);factoryControl.input.x=Number(x);factoryControl.input.z=Number(z);}}
          onPointerUp={()=>{factoryControl.input.x=0;factoryControl.input.z=0;}} onPointerCancel={clearFactoryInput}>{label}</button>)}
      </div>}
      {p.action.type!=='test'&&<button className="factory-primary" disabled={!!automatic||state.phase==='outfeed'}
        onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);factoryControl.input.held=true;factoryControl.input.confirm=true;}}
        onPointerUp={()=>{factoryControl.input.held=false;}} onPointerCancel={clearFactoryInput}
        onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();factoryControl.input.held=true;factoryControl.input.confirm=true;}}}
        onKeyUp={()=>{factoryControl.input.held=false;}}>{p.action.type==='process'?(zh?'按住手柄':'Hold lever'):(zh?'操作手柄 · E':'Operate · E')}</button>}
    </>:<>
      <p>{FACTORY_STATION_PURPOSE[station][zh?0:1]}</p>
      {station==='rework'&&factoryWheelExperiment(state.game,zh)&&<p className="factory-experiment-advice">{factoryWheelExperiment(state.game,zh)}</p>}
      {state.notice&&<p role="status">{state.notice==='completed'?(zh?'已完成，材料与记录已保留。':'Complete. Parts and records retained.'):(zh?'试验未完成，可重新尝试。':'Trial incomplete. You can run it again.')}</p>}
      <div className="factory-actions">{actions.map((a,i)=><button key={i} onClick={()=>startFactoryOperation(a)}>{factoryActionLabel(a,zh)}</button>)}</div>
      {station==='release'&&state.game.report&&<button onClick={printFactoryReport}>{zh?'打印产品卡':'Print product card'}</button>}
      {station==='release'&&state.game.released&&state.dispatchView==='printer'&&<button onClick={()=>useFactoryStore.setState({dispatchView:'dock'})}>{zh?'查看伙伴':'Look at companion'}</button>}
      {station==='release'&&state.game.released&&<button onClick={startNextFactoryBatch}>{zh?'开始下一批':'Start another batch'}</button>}
      {experiments.length>0?<div className="factory-actions">{experiments.map(to=><button key={to} className="factory-next" onClick={()=>guideFactoryStation(station,to)}>{experimentLabels[to]?.[zh?0:1]}</button>)}</div>:
        next&&next!==station&&<button className="factory-next" onClick={()=>guideFactoryStation(station,next)}>{zh?'带我去':'Guide me to'} {FACTORY_STATION_NAMES[next][zh?0:1]} →</button>}
      {state.game.released&&<p>{zh?'伙伴会驶下出厂台，在后方黄线步道陪你走一段。离开步道后它会回到停靠点。':'Your companion drives down the dock and follows you along the yellow display lane. It parks when you leave.'}</p>}
    </>}
    {state.game.report&&(station==='finish'||station==='release')&&<details className="factory-product-card"><summary>{zh?'查看产品卡':'Product card'}</summary>
      <p>{state.game.configuration?.kind==='steady'?(zh?'稳健型':'Steady'):(zh?'轻快型':'Nimble')} · {state.game.report.id.split(':').slice(-2).join(' ')}</p>
      {state.game.report.trialIds.map(id=>{const trial=state.game.trials.find(t=>t.id===id);return trial?
        <div key={id}><FactoryTrialReadings trial={trial} zh={zh}/></div>:null;})}
      <small>{zh?'本轮游戏试验记录，非公司模型评测。':'This game run, not company model-evaluation data.'}</small>
    </details>}
    {station==='release'&&state.game.archives.length>0&&<details className="factory-product-card"><summary>{zh?'已出厂的伙伴':'Completed companions'} · {state.game.archives.length}</summary>
      {state.game.archives.map(batch=><details key={batch.batchId}><summary>{batch.configuration?.kind==='steady'?(zh?'稳健型':'Steady'):(zh?'轻快型':'Nimble')} · {batch.batchId?.split(':').slice(-2).join(' ')}</summary>
        {batch.report?.trialIds.map(id=>{const trial=batch.trials.find(t=>t.id===id);return trial?<FactoryTrialReadings key={id} trial={trial} zh={zh}/>:null;})}
        <small>{zh?'保留此批次的配置、试验与返工记录。':'Configuration, trials and rework history retained for this batch.'}</small>
      </details>)}
    </details>}
    {state.save!=='saved'&&<small>{state.save==='invalid'?(zh?'上次存档无法读取，本轮尚未覆盖。':'Previous save could not be read.'):(zh?'本轮进度暂保存在此页面。':'Progress is currently held in this page.')}</small>}
  </section>;
}
