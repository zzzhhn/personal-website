import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

// Runtime-only GLBs and external images can be absent in sparse worktrees.
const root = resolve(process.argv[2] ?? 'public');
const source = readFileSync(new URL('../../src/components/world/djc-bar-layout.ts', import.meta.url), 'utf8');
const urls = [...source.matchAll(/['"]([^'"]+\.glb)['"]/g)].map(m => m[1]);
if (urls.length !== 2) throw new Error('Review the two north-bar asset URLs before building.');
let images = 0;
for (const url of urls) {
  const file = resolve(root, `.${url}`), bytes = readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB: ${url}`);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  for (const image of doc.images ?? []) {
    if (!image.uri) continue;
    const path = resolve(dirname(file), image.uri), rel = relative(root, path);
    if (rel.startsWith('..') || !statSync(path).isFile() || statSync(path).size === 0) throw new Error(`Missing bar image: ${image.uri}`);
    images++;
  }
}
console.log(`Club bar: ${urls.length} GLBs and ${images} external image references present.`);
