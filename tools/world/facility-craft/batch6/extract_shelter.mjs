/** Exact TS source for the shelter native archive; no browser/build/Blender. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT, loadWorldModule } from '../street/runtime.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceDir = path.join(ROOT, 'tools/world/facility-craft/batch6/source');
mkdirSync(sourceDir, { recursive: true });
const A = loadWorldModule(), B = loadWorldModule('WorldStreetAssets.ts', '?craft6=baseline');
const node = builder => ({ name: 'shelter', translation: [0,0,0], position: builder.pos, normal: builder.nrm,
  color: builder.col, aMat: builder.mat, aSuv: builder.suv, index: builder.idx,
  parts: builder.parts.map(p => ({ ...p, end: p.end < 0 ? builder.pos.length / 3 : p.end })),
  baselineHullSHA256: hash(JSON.stringify(builder.hulls().map(h => [...h]))) });
const sourceFiles = ['WorldStreetAssets.ts','WorldStreetFacilityCraft.ts','WorldStreetGeometry.ts','WorldFacilitySurface.ts','WorldFacilityGlazing.ts','WorldStreetStatic.tsx','WorldStreetMaterial.ts'];
const data = { id: 'shelter', revision: 2, units: 'metres', runtimeUp: '+Y', nativeConversion: '(x,-z,y)',
  materialIdentity: 'frosted rear glass; WorldStreetAssets.ts shelterGeometry source comment and S.glass',
  runtimeSourceSHA256: Object.fromEntries(sourceFiles.map(f => [f, hash(readFileSync(path.join(ROOT,'src/components/world',f)))])),
  baseline: { L0: [node(B.shelterGeometry(0,[0,0,1,1]))], L1: [node(B.shelterGeometry(1,[0,0,1,1]))] },
  candidate: { L0: [node(A.shelterGeometry(0,[0,0,1,1]))], L1: [node(A.shelterGeometry(1,[0,0,1,1]))] },
  archiveBoundary: 'Exact TS geometry/UV/slot/color and frozen hull source. Portable PBR uses the same wood multiplier and alpha glass, but cannot represent runtime atlas, dither, shared time/env intensity or broad procedural paint variation. It is an editable archive, not final appearance acceptance.' };
const file=path.join(sourceDir,'shelter.source.json');writeFileSync(file,JSON.stringify(data));
console.log(JSON.stringify({source:file,sha256:hash(readFileSync(file)),candidateTriangles:data.candidate.L0[0].index.length/3,baselineTriangles:data.baseline.L0[0].index.length/3}));
