import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Group, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { type AlphaFactorId } from './alpha-mine-data';
import { requestMineBacktest, useMineOnline, type MineOnlineEntry } from './alpha-mine-online';
import { useAlphaMineStore } from './alpha-mine-state';
import { useWorldStore } from './store';
import { windUniforms } from './WorldWind';
import type { MineManifest } from './alpha-mine-assets';
import { FACTOR_FAMILIES } from './alpha-mine-labels';
import { POOL_INK, poolDomain, poolPoint, poolPercent } from './mine-pool-chart';

/** One depth-tested surface keeps its metrics, axes and curve together at every angle. */
function makePlot(id: AlphaFactorId, bay: number, entry: MineOnlineEntry, bounds: [number, number], zh: boolean) {
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=860;
  const c=canvas.getContext('2d')!,ink=POOL_INK[id],family=FACTOR_FAMILIES[id];
  c.fillStyle='rgba(10,29,30,.96)';c.beginPath();c.roundRect(4,4,1192,852,26);c.fill();
  c.strokeStyle='#88b7a0';c.lineWidth=3;c.stroke();
  c.fillStyle=ink;c.font='500 44px "Songti SC",Georgia,serif';c.fillText(`${bay?'B':'A'}  /  ${zh?family.zh:family.en}`,52,76);
  c.fillStyle='#c5d4c9';c.font='24px sans-serif';c.textAlign='right';c.fillText('ALPHA AGENT',1148,73);c.textAlign='left';
  if(entry.status!=='ready'||!entry.result){
    c.fillStyle='#faf4dd';c.font='36px "Songti SC",serif';
    c.fillText(entry.status==='error'?(zh?'连接中断，矿石已保留':'Connection interrupted; ore retained'):(zh?'正在读取市场的回声…':'Reading the market’s history…'),52,350);
    c.font='26px sans-serif';c.fillStyle='#c5d4c9';c.fillText(entry.status==='error'?(zh?'在探测器上重试':'Retry from your detector'):(zh?'线上计算完成后，曲线与指标在这里浮现。':'The online curve and metrics will appear here.'),52,405);
  }else{
    const factor=entry.result.factor,m=factor.metrics,curve=factor.curve;
    const stats=[[zh?'测试段净收益':'TEST NET RETURN',poolPercent(m.totalReturn)],['IC',m.ic.toFixed(3)],[zh?'最大回撤':'MAX DRAWDOWN',poolPercent(m.maxDrawdown)]];
    stats.forEach(([label,value],i)=>{const x=52+i*375;c.fillStyle='#c5d4c9';c.font='24px sans-serif';c.fillText(label,x,142);c.fillStyle='#fff7df';c.font='500 57px Georgia,serif';c.fillText(value,x,207);});
    c.fillStyle='#b8cbbf';c.font='23px sans-serif';c.fillText(`${factor.testRange.start} → ${factor.testRange.end}`,52,250);
    const x0=92,y0=314,w=1056,h=344,testX=x0+w*curve.findIndex(p=>p.date>=factor.testRange.start)/(curve.length-1);
    c.fillStyle='#274637';c.fillRect(testX,y0,x0+w-testX,h);c.font='22px sans-serif';
    for(let i=0;i<4;i++){const y=y0+h*i/3;c.strokeStyle='#57746a';c.lineWidth=1;c.beginPath();c.moveTo(x0,y);c.lineTo(x0+w,y);c.stroke();c.fillStyle='#d6dfd4';c.textAlign='right';c.fillText((bounds[1]-(bounds[1]-bounds[0])*i/3).toFixed(2),x0-12,y+7);}
    for(const key of ['benchmark','nav'] as const){c.beginPath();curve.forEach((_,i)=>{const p=poolPoint(curve,i,key,bounds),x=x0+p.x*w,y=y0+(1-p.y)*h;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.strokeStyle=key==='nav'?ink:'#bbc9cc';c.lineWidth=key==='nav'?5:3;c.setLineDash(key==='nav'?[]:[10,7]);c.stroke();}c.setLineDash([]);
    c.textAlign='left';c.fillStyle='#d6dfd4';c.fillText(curve[0].date,x0,695);c.textAlign='right';c.fillText(curve.at(-1)!.date,x0+w,695);
    c.textAlign='left';c.fillStyle=ink;c.fillText(zh?'实线：因子':'SOLID / FACTOR',52,748);c.fillStyle='#d6dfd4';c.fillText(zh?'虚线：SPY':'DASHED / SPY',340,748);
    c.fillText(zh?'完整历史净值 · 阴影为测试段':'FULL-HISTORY NAV · SHADED TEST SEGMENT',52,793);
  }
  c.textAlign='right';c.font='23px sans-serif';c.fillStyle='#f1e1b5';c.fillText(zh?'池边「聚焦检视」可放大查看':'INSPECT AT THE POOL TO ENLARGE',1148,831);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  return new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
}
function PoolResult({id,bay,bounds,offset}:{id:AlphaFactorId;bay:number;bounds:[number,number];offset:number}){
  const entry=useMineOnline(s=>s.factors[id]),zh=useWorldStore(s=>s.lang)==='zh';
  useEffect(()=>{void requestMineBacktest(id);},[id]);
  const material=useMemo(()=>makePlot(id,bay,entry,bounds,zh),[id,bay,entry,bounds,zh]);
  useEffect(()=>()=>{material.map?.dispose();material.dispose();},[material]);
  return <mesh name={`brain-online-result-${bay}-${id}`} position={[offset,1.8,0]} material={material}><planeGeometry args={[4.9,3.51]}/></mesh>;
}
export default function WorldMinePool({manifest}:{manifest:MineManifest}){
  const bays=useAlphaMineStore(s=>s.bays),rings=useRef<Group>(null),plots=useRef<Group>(null),results=useMineOnline(s=>s.factors);
  const bounds=useMemo(()=>poolDomain(bays.flatMap(id=>id&&results[id].result?[results[id].result!.factor.curve]:[])),[bays,results]);
  useFrame(({camera})=>{const t=windUniforms.uWindTime.value;if(rings.current)rings.current.rotation.z=t*.025;if(plots.current){plots.current.quaternion.copy(camera.quaternion);plots.current.position.y=manifest.basin.waterY+.55+Math.sin(t*.8)*.045;}});
  return <>
    <group ref={rings} position={[manifest.basin.center[0],manifest.basin.waterY+.018,manifest.basin.center[2]]} rotation={[-Math.PI/2,0,0]}>
      {[.7,1.35,2.05,2.7].map((r,i)=><mesh key={r} rotation={[0,0,i*.8]}><ringGeometry args={[r,r+.012,64,1,.2,4.6]}/><meshBasicMaterial color="#a8d4bc" transparent opacity={.24} depthWrite={false}/></mesh>)}
    </group>
    <group ref={plots} position={[manifest.basin.center[0],manifest.basin.waterY+.55,manifest.basin.center[2]]}>
      {bays.map((id,bay)=>id?<PoolResult key={`${bay}-${id}`} id={id} bay={bay} bounds={bounds} offset={bays.every(Boolean)?(bay?2.55:-2.55):0}/>:null)}
    </group>
  </>;
}
