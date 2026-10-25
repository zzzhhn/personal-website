import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, Group, SpriteMaterial, SRGBColorSpace } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ALPHA_FACTORS, type AlphaFactorId } from './alpha-mine-data';
import { requestMineBacktest, useMineOnline, type MineOnlineEntry } from './alpha-mine-online';
import { useAlphaMineStore } from './alpha-mine-state';
import { useWorldStore } from './store';
import { windUniforms } from './WorldWind';
import type { MineManifest } from './alpha-mine-assets';
import { FACTOR_FAMILIES } from './alpha-mine-labels';
const pct=(n:number)=>`${n>0?'+':''}${(n*100).toFixed(1)}%`;

/** Labels are actual depth-tested world sprites; metrics and curves share the same bay/result. */
function PoolLabel({ id, entry, bay }: { id:AlphaFactorId; entry:MineOnlineEntry; bay:number }) {
  const zh=useWorldStore(s=>s.lang)==='zh';
  const material=useMemo(()=>{
    const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=300;
    const c=canvas.getContext('2d')!, seed=ALPHA_FACTORS.find(f=>f.id===id)!, family=FACTOR_FAMILIES[id];
    c.textAlign='center'; c.shadowColor='#092827'; c.shadowBlur=8;
    c.fillStyle=seed.color; c.font='600 34px "Geist",sans-serif';
    c.fillText(`${bay?'B':'A'}  /  ${zh?family.zh:family.en}`,512,44);
    c.fillStyle='#f7f1cf';
    if(entry.status==='ready'&&entry.result) {
      const m=entry.result.factor.metrics;
      c.font='500 65px Georgia,serif'; c.fillText(pct(m.totalReturn),512,122);
      c.font='28px "Geist",sans-serif'; c.fillText(`${zh?'测试段净收益':'TEST NET RETURN'}   ·   IC ${m.ic.toFixed(3)}`,512,169);
      c.fillStyle='#d4e9d5'; c.fillText(`${zh?'最大回撤':'MAX DRAWDOWN'}  ${pct(m.maxDrawdown)}`,512,210);
      c.font='22px "Geist",sans-serif'; c.fillText(`${entry.result.factor.testRange.start} → ${entry.result.factor.testRange.end}`,512,253);
      c.font='18px "Geist",sans-serif'; c.fillText(zh?'Alpha Agent 线上计算 · 下方为完整历史净值':'ALPHA AGENT ONLINE · FULL-HISTORY NAV BELOW',512,287);
    } else {
      c.font='36px "Songti SC",serif'; c.fillText(entry.status==='error'?(zh?'信号中断，矿石已保留':'Connection interrupted; ore retained'):(zh?'回测池正在读取市场回声…':'Reading the market’s history…'),512,132);
      c.font='26px "Geist",sans-serif'; c.fillText(entry.status==='error'?(zh?'使用探测器上的重试按钮':'Retry from your detector'):(zh?'计算由 alpha.bobbyzhong.com 提供':'COMPUTED BY ALPHA AGENT'),512,190);
    }
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    return new SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  },[id,entry,zh,bay]);
  useEffect(()=>()=>{material.map?.dispose();material.dispose();},[material]);
  return <sprite material={material} position={[0,3.35,0]} scale={[4.8,1.65,1]}/>;
}

