import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../../src/components/world/WorldRuntime.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('WorldRuntime.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
let callback;
function visit(node){if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onCreated')callback=node.initializer.expression.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(callback);
const compiled=ts.transpileModule(`const callback=${callback.replaceAll('import.meta.env.DEV','dev')};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
test('production skips synchronous shader diagnostics while development and explicit shaderDebug keep them',()=>{
 for(const [dev,search,expected]of [[false,'',false],[false,'?qa=1',false],[false,'?shaderDebug=1',true],[false,'?shaderDebug',true],[true,'',true],[true,'?shaderDebug=1',true]]){
  const callback=new Function('dev','window',compiled+';return callback;')(dev,{location:{search}}),gl={debug:{checkShaderErrors:true}};
  callback({gl});assert.equal(gl.debug.checkShaderErrors,expected,JSON.stringify({dev,search}));
 }
});
