/** Execute the actual pure layout and private visual factory slices, no React mount. */
import{readFileSync}from'node:fs';import vm from'node:vm';import ts from'typescript';
import{Matrix4,Quaternion,Vector3}from'three';import{loadWorldModule,ROOT}from'../../street/runtime.mjs';
const run=(source,globals)=>{const exports={},module={exports};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {module,exports,console,...globals},{timeout:2000});return module.exports;};
export function fixture(search=''){
 const[A,R,C,G,L,Batch]=loadWorldModule(['WorldStreetAssets.ts','WorldRailCraft.ts','WorldStreetFacilityCraft.ts','WorldStreetGeometry.ts','layout-v4.ts','WorldStreetBatch.ts'],search);
 const src=readFileSync(ROOT+'/src/components/world/WorldStreetRails.tsx','utf8'),pure=src.slice(src.indexOf('const yawQ ='),src.indexOf('export default function StreetRails'));
 const railLayout=run(pure,{Matrix4,Quaternion,Vector3,solidsV4:L.solidsV4,TRAIL_V4:L.TRAIL_V4}).railLayout;
 const start=src.indexOf('    const { placements, beams, parapets } = railLayout();'),end=src.indexOf('    return { kinds, placements, beams };',start);
 if(start<0||end<0)throw new Error('Actual static factory boundary changed');
 const actual=run('module.exports=(()=>{'+src.slice(start,end)+'return {kinds,placements,beams};})();',{railLayout,Matrix4,Vector3,A,...R});
 const knock=readFileSync(ROOT+'/src/components/world/WorldStreetKnock.tsx','utf8'),line=knock.split('\n').find(s=>s.trim().startsWith('const b = it.kind'));
 if(!line)throw new Error('Actual dynamic visual factory boundary changed');
 const timber=actual.beams.filter(it=>it.kind==='beam').map(it=>({item:it,...run('module.exports=(()=>{'+line+'return b;})();',
  {A,...R,it,dirIndex:0,buildersFor:()=>{throw new Error('Unexpected non-timber factory');}})}));
 return{A,R,C,G,L,Batch,railLayout,actual,timber,pure};
}
