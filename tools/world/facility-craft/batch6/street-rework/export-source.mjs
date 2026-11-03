import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWorldModule } from '../../street/runtime.mjs';
import { families, sha } from './contracts.mjs';

const directory = resolve(process.argv[2] ?? 'docs/world/phase-2-playground/asset-batch6-20261103/street-rework/native');
mkdirSync(directory, { recursive:true });
const assets = loadWorldModule('WorldStreetAssets.ts');
for (const family of families) {
  const { L0, L1 } = assets[family]();
  const nodes = [L0,L1].map((g,i)=>({
    name:family+'-L'+i, translation:[0,0,0], position:g.pos, normal:g.nrm,
    color:g.col, aMat:g.mat, aSuv:g.suv, index:g.idx,
    baselineHullSHA256:sha(g.hulls().map(h=>[...h])),
    parts:g.parts.map(p=>({...p,end:p.end < 0 ? g.pos.length/3 : p.end})),
  }));
  writeFileSync(resolve(directory,family+'.source.json'),JSON.stringify({family,nodes,
    archiveBoundary:'Actual local near and far builders. Collision, glow timing and environment stay in the runtime.'}));
}
