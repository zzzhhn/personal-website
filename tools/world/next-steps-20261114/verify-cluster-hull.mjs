import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { clusterHull as legacy, clear as clearLegacy } from './legacy-cluster-hull.mjs';

const root = new URL('../../../', import.meta.url);
const source = readFileSync(new URL('src/components/world/WorldShadows.ts', root), 'utf8');
const body = source.slice(source.indexOf('const CLUSTER_AXES ='), source.indexOf('\nfunction rebuildGroups()'));
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { run, clear } = new Function('BufferAttribute', 'BufferGeometry', 'Vector3', 'ConvexGeometry',
  `const clusters = new Map(); ${compiled}; return {run:clusterHull,clear:()=>clusters.clear()};`)(BufferAttribute, BufferGeometry, Vector3, ConvexGeometry);
const ast = ts.createSourceFile('cluster.ts', body, ts.ScriptTarget.ES2022, true);
let quantizer;
function findQuantizer(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'quantize') quantizer = node.initializer.getText(ast);
  ts.forEachChild(node, findQuantizer);
}
findQuantizer(ast);
const quantize = new Function(ts.transpileModule(`const q=${quantizer};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText + '; return q;')();
let roundingCases=0;
for (let i=-20000;i<=20000;i++) {
  for (const value of [i/20000, Math.fround(i/20000), i/20000+1e-14, i/20000-1e-14]) {
    const fixed=value.toFixed(4), expected=fixed.startsWith('-') ? -Math.round(Math.abs(Number(fixed))*10000)-1 : Math.round(Number(fixed)*10000);
    assert.equal(quantize(value), expected, `numeric quantization matches ${value}.toFixed(4)`); roundingCases++;
  }
}

// Decode the authored Draco wind attributes directly; no texture or browser mocks.
const require = createRequire(import.meta.url);
const decoderPath = require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js');
const decoderModule = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', readFileSync(decoderPath, 'utf8'))(
  decoderModule, decoderModule.exports, require, dirname(decoderPath), decoderPath);
const draco = await decoderModule.exports({});
function loadWindMeshes(path) {
  const bytes = readFileSync(new URL(path, root)), jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binary = bytes.subarray(28 + jsonLength), meshes = [];
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    if (!('_WIND' in primitive.attributes)) continue;
    const ext = primitive.extensions.KHR_draco_mesh_compression, view = gltf.bufferViews[ext.bufferView];
    const encoded = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const decoder = new draco.Decoder(), buffer = new draco.DecoderBuffer(), decoded = new draco.Mesh();
    buffer.Init(encoded, encoded.byteLength);
    const status = decoder.DecodeBufferToMesh(buffer, decoded); assert.ok(status.ok(), status.error_msg());
    const g = new BufferGeometry();
    for (const [name, key] of [['position', 'POSITION'], ['_wind', '_WIND']]) {
      const attribute = decoder.GetAttributeByUniqueId(decoded, ext.attributes[key]), values = new draco.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(decoded, attribute, values);
      const data = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
      g.setAttribute(name, new BufferAttribute(data, attribute.num_components())); draco.destroy(values);
    }
    const indices = new Uint32Array(decoded.num_faces() * 3), face = new draco.DracoInt32Array();
    for (let i = 0; i < decoded.num_faces(); i++) {
      decoder.GetFaceFromMesh(decoded, i, face); for (let j = 0; j < 3; j++) indices[i * 3 + j] = face.GetValue(j);
    }
    g.setIndex(new BufferAttribute(indices, 1)); meshes.push({ name: `${path}:${mesh.name}`, geometry: g });
    draco.destroy(face); draco.destroy(status); draco.destroy(decoded); draco.destroy(buffer); draco.destroy(decoder);
  }
  return meshes;
}
let seed = 817239;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function cards(count) {
  const p = [], w = [], idx = [];
  for (let c = 0; c < count; c++) {
    const x = random()*9-4.5, y=random()*7, z=random()*9-4.5, base=p.length/3;
    for (const [u,v] of [[-.1,0],[.1,0],[-.1,.3],[.1,.3]]) {
      p.push(x+u,y+v,z+u*.3); w.push(random(),random(),random(),random());
    }
    idx.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  const g = new BufferGeometry(); g.setAttribute('position',new BufferAttribute(new Float32Array(p),3));
  g.setAttribute('_wind',new BufferAttribute(new Float32Array(w),4)); g.setIndex(idx); return g;
}
const fixtures = [...Array.from({length:24},(_,i)=>({name:`random-leaves-${i}`,geometry:cards(10+i*5)})),
  ...['G16','G17','G18'].flatMap(id=>loadWindMeshes(`public/assets/world/nature-craft/${id}.glb`))];
const edge=cards(6), pos=edge.getAttribute('position');
for (let i=0;i<pos.count;i++) pos.setX(i,[-0,0,-.000001,.000001,-.03125,.03125,-.09375,.09375][i%8]);
fixtures.push({name:'rounding-half-ties-negative-zero',geometry:edge});
let cases=0, reduced=0;
for (const {name,geometry:g} of fixtures) for (const cell of [.3,.6,1.2]) {
  const a=legacy(g,cell),b=run(g,cell);
  for (const attribute of ['position','_wind']) assert.deepEqual(b.getAttribute(attribute)?.array,a.getAttribute(attribute)?.array,`${name}:${cell}:${attribute}`);
  assert.deepEqual(b.index?.array,a.index?.array,`${name}:${cell}:index`);
  assert.deepEqual(b.boundingSphere,a.boundingSphere,`${name}:${cell}:bounds`);
  assert.equal(b===g,a===g,`${name}:${cell}:fallback`); cases++; if(b!==g)reduced++;
}
function measure(fn,reset,fixtures,rounds) {
  const samples=[];
  for(let i=0;i<rounds+3;i++){
    reset(); const start=performance.now();
    for(const {geometry} of fixtures){const g=fn(geometry,.6);if(g!==geometry)g.dispose();}
    const ms=performance.now()-start;if(i>=3)samples.push(ms);
  }
  samples.sort((a,b)=>a-b);return samples[Math.floor(samples.length/2)];
}
const real=fixtures.filter(f=>f.name.startsWith('public/'));
const before=measure(legacy,clearLegacy,real,15), after=measure(run,clear,real,15);
const report={cases,reduced,roundingCases,realWindMeshes:real.map(f=>({name:f.name,vertices:f.geometry.getAttribute('position').count})),
  timing:{scope:'Node CPU, authored G16/G17/G18 wind meshes; no browser frame-time claim',legacyMedianMs:before,numericMedianMs:after,speedup:before/after}};
console.log(JSON.stringify(report,null,2));
assert.ok(after<before,'numeric welding should improve median CPU time on authored wind meshes');
for(const {geometry}of fixtures)geometry.dispose();
