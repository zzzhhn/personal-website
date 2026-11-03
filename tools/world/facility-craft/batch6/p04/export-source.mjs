import { writeFileSync } from 'node:fs';
import { loadWorldModule } from '../../street/runtime.mjs';
const [lamp, street] = loadWorldModule(['WorldParkLamp.ts', 'WorldStreetAssets.ts']);
const raw = street.lampGeometry({ ...lamp.PARK_LAMP_OPTIONS, lod: 0 });
const g = lamp.PARK_LAMP.geometry;
const parts = raw.parts.map(part => {
  const matches = raw.idx.flatMap((vertex, i) => vertex >= part.start && (part.end < 0 || vertex < part.end) ? [i] : []);
  if (matches.length !== matches.at(-1) - matches[0] + 1) throw Error('Noncontiguous source part ' + part.name);
  return { name: part.name, start: matches[0], end: matches.at(-1) + 1 };
});
const buffers = Object.fromEntries(['position','normal','color','aMat','aSuv','aEmit']
  .map(name => [name, [...g.getAttribute(name).array]]));
const node = { name: 'lamp-near', translation: [0,0,0], parts, ...buffers,
  index: Array.from({length: g.getAttribute('position').count}, (_,i) => i),
  baselineHullSHA256: '74e48bd9a1ce768e807f96c80735da723509120827d3585229b64e4fe07f888b' };
writeFileSync(process.argv[2], JSON.stringify({nodes:[node],
  archiveBoundary:'P04 near runtime mesh at its authored local origin. The original four hulls are external.'}));
