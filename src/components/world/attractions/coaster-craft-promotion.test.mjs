import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier+'.ts',context); throw error; }
} });
const { createCoasterStructure } = await import('./coaster-geometry.ts');
const { packCoasterStructure, unpackCoasterStructure } = await import('./coaster-structure-transfer.ts');
const { COASTER_ARCHITECTURE_CRAFT } = await import('./coaster-craft-promotion.ts');
const hash = a => createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const read = file => readFileSync(new URL(file,import.meta.url),'utf8');
const baseline = file => execFileSync('git',['show','b75c474:src/components/world/attractions/'+file],{encoding:'utf8'});
const signature = g => ({
  attributes: Object.fromEntries(Object.keys(g.attributes).sort().map(k => {
    const a = g.attributes[k]; return [k,[a.itemSize,a.normalized,a.array.constructor.name,hash(a.array)]];
  })),
  index: g.index && hash(g.index.array), sphere: g.boundingSphere?.toArray?.() || (g.boundingSphere && [g.boundingSphere.center.toArray(),g.boundingSphere.radius]),
  box: g.boundingBox && [g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],
});
const surface = s => ({...s,vertices:hash(s.vertices),indices:hash(s.indices)});
const packetSignature = value => ({
  steel:signature(value.steel),glow:signature(value.glow),
  colliders:value.colliders.map(c => ({...c,hull:c.hull && hash(c.hull)})),
  relief:surface(value.relief),track:surface(value.track),art:value.art,
});
const dispose = value => { value?.steel.dispose(); value?.glow.dispose(); };
function protectedRegion(g, min, max) {
  const position = g.getAttribute('position'), keys = Object.keys(g.attributes).sort(), digest = createHash('sha256');
  let triangles = 0;
  const count = g.index?.count || position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0,1,2].map(j => g.index ? g.index.getX(i+j) : i+j);
    const center = [0,1,2].map(k => ids.reduce((sum,id)=>sum+position.array[id*3+k],0)/3);
    if (!center.every((v,k)=>v>=min[k]&&v<=max[k])) continue;
    triangles++;
    for (const id of ids) for (const key of keys) {
      const a = g.attributes[key], offset = a.array.byteOffset+id*a.itemSize*a.array.BYTES_PER_ELEMENT;
      digest.update(Buffer.from(a.array.buffer,offset,a.itemSize*a.array.BYTES_PER_ELEMENT));
    }
  }
  return {triangles,hash:digest.digest('hex')};
}
const ast = text => ts.createSourceFile('component.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declaration = (tree,name) => tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
function calls(tree, within, name) {
  const result=[];function visit(n) {
    if(ts.isCallExpression(n)&&n.expression.getText(tree)===name)result.push(n);
    ts.forEachChild(n,visit);
  }visit(within);return result;
}
function opening(tree, within, tag, fragment) {
  let result;function visit(n) {
    if(ts.isJsxOpeningElement(n)&&n.tagName.getText(tree)===tag&&n.getText(tree).includes(fragment))result=n;
    ts.forEachChild(n,visit);
  }visit(within);assert.ok(result);return result.getText(tree);
}

test('near/far promotion preserves all collider/light/contact bytes and transfers the production derivative exactly',()=>{
  assert.equal(COASTER_ARCHITECTURE_CRAFT,true);
  for(const near of [false,true]) {
    let old, promoted, restored;
    try {
      old=createCoasterStructure(near,'full',false);
      promoted=createCoasterStructure(near,'full',true);
      assert.deepEqual(promoted.colliders,old.colliders,'original solid order, hulls, rotations and surfaces');
      assert.deepEqual(surface(promoted.track),surface(old.track),'track contact bytes');
      assert.deepEqual(surface(promoted.relief),surface(old.relief),'terrain contact bytes');
      assert.deepEqual(signature(promoted.glow),signature(old.glow),'all old luminous vertices and attributes');
      assert.deepEqual(promoted.art,old.art,'landscape identity');
      const oldVertices=old.steel.getAttribute('position').count, newVertices=promoted.steel.getAttribute('position').count;
      assert.ok(newVertices>0&&newVertices<oldVertices,'only old visuals disappear');
      for(const a of Object.values(promoted.steel.attributes))assert.ok(a.array.every(Number.isFinite));
      // Independent spatial assertions protect the two equipment buildings and
      // the staff access deck from overbroad "station" or "gate" range removal.
      for(const [min,max] of [
        [[7.9,.9,-187.1],[20.1,15,-176.8]],
        [[68,5,-292],[80,15.5,-281.9]],
        [[-3,15,-220],[15,17.8,-179.5]],
      ]) {
        const a=protectedRegion(old.steel,min,max),b=protectedRegion(promoted.steel,min,max);
        assert.ok(a.triangles>0,'protected equipment region is nonempty');assert.deepEqual(b,a);
      }
      const before=packetSignature(promoted);
      const {packet,transfer}=packCoasterStructure(promoted);
      assert.equal(new Set(transfer).size,transfer.length);
      const received=structuredClone(packet,{transfer});
      assert.ok(transfer.every(buffer=>buffer.byteLength===0),'sender relinquishes buffer ownership');
      restored=unpackCoasterStructure(received);
      assert.deepEqual(packetSignature(restored),before,'worker packet retains render/contact attributes');
      assert.equal(restored.steel.attributes.position.array,received.steel.attributes.position.array,'unpack does not clone arrays');
      assert.equal(restored.track.vertices,received.track.vertices);
      console.log(`promotion ${near?'near':'far'}: steel vertices ${oldVertices} -> ${newVertices}, colliders ${old.colliders.length}; contacts/glow/worker exact`);
    } finally {dispose(old);dispose(promoted);dispose(restored);}
  }
});

test('worker and synchronous cache use the same immutable factory default, while standalone building-art callers remain legacy',()=>{
  const factory=ast(read('./coaster-geometry.ts')),fn=declaration(factory,'createCoasterStructure');
  assert.equal(fn.parameters[2].initializer.getText(factory),'COASTER_ARCHITECTURE_CRAFT');
  const independent=declaration(factory,'addCoasterBuildingArt');
  assert.equal(independent.parameters[2].initializer?.getText(factory),'false');
  const worker=ast(read('./coaster-structure.worker.ts'));
  const invoked=calls(worker,worker,'createCoasterStructure');
  assert.equal(invoked.length,1);assert.equal(invoked[0].arguments.length,1);
  assert.equal(invoked[0].arguments[0].getText(worker),'event.data');
  const component=ast(read('./WorldIntentCoaster.tsx'));
  let cache;
  function visit(n){if(ts.isNewExpression(n)&&n.expression.getText(component)==='CoasterStructureCache')cache=n;ts.forEachChild(n,visit);}
  visit(component);
  assert.deepEqual(cache.arguments.map(n=>n.getText(component)),['createCoasterStructure','buildCoasterInWorker']);
});

test('train movement, three original car transforms, boarding click and parked contacts are unchanged',()=>{
  const a=ast(baseline('WorldIntentCoaster.tsx')),b=ast(read('./WorldIntentCoaster.tsx'));
  const old=declaration(a,'CoasterTrain'),current=declaration(b,'CoasterTrain');
  assert.equal(calls(a,old,'useFrame')[0].getText(a),calls(b,current,'useFrame')[0].getText(b));
  for(const [tag,fragment]of [['group','cars.current[i]'],['group','activateIntentTarget'],['RigidBody','coaster-parked-car']])
    assert.equal(opening(a,old,tag,fragment),opening(b,current,tag,fragment));
  for(const file of ['coaster-access.ts','coaster-transition.ts','coaster-track.ts','intent-sign-layout.ts','WorldIntentSigns.tsx'])
    assert.equal(read('./'+file),baseline(file),file+' physical or text contract');
  const da=ast(baseline('WorldIntentDevices.tsx')),db=ast(read('./WorldIntentDevices.tsx'));
  assert.equal(declaration(da,'IntentInteraction').getText(da),declaration(db,'IntentInteraction').getText(db));
  assert.equal(calls(da,declaration(da,'IntentGate'),'useBeforePhysicsStep')[0].getText(da),
    calls(db,declaration(db,'IntentGate'),'useBeforePhysicsStep')[0].getText(db));
});

function compiledFunction(file,name,env) {
  const js=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const tree=ts.createSourceFile('component.js',js,ts.ScriptTarget.Latest,true);
  const fn=declaration(tree,name).getText(tree).replace(/^export\s+(?:default\s+)?/,'');
  return new Function(...Object.keys(env),`return (${fn});`)(...Object.values(env));
}
const jsx=reactJsx;
function treeList(element) {
  if(!element||typeof element!=='object')return [];
  return [element,...[element.props?.children].flat(Infinity).flatMap(treeList)];
}
test('actual production JSX keeps static architecture in far mode and enables new device consumers only with the original lifecycle',()=>{
  for(const active of [false,true])for(const riding of [false,true]) {
    const structure={steel:{},glow:{},colliders:[],track:{vertices:[],indices:[]},relief:{vertices:[],indices:[]}};
    class Cache {get(){return structure;}peek(){return structure;}snapshot(){return {};}}
    const env={
      useIntentStore:selector=>selector({riding}),useMemo:f=>f(),useState:f=>[f(),()=>{}],useEffect:()=>{},
      CoasterStructureCache:Cache,createCoasterStructure:()=>{},buildCoasterInWorker:()=>{},coasterStructureMemory:{},
      COASTER_ARCHITECTURE_CRAFT:true,coasterWorld:p=>p,COASTER_GATE_Z:56,_jsx:jsx,_jsxs:reactJsxs,_Fragment:Fragment,
      ...Object.fromEntries(['WorldIntentReflectiveSurface','WorldCoasterStationCraft','WorldCoasterGateCraft','CoasterTrain',
        'WorldIntentDevices','WorldIntentSigns','CoasterCollisions','IntentMovingLight','RigidBody','TrimeshCollider','WorldCoasterVegetation','Suspense'].map(k=>[k,k])),
    };
    const rendered=treeList(compiledFunction('./WorldIntentCoaster.tsx','WorldIntentCoaster',env)({active}));
    const enabled=active||riding;
    const station=rendered.filter(o=>o.type==='WorldCoasterStationCraft');
    assert.equal(station.length,1);assert.equal(station[0].props.detailed,enabled);
    assert.equal(rendered.filter(o=>o.type==='WorldCoasterGateCraft'&&o.props.part==='static').length,1);
    for(const name of ['WorldIntentDevices','WorldIntentSigns','CoasterCollisions'])
      assert.equal(rendered.filter(o=>o.type===name).length,enabled?1:0,name);
    assert.equal(rendered.find(o=>o.type==='CoasterTrain').props.active,enabled);
  }
  const names=['WorldIntentWorkshopCraft','WorldIntentWorkshop','WorldCoasterChestTransfer','WorldCoasterGateCraft','IntentGate','IntentInteraction','Suspense'];
  const renderDevices=compiledFunction('./WorldIntentDevices.tsx','WorldIntentDevices',{
    COASTER_WORKSHOP_CRAFT:true,COASTER_ARCHITECTURE_CRAFT:true,_jsx:jsx,_jsxs:reactJsxs,_Fragment:Fragment,...Object.fromEntries(names.map(k=>[k,k])),
  });
  const devices=treeList(renderDevices());
  for(const name of ['WorldIntentWorkshopCraft','WorldCoasterChestTransfer','IntentGate'])
    assert.equal(devices.filter(o=>o.type===name).length,1,name);
  assert.equal(devices.filter(o=>o.type==='WorldIntentWorkshop').length,0);
  const keyVisual=devices.find(o=>o.type==='WorldCoasterChestTransfer').props.keyVisual;
  assert.equal(treeList(keyVisual).filter(o=>o.type==='WorldCoasterGateCraft'&&o.props.part==='key').length,1);
  assert.deepEqual(devices.filter(o=>o.type==='IntentInteraction').map(o=>o.props.target),['chest','gate','board']);
});
