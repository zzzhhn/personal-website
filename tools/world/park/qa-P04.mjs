/** Rebuilds the actual shared G10/G11/P04 generator and park attribute adapter in Node. */
import { writeFileSync } from 'node:fs';
import { PARK_LAMP as l, PARK_LAMP_OPTIONS as options } from '../../../src/components/world/WorldParkLamp.ts';
const bounds=points=>{let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<points.length;i++) {const a=i%3;min[a]=Math.min(min[a],points[i]);max[a]=Math.max(max[a],points[i]);}return {min,max};};
const r={source:'WorldStreetAssets.lampGeometry',options,nearTriangles:l.triangles,farTriangles:l.farTriangles,ratio:l.farTriangles/l.triangles,attributes:Object.keys(l.geometry.attributes),bounds:bounds(l.geometry.getAttribute('position').array),hulls:l.hulls.map((p,i)=>({part:i,points:p.length/3,bounds:bounds(p),mass:l.spec.mass/l.hulls.length})),mass:l.spec.mass,glowVertices:Array.from(l.geometry.getAttribute('aEmit').array).filter(v=>v>0).length};
writeFileSync('docs/world/park/qa-P04-shared.json',JSON.stringify(r,null,1));console.log(JSON.stringify(r));
if(r.ratio>.3||r.mass!==45||r.hulls.length<2||!r.attributes.includes('aEmit')||r.attributes.includes('aMat'))process.exitCode=1;
