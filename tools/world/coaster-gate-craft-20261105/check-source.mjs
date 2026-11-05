/** Lightweight authored-source contract; no Blender, renderer or full app build. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const adapterFile = 'src/components/world/attractions/WorldCoasterGateCraft.tsx';
const adapter = read(adapterFile);
const native = read('tools/world/coaster-gate-craft-20261105/build.py');
for (const name of ['GateStatic', 'GateLeaf', 'GateKey']) {
  assert(native.includes(`owner("${name}")`), name);
  assert(adapter.includes(`'${name}'`), name);
}
assert(adapter.includes('useGLTF(assetUrl)'));
assert(adapter.includes('useDjcFurnitureEnvironment()'));
assert(adapter.includes('sourceMaterial.clone()'));
assert(adapter.includes('dispose={null}'));
assert(!/setInterval|setTimeout|useIntentStore|RigidBody|Collider|pointLight|useInteractable/.test(adapter));
assert(!/useGLTF\.preload/.test(adapter), 'Do not eagerly load a source-only candidate');
assert(native.includes('export_lights=False'));
assert(native.includes('export_animations=False'));
assert(native.indexOf('save_as_mainfile') < native.indexOf('bpy.ops.object.join()'));
const result = ts.transpileModule(adapter, {
  fileName: fileURLToPath(new URL(adapterFile, root)), reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
});
const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
console.log(JSON.stringify({ sourceContract: 'passed', roots: 3, adapterSyntax: 'passed',
  scope: 'authored source strings and TS syntax only; no export/runtime/visual/performance claim' }));
