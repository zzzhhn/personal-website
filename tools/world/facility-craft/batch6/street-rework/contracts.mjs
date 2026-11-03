import { createHash } from 'node:crypto';
import { loadWorldModule } from '../../street/runtime.mjs';
export const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const families = ['lamp','roadblock','signal'];
export function snapshot(search = '') {
  const [A,L] = loadWorldModule(['WorldStreetAssets.ts','layout-v4.ts'],search);
  return Object.fromEntries(families.map(kind => {
    const b = A[kind]();
    const items = kind === 'roadblock' ? L.OBSTACLES_V4 : L.knockablesV4().filter(x=>x.kind===kind);
    return [kind,{placements:items.length,home:sha(items),lods:[b.L0,b.L1].map(g=>{
      const emit = [];
      for (let i=0;i<g.idx.length;i+=3) {
        const ids=g.idx.slice(i,i+3);
        if (ids.some(j=>g.mat[j*4+2])) emit.push(ids.map(j=>[...g.pos.slice(j*3,j*3+3),...g.col.slice(j*3,j*3+3),g.mat[j*4+2]]));
      }
      return {triangles:g.triangles,vertices:g.pos.length/3,bytes:(g.pos.length+g.nrm.length+g.col.length+g.mat.length+g.suv.length+g.idx.length)*4,
        visual:sha([g.pos,g.nrm,g.col,g.mat,g.suv,g.idx]),hulls:sha(g.hulls().map(x=>[...x])),emit:sha(emit)};
    })}];
  }));
}
