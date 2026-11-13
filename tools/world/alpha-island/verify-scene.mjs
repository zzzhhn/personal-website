import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=mkdtempSync(join(tmpdir(),'alpha-scene-tests-'));
const run=args=>{const p=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(p.status!==0)throw new Error('Scene verification failed.');};
try{run(['--experimental-strip-types','--test','src/components/world/alpha-island/alpha-terrain.test.mjs','src/components/world/alpha-island/alpha-walk.test.mjs']);const output=join(dir,'state.mjs');await build({entryPoints:[resolve(root,'src/components/world/alpha-island/alpha-state.test.mjs')],bundle:true,platform:'node',format:'esm',outfile:output});run(['--test',output]);}finally{rmSync(dir,{recursive:true,force:true});}
