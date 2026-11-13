import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = process.argv[2] ?? 'src/components/world/WorldWater.ts';
const source = fs.readFileSync(file, 'utf8');
const SEA_SURF={lengthM:6,amplitude:.07};
const vec2=(x,y)=>({x,y}), dot=(a,b)=>a.x*b.x+a.y*b.y;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function body(name){
  const match=new RegExp(`(?:void|float) ${name}\\(`).exec(source);
  const start=match ? source.indexOf('{',match.index) : -1;
  assert(start>=0, `missing ${name}`);
  let i=start+1,level=1;
  for(;level&&i<source.length;i++){if(source[i]==='{')level++;if(source[i]==='}')level--;}
  return source.slice(start+1,i-1).replace(/\$\{([^}]+)\}/g,(_,s)=>Function('SEA_SURF',`return ${s}`)(SEA_SURF));
}
function compile(name,args){
  // Execute scalar statements from the actual GLSL functions; no duplicate analytic formula.
  // The one vector displacement statement expands componentwise with the identical operands.
  let b=body(name).replace(/disp \+= vec3\(([^,]+),([^,]+),([^,]+)\) \* amp;/,
    (_,x,y,z)=>`disp.x += (${x})*amp; disp.y += (${y})*amp; disp.z += (${z})*amp;`)
    .replace(/\bfloat\b/g,'let');
  return Function('sin','cos','pow','clamp','smoothstep','vec2','dot','seaSmoothDerivative',...args,b)
    .bind(null,Math.sin,Math.cos,Math.pow,clamp,smoothstep,vec2,dot,(...a)=>derivative(...a));
}
let derivative=compile('seaSmoothDerivative',['lo','hi','x']);
const wave=compile('seaWave',['d','k','a','q','w','p','t','amp','ampGrad','disp','tx','tz']);
const surf=compile('seaSurfTangent',['p','shoreD','phase','cellEff','motion','shoreGrad','cellGrad','tx','tz']);
const phase=compile('surfPhase',['p','shoreD','t']);
const zero=()=>({x:0,y:0,z:0});
const waveSpecs=[[13,.09,0],[8.5,.07,24],[5.3,.05,-31],[3.4,.035,38]].map(([L,a,ang])=>{
 const r=Math.atan2(.6,.8)+ang*Math.PI/180,k=2*Math.PI/L;
 const round=v=>+v.toFixed(5);
 return {L,a,k:round(k),q:round(.6/(k*a*4)),w:round(Math.sqrt(9.81/k)*k),d:vec2(round(Math.cos(r)),round(Math.sin(r))),lo:round(L/3.4),hi:round(L/2.4)};
});
let maxError=0,cases=0,maxDisplacementError=0;
const e=1e-5;
for(let n=0;n<1800;n++){
 const p=vec2(Math.sin(n*1.431)*120,Math.cos(n*.731)*120),t=n*.317,motion=[0,.25,1][n%3];
 // Local smooth shore/cell fields exercise shoreline fade and every distance fade.
 const shore0=[-.5,.15,.6,1.6,3.4,5.8,8.6,12.4,15.5][n%9];
 const cell0=[.35,1.1,1.85,2.2,2.7,3.2,4.7,5.1,6][n%9];
 const sg=vec2(.62,-.47),cg=vec2(.031,-.019);
 const fields=v=>({shore:shore0+sg.x*(v.x-p.x)+sg.y*(v.y-p.y),cell:cell0+cg.x*(v.x-p.x)+cg.y*(v.y-p.y)});
 function calc(v,analytic){
  const {shore,cell}=fields(v),amp=motion*(.6+.4*smoothstep(0,6,shore));
  const ampD=motion*.4*derivative(0,6,shore),disp=zero(),tx={x:1,y:0,z:0},tz={x:0,y:0,z:1};
  for(const w of waveSpecs){
   const fade=1-smoothstep(w.lo,w.hi,cell),fd=-derivative(w.lo,w.hi,cell);
   wave(w.d,w.k,w.a,w.q,w.w,v,t,amp*fade,vec2(ampD*sg.x*fade+amp*fd*cg.x,ampD*sg.y*fade+amp*fd*cg.y),disp,tx,tz);
  }
  // Height uses the same original surf expression, independent of its analytic derivative.
  const ph=phase(v,shore,t*(motion>=.001?1:0));
  disp.y+=.07*Math.pow(.5+.5*Math.sin(ph),3)*smoothstep(.3,2,shore)*(1-smoothstep(8,14,shore))*(1-smoothstep(1.765,2.5,cell))*motion;
  if(analytic)surf(v,shore,ph,cell,motion,sg,cg,tx,tz);
  return {pos:{x:v.x+disp.x,y:disp.y,z:v.y+disp.z},tx,tz};
 }
 const a=calc(p,true);
 for(const [axis,tangent] of [['x','tx'],['y','tz']]){
  const plus={...p,[axis]:p[axis]+e},minus={...p,[axis]:p[axis]-e};
  const hi=calc(plus,false).pos,lo=calc(minus,false).pos;
  for(const c of ['x','y','z']){const err=Math.abs((hi[c]-lo[c])/(2*e)-a[tangent][c]);maxError=Math.max(maxError,err);assert(err<2e-7,`case ${n} ${tangent}.${c}: ${err}`)}
 }
 // Original four-wave displacement must remain exactly the original component formula.
 const d0=zero(),d1=zero(),tx=zero(),tz=zero();
 for(const w of waveSpecs){const amp=.7*(1-smoothstep(w.lo,w.hi,cell0)),ph=w.k*dot(w.d,p)-w.w*t;
  d0.x+=w.q*w.a*w.d.x*Math.cos(ph)*amp;d0.y+=w.a*Math.sin(ph)*amp;d0.z+=w.q*w.a*w.d.y*Math.cos(ph)*amp;
  wave(w.d,w.k,w.a,w.q,w.w,p,t,amp,sg,d1,tx,tz);
 }
 for(const c of ['x','y','z']){maxDisplacementError=Math.max(maxDisplacementError,Math.abs(d0[c]-d1[c]));assert.equal(d0[c],d1[c]);}
 cases++;
}
console.log(JSON.stringify({cases,finiteDifferenceStep:e,maxTangentAbsoluteError:maxError,maxDisplacementError,source:file},null,2));
