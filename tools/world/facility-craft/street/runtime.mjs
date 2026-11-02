/** Lightweight TS loader for this exact procedural asset source, no browser or bundler job. */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(import.meta.url);
const codeCache = new Map();
export function loadWorldModule(entry = 'WorldStreetAssets.ts', search = '', baseline = false) {
  const modules = new Map(), world = path.join(ROOT, 'src/components/world');
  const run = file => {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const old = baseline && file.endsWith('/WorldStreetAssets.ts');
    const id = `${file}:${old}`;
    if (!codeCache.has(id)) {
      const source = old ? execFileSync('git', ['show', '2f22560:src/components/world/WorldStreetAssets.ts'], { cwd: ROOT, encoding: 'utf8' }) : readFileSync(file, 'utf8');
      codeCache.set(id, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText);
    }
    const localRequire = specifier => {
      if (!specifier.startsWith('.')) return require(specifier);
      const absolute = path.resolve(path.dirname(file), specifier);
      const resolved = [absolute, `${absolute}.ts`, `${absolute}.tsx`, `${absolute}.js`].find(existsSync);
      if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${file}`);
      return run(resolved);
    };
    vm.runInNewContext(codeCache.get(id), { module, exports: module.exports, require: localRequire,
      window: { location: { search } }, URLSearchParams, console, Float32Array, Float64Array, Uint32Array, Uint16Array, Uint8Array, Int32Array,
    }, { filename: file, timeout: 2000 });
    return module.exports;
  };
  // Related adapters/proxies must share this module cache in fixture tests.
  return Array.isArray(entry) ? entry.map(name => run(path.resolve(world, name))) : run(path.resolve(world, entry));
}
export function families(A) {
  return {
    bench: [A.benchGeometry(0), A.benchGeometry(1)],
    shelter: [A.shelterGeometry(0, [.04, .08, .6, .7]), A.shelterGeometry(1, [.04, .08, .6, .7])],
    lamp: [A.lampGeometry({ height: 4.4, arm: 1.35 }), A.lampGeometry({ height: 4.4, arm: 1.35, lod: 1 })],
    signal: [A.signalGeometry(0), A.signalGeometry(1)], bin: [A.binGeometry(0), A.binGeometry(1)],
    roadblock: [A.roadblockGeometry(0), A.roadblockGeometry(1)],
    seawallBay: [A.seawallBay(0, 2), A.seawallBay(1, 2)],
    timberPost: [A.timberPost(0), A.timberPost(1)], timberBeam: [A.timberBeam(0, 4.2), A.timberBeam(1, 4.2)],
  };
}
