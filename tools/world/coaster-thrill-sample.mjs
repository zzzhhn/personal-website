import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const out=process.argv[2]??'/tmp/bobby-coaster-thrill-v4';
await mkdir(out,{recursive:true});
await build({entryPoints:[resolve(root,'tools/world/coaster-thrill-sample.ts')],bundle:true,format:'esm',target:'es2022',
  outfile:resolve(out,'sample.js'),minify:true,logLevel:'warning'});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>过山车 v4 · 轨道样板</title>
<style>
*{box-sizing:border-box}body{margin:0;overflow:hidden;background:#172b38;color:#eef3ef;font:14px system-ui}canvas{display:block;width:100vw;height:100vh;touch-action:none}
header{position:fixed;top:22px;left:24px;pointer-events:none;text-shadow:0 2px 5px #13252c}h1{font:25px 'Songti SC',serif;margin:0 0 8px}#status{font-variant-numeric:tabular-nums}
nav{position:fixed;bottom:22px;left:24px;right:24px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:#132a32ed;padding:12px 14px;border:1px solid #91a5a355;border-radius:12px}
button,select{font:inherit;color:inherit;background:#294650;border:1px solid #afc5bb55;border-radius:6px;padding:8px 12px;cursor:pointer}button[aria-pressed=true]{background:#567b78}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #ffd78c;outline-offset:3px}
input{accent-color:#e8b976;min-width:140px;flex:1}output{font-variant-numeric:tabular-nums;min-width:50px}aside{position:fixed;right:24px;top:22px;background:#132a32dc;border-radius:6px;padding:9px 12px;max-width:290px;font-size:12px;line-height:1.6}#metrics{display:block}
@media(max-width:650px){header{top:12px;left:12px}h1{font-size:20px}aside{display:none}nav{left:10px;right:10px;bottom:10px;gap:5px;padding:8px}button,select{padding:8px}}
</style><canvas aria-label="可旋转的三维过山车轨道样板"></canvas><header><h1>过山车 · 轨道样板</h1><div id="status">生成连续轨道…</div></header>
<aside>形体与乘坐验证，尚未铺设园区美术。<span id="metrics"></span></aside>
<nav><button id="play">开始乘坐</button><button id="overview" aria-pressed="true">总览</button><button id="chase" aria-pressed="false">跟车</button><button id="first" aria-pressed="false">第一人称</button><button id="night" aria-pressed="false">夜间</button><select id="element" aria-label="定位轨道段"><option value="0">车站</option></select><input id="time" type="range" min="0" value="0" step="0.05" aria-label="乘坐时间"><output id="clock">0 s</output></nav><script type="module" src="/sample.js"></script></html>`;
await writeFile(resolve(out,'index.html'),html);
console.log(JSON.stringify({out,built:true}));
if(process.argv.includes('--serve')) {
  const htmlData=Buffer.from(html),jsData=await readFile(resolve(out,'sample.js'));
  const server=createServer((req,res)=>{
    if(req.url!=='/'&&req.url!=='/sample.js'){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':req.url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    res.end(req.url==='/'?htmlData:jsData);
  });
  server.listen(4343,'127.0.0.1',()=>console.log('Track sample at http://127.0.0.1:4343/'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
