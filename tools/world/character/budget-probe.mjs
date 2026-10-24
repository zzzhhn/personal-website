import { loadPlaywright, CHROME } from '/Users/bobby/Desktop/3D-personal-world/wt/character/tools/world/playtest/lib.mjs';
const b=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const p=await b.newPage();await p.goto('http://127.0.0.1:4336/world/?qa=1',{waitUntil:'networkidle'});
await p.waitForFunction(()=>window.__worldDebug?.actor().loaded,undefined,{timeout:90000});
console.log(JSON.stringify(await p.evaluate(()=>__worldDebug.actor().budget)));await b.close();
