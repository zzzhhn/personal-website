import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';

const root = new URL('../../../../', import.meta.url);
const adapter = fs.readFileSync(new URL('src/components/world/WorldCampFacilityCraft.tsx', root), 'utf8');
// Evaluate the actual pure visual factory without importing WebGL hooks or creating a renderer.
const factoryCode = adapter.slice(adapter.indexOf('export function createCampFacilityVisual'), adapter.indexOf('\nfunction CraftVisual')).replace('export function', 'function');
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(`${factoryCode}\nglobalThis.create = createCampFacilityVisual;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);

test('PBR copies preserve exported physical classes while borrowing loader geometry/images', () => {
  const scene = new Group(), guitar = new Group(), strings = new Group();
  guitar.name = 'C12'; strings.name = 'C12_strings';
  const geometry = new BoxGeometry(), map = new Texture(), environment = new Texture();
  const wood = new MeshStandardMaterial({ roughness: .60, metalness: 0, map });
  const metal = new MeshStandardMaterial({ roughness: .30, metalness: .82 });
  guitar.add(new Mesh(geometry, wood), new Mesh(geometry, wood));
  strings.add(new Mesh(geometry, metal)); guitar.add(strings); scene.add(guitar);
  const visual = context.create(scene, 'C12', undefined, environment);
  assert.equal(visual.materials.length, 2);
  const meshes=[]; visual.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes[0].geometry, geometry);
  assert.equal(meshes[0].material, meshes[1].material);
  assert.notEqual(meshes[0].material, wood);
  assert.equal(meshes[0].material.map, map);
  assert.equal(meshes[0].material.envMap, environment);
  assert.equal(meshes[2].material.metalness, .82);
  assert.equal(meshes[2].material.roughness, .30);
  assert.ok(meshes.every(mesh => mesh.userData.facilityCraft));
  assert.ok(visual.root.getObjectByName('camp-content-C12-strings'));
  assert.equal(guitar.getObjectByName('C12_strings'), strings);
  visual.materials.forEach(material => material.dispose()); geometry.dispose(); wood.dispose(); metal.dispose(); map.dispose(); environment.dispose();
});

test('articulated subtree keeps geometry local and removes the already applied wok pivot once', () => {
  const scene=new Group(), family=new Group(), wok=new Group();
  family.name='C14'; wok.name='C14_wok'; wok.position.set(.0276710987,.3179999888,-.0723563731);
  wok.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial())); family.add(wok); scene.add(family);
  const visual=context.create(scene,'C14','C14_wok',null);
  assert.deepEqual(visual.root.position.toArray(),[0,0,0]);
  assert.equal(wok.position.y,.3179999888);
  assert.throws(() => context.create(scene,'C15',undefined,null),/missing C15/);
});

test('runtime adapter parses and legacy query bypasses candidate independent of qa flag', () => {
  for (const file of ['WorldCampFacilityCraft.tsx','WorldCampContent.tsx']) {
    const source=fs.readFileSync(new URL(`src/components/world/${file}`,root),'utf8');
    const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
    assert.equal(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  }
  const expression=adapter.match(/export const campFacilityLegacy = (.*);/)[1];
  const isLegacy=vm.runInNewContext(`(${expression.replace(': string','')})`,{URLSearchParams});
  assert.equal(isLegacy('?facilityCraft=legacy'),true);
  assert.equal(isLegacy('?qa=1&facilityCraft=legacy'),true);
  assert.equal(isLegacy('?qa=1'),false);
});

test('legacy static/glow batches reproduce frozen batch-4 inputs with no extra stove/lantern draw', () => {
  const current=fs.readFileSync(new URL('src/components/world/WorldCampContent.tsx',root),'utf8');
  const baseline=execFileSync('git',['show','2f22560fff2174195d8ce70b855ae4b871a388a7:src/components/world/WorldCampContent.tsx'],{cwd:root,encoding:'utf8'});
  const parse=source=>ts.createSourceFile('Camp.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const initializer=(source,name)=>{
    const file=parse(source); let expression;
    const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(file)===name)expression=node.initializer.getText(file);ts.forEachChild(node,visit);};
    visit(file); assert.ok(expression,`${name} exists`); return expression;
  };
  const evaluate=(expression,legacy)=>{
    const code=ts.transpileModule(`globalThis.result=(${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const context={legacy,m11:'m11',m14:'m14',lanternM:'lanternM',postM:['post0','post1'],
      byName:(id,node)=>[`${id}/${node}`],bake:(node,matrix)=>({node,matrix}),
      glowBake:(node,matrix,warm)=>({node,matrix,warm}),mergeGeometries:parts=>({draws:1,parts})};
    vm.runInNewContext(code,context); return JSON.parse(JSON.stringify(context.result));
  };
  for(const name of ['staticGeometry','glowGeometry']) {
    assert.deepEqual(evaluate(initializer(current,name),true),evaluate(initializer(baseline,name),true));
    const candidate=evaluate(initializer(current,name),false);
    assert.ok(candidate.parts.every(part=>!part.node.startsWith('C14/')&&!part.node.startsWith('C16/')));
  }
  const file=parse(current); let guarded=0;
  const visit=node=>{
    if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==='group') {
      const matrix=node.openingElement.attributes.properties.find(attribute=>attribute.name?.getText(file)==='matrix');
      if(matrix?.initializer&&['{data.m14}','{data.lanternM}'].includes(matrix.initializer.getText(file))) {
        assert.ok(ts.isBinaryExpression(node.parent));
        assert.equal(node.parent.left.getText(file),'!legacy');
        assert.equal(node.parent.operatorToken.kind,ts.SyntaxKind.AmpersandAmpersandToken); guarded++;
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(file); assert.equal(guarded,2);
});
