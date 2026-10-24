/** Keep fixed A3 switch windows (-.2,+.3 s); correct recorded sole heights to the approach floor.
 * Seated soles reference the seat body in the raw recorder: this explicit height conversion prevents
 * a dangling boot being mislabelled a planted foot. Raw reports remain unchanged. */
import {readFile,writeFile}from'node:fs/promises';
import {slipIntervals,poseJumps}from'./motion-metrics.mjs';
const dir=process.argv[2],r=JSON.parse(await readFile(dir+'/report.json','utf8')),out=[];
for(const c of r.cases){
 const f=JSON.parse(await readFile(`${dir}/${c.label}-frames.json`,'utf8'));
 if(!c.from){out.push({label:c.label,rawMetrics:c.metrics,note:'Non-seat raw metrics; vehicle hidden cuts split explicitly.'});continue;}
 const floor=c.from.player[1]-.82;
 const frames=f.map(x=>({...x,soles:x.soles.map(([id,a,b,h])=>[id,a,b,h+x.root[1]-x.lift-floor])}));
 const row={label:c.label,floorY:floor,frames:f.length,rootStepMax_mm:c.rootStepMax_mm,stood:c.stood,switches:[],turns:[]};
 for(let i=1;i<f.length;i++)if(f[i].anim!==f[i-1].anim){
  const t=f[i].t,w=frames.filter(x=>x.t>=t-.2&&x.t<=t+.3),slip=slipIntervals(w);
  const max=Math.max(0,...slip.map(x=>x.drift))*1000;
  row.switches.push({t,from:f[i-1].anim,to:f[i].anim,window:[t-.2,t+.3],contactIntervals:slip.length,maxContactDrift_mm:+max.toFixed(2),threshold_mm:40,passed:slip.length?max<=40:null});
 }
 for(const clip of ['TurnL','TurnR']){const first=f.findIndex(x=>x.anim===clip);if(first<0)continue;const end=f.findIndex((x,i)=>i>first&&x.anim!==clip),w=f.slice(Math.max(0,first-1),end<0?undefined:end),p=w[0].root;row.turns.push({clip,rootHorizontalTranslation_mm:+(1000*Math.max(...w.map(x=>Math.hypot(x.root[0]-p[0],x.root[2]-p[2])))).toFixed(2),threshold_mm:100});}
 const seated=frames.filter(x=>x.anim==='SitIdle');row.seated={frames:seated.length,groundContactIntervals:slipIntervals(seated).length,note:'No ground contacts means dangling, not a ground-slip pass.'};
 out.push(row);
}
await writeFile(dir+'/a3-windows.json',JSON.stringify({method:'fixed A3 windows; same stable sole IDs; approach floor; no fixture samples',cases:out},null,1));
console.log(JSON.stringify(out.map(c=>({label:c.label,switches:c.switches,turns:c.turns,seated:c.seated}))));
