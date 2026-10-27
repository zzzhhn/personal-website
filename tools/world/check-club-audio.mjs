import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// Sparse checkouts can build successfully while omitting runtime-only public assets.
const source = readFileSync(new URL('../../src/components/world/WorldClubAudio.ts', import.meta.url), 'utf8');
const tracks = [...source.matchAll(/url:\s*['"]([^'"]+\.mp3)['"]/g)].map(match => match[1]);
const publicDir = process.argv[2] ?? 'public';
if (!tracks.length) throw new Error('No Club track URLs found. Review the audio asset check.');
const missing = tracks.filter(url => {
  try { const file = statSync(resolve(publicDir, `.${url}`)); return !file.isFile() || file.size === 0; }
  catch { return true; }
});
if (missing.length) {
  console.error(`Missing Club audio in ${publicDir}:\n${missing.join('\n')}\nRestore the tracked assets before building.`);
  process.exitCode = 1;
} else console.log(`Club audio: ${tracks.length} runtime assets present in ${publicDir}.`);
