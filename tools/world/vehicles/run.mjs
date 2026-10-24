/** bot-run.sh wrapper: run.mjs <out-dir-ignored> <script relative to repo> KEY=VALUE ...
  * bot-run passes args after the output dir; this sets them as env vars and imports the script. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [script,...pairs]=process.argv.slice(2);
for(const p of pairs){const i=p.indexOf('=');if(i>0)process.env[p.slice(0,i)]=p.slice(i+1);}
if(!script||!script.startsWith('tools/world/')||script.includes('..'))throw new Error('script must be tools/world/...');
await import(pathToFileURL(path.resolve(script)).href);