function PoolResult({ id, bay, bounds, offset }: { id:AlphaFactorId; bay:number; bounds:[number,number]; offset:number }) {
  const entry=useMineOnline(s=>s.factors[id]), zh=useWorldStore(s=>s.lang)==='zh';
  const size=useThree(s=>s.size);
  useEffect(()=>{void requestMineBacktest(id);},[id]);
  const lines=useMemo(()=>{
    if(!entry.result)return [];
    const samples=entry.result.factor.curve, [lo,hi]=bounds, span=hi-lo;
    const create=(points:number[],color:string,opacity=1)=>{
      const g=new LineGeometry();g.setPositions(points);
      return new Line2(g,new LineMaterial({color,linewidth:opacity<.5?1.6:2.8,transparent:true,opacity,depthWrite:false,toneMapped:false}));
    };
    const points=(key:'nav'|'benchmark')=>samples.flatMap((p,i)=>[-1.65+3.3*i/(samples.length-1),.6+(p[key]-lo)/span*1.7,0]);
    const zero=.6+(1-lo)/span*1.7;
    return [create([-1.65,zero,-.01,1.65,zero,-.01],'#b9d7c0',.35),create(points('benchmark'),'#dce9e6',.7),create(points('nav'),ALPHA_FACTORS.find(f=>f.id===id)!.color)];
  },[entry.result,id,bounds]);
  useEffect(()=>()=>lines.forEach(l=>{l.geometry.dispose();l.material.dispose();}),[lines]);
  useEffect(()=>{lines.forEach(l=>l.material.resolution.set(size.width,size.height));},[lines,size.width,size.height]);
  return <group name={`brain-online-result-${bay}-${id}`} position={[offset,0,0]}>
    {lines.map((l,i)=><primitive key={i} object={l}/>)}
    <PoolLabel id={id} entry={entry} bay={bay}/>
    {entry.status==='ready'&&<PoolLegend zh={zh} bounds={bounds}/>}
  </group>;
}
function PoolLegend({zh,bounds}:{zh:boolean;bounds:[number,number]}) {
  const material=useMemo(()=>{
    const c=document.createElement('canvas');c.width=640;c.height=80;const x=c.getContext('2d')!;
    x.textAlign='center';x.font='23px Geist,sans-serif';x.fillStyle='#dce6d0';x.fillText(zh?'彩线：因子  ·  灰线：SPY':'FACTOR / COLOR  ·  SPY / GREY',320,30);
    x.font='21px Geist,sans-serif';x.fillText(`${zh?'双池同标尺':'SHARED SCALE'}: NAV ${bounds[0].toFixed(2)} → ${bounds[1].toFixed(2)}`,320,66);
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;return new SpriteMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false});
  },[zh,bounds]);
  useEffect(()=>()=>{material.map?.dispose();material.dispose();},[material]);
  return <sprite position={[0,.23,0]} scale={[3.6,.45,1]} material={material}/>;
}
export default function WorldMinePool({manifest}:{manifest:MineManifest}) {
  const bays=useAlphaMineStore(s=>s.bays), rings=useRef<Group>(null), plots=useRef<Group>(null);
  const results=useMineOnline(s=>s.factors);
  const bounds=useMemo<[number,number]>(()=>{
    const values=bays.flatMap(id=>id?results[id].result?.factor.curve.flatMap(p=>[p.nav,p.benchmark])??[]:[]);
    return [Math.min(.98,...values),Math.max(1.02,...values)];
  },[bays,results]);
  useFrame(({camera})=>{
    const t=windUniforms.uWindTime.value;
    if(rings.current)rings.current.rotation.z=t*.025;
    if(plots.current){plots.current.quaternion.copy(camera.quaternion);plots.current.position.y=manifest.basin.waterY+.9+Math.sin(t*.8)*.065;}
  });
  return <>
    <group ref={rings} position={[manifest.basin.center[0],manifest.basin.waterY+.018,manifest.basin.center[2]]} rotation={[-Math.PI/2,0,0]}>
      {[.7,1.35,2.05,2.7].map((r,i)=><mesh key={r} rotation={[0,0,i*.8]}><ringGeometry args={[r,r+.012,64,1,.2,4.6]}/><meshBasicMaterial color="#a8d4bc" transparent opacity={.24} depthWrite={false}/></mesh>)}
    </group>
    <group ref={plots} position={[manifest.basin.center[0],manifest.basin.waterY+.9,manifest.basin.center[2]]}>
      {bays.map((id,bay)=>id?<PoolResult key={`${bay}-${id}`} id={id} bay={bay} bounds={bounds} offset={bays.every(Boolean)?(bay?2.4:-2.4):0}/>:null)}
    </group>
  </>;
}
