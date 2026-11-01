import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { checkWorldCraftAssets } from './check-world-craft-assets.mjs';

// Runtime-only GLBs and external images can be absent in sparse worktrees.
const root = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'public');
const source = readFileSync(new URL('../../src/components/world/djc-bar-layout.ts', import.meta.url), 'utf8');
const urls = [...source.matchAll(/['"]([^'"]+\.glb)['"]/g)].map(m => m[1]);
if (urls.length !== 2) throw new Error('Review the two north-bar asset URLs before building.');
const daybed = readFileSync(new URL('../../src/components/world/djc-daybed-visual.ts', import.meta.url), 'utf8');
const daybedUrls = [...daybed.matchAll(/['"]([^'"]+\.glb)['"]/g)].map(m => m[1]);
if (daybedUrls.length !== 1) throw new Error('Review the shared daybed asset URL before building.');
urls.push(...daybedUrls);
const lantern = readFileSync(new URL('../../src/components/world/djc-pool-lantern-visual.ts', import.meta.url), 'utf8');
const lanternUrls = [...lantern.matchAll(/['"]([^'"]+\.glb)['"]/g)].map(m => m[1]);
if (lanternUrls.length !== 1) throw new Error('Review the shared pool-lantern asset URL before building.');
// An absent candidate never blocks the unchanged default scene. Explicit review
// validates its complete native contract before the default switch can be enabled.
if (/DJC_POOL_LANTERN_ENABLED\s*=\s*true\b/.test(lantern) || process.argv.includes('--pool-lantern-candidate')) urls.push(...lanternUrls);
let images = 0;
for (const url of urls) {
  const file = resolve(root, `.${url}`), bytes = readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB: ${url}`);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  if (url === lanternUrls[0]) {
    if (doc.materials?.length !== 4) throw new Error('Pool lantern requires four native materials.');
    const primitives = (doc.meshes ?? []).flatMap(mesh => mesh.primitives);
    if (primitives.length !== 4 || !primitives.every(p => p.attributes.TEXCOORD_1 !== undefined)) throw new Error('Pool lantern requires four material batches with independent UV1 coordinates.');
    if (!doc.materials.some(m => m.extras?.djcRole === 'emissive-diffuser')) throw new Error('Pool lantern requires the authored diffuser role.');
    if (!doc.materials.every(m => m.occlusionTexture?.texCoord === 1)) throw new Error('Pool lantern requires independent UV1 AO on every material.');
    if (!doc.materials.every(m => (m.alphaMode ?? 'OPAQUE') === 'OPAQUE') || doc.extensionsUsed?.includes('KHR_materials_transmission')) throw new Error('Pool lantern materials must remain opaque without a transmission pass.');
    if (doc.extensions?.KHR_lights_punctual || doc.extensionsUsed?.includes('KHR_lights_punctual')) throw new Error('Pool lantern must not export real-time lights.');
  }
  for (const image of doc.images ?? []) {
    if (!image.uri) continue;
    const path = resolve(dirname(file), image.uri), rel = relative(root, path);
    if (rel.startsWith('..') || !statSync(path).isFile() || statSync(path).size === 0) throw new Error(`Missing furniture image: ${image.uri}`);
    images++;
  }
}
console.log(`Club furniture: ${urls.length} GLBs and ${images} external image references present.`);
const craft=checkWorldCraftAssets(root);
console.log(`World craft: ${craft.length} production GLBs present; ${craft.map(asset=>`${asset.kind} ${asset.primitives} batches`).join(', ')}.`);
