/** Verify the generated /world entry, including literal dynamic imports. Does not execute JS. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { init, parse } from 'es-module-lexer';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node verify-entry-graph.mjs <frozen-build-directory>');
const root = path.resolve(directory), origin = 'http://frozen.invalid';
const queue = [], seen = new Set(), files = {}, missing = [], external = new Set();
let dynamicExpressions = 0, bytesRead = 0;
const resolve = (specifier, from) => {
  const url = new URL(specifier, origin + '/' + from);
  if (url.origin !== origin) { external.add(url.origin); return; }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) throw new Error('Reference outside frozen build');
  queue.push({ relative, from });
};
const inspectModule = (source, filename) => {
  for (const entry of parse(source, filename)[0]) {
    if (entry.d === -2) continue; // import.meta, not a module request
    if (entry.n === undefined) { dynamicExpressions++; continue; }
    resolve(entry.n, filename);
  }
};
await init;
const html = await fs.readFile(path.join(root, 'world/index.html'), 'utf8');
files['world/index.html'] = createHash('sha256').update(html).digest('hex');
for (const match of html.matchAll(/(?:src|component-url|renderer-url)=["']([^"']+)["']/g)) {
  if (/\.(?:m?js)(?:[?#]|$)/.test(match[1])) resolve(match[1], 'world/index.html');
}
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/type=["']module["']/.test(match[1]) && !/\bsrc=/.test(match[1])) inspectModule(match[2], 'world/index.html');
}
while (queue.length) {
  const { relative, from } = queue.shift();
  if (seen.has(relative)) continue;
  seen.add(relative);
  if (seen.size > 250) throw new Error('Unexpectedly large module graph');
  let source;
  try { source = await fs.readFile(path.join(root, relative)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missing.push({ path: relative, referencedBy: from }); continue;
  }
  bytesRead += source.length;
  if (bytesRead > 32 * 1024 * 1024) throw new Error('Unexpectedly large module graph');
  files[relative] = createHash('sha256').update(source).digest('hex');
  if (/\.(?:m?js)$/.test(relative)) inspectModule(source.toString('utf8'), relative);
}
const runtime = Object.keys(files).filter(name => /(?:^|\/)WorldRuntime\.[^/]+\.js$/.test(name));
const app = Object.keys(files).filter(name => /(?:^|\/)WorldApp\.[^/]+\.js$/.test(name));
const pass = missing.length === 0 && runtime.length > 0 && app.length > 0;
console.log(JSON.stringify({ status: pass ? 'PASS' : 'FAIL', build: root, checkedModules: seen.size,
  app, runtime, missing, externalOrigins: [...external], nonliteralImportsNotResolved: dynamicExpressions,
  limitation: 'Local literal module references only; does not certify WebGL, gameplay, or non-module assets.', files }, null, 2));
if (!pass) process.exitCode = 1;
