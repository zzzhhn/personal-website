import config from '../../../astro.config.mjs';
import {execFileSync} from 'node:child_process';
const before=process.env.TOWN_CRAFT_BASELINE==='1';
const plugin={name:'town-craft-review',enforce:'pre',transform(source,id){
 const name=id.split('?')[0].split('/').at(-1);
 if(name==='WorldTownAssets.tsx'){
  if(before)source=execFileSync('git',['show','63f3fe3:src/components/world/WorldTownAssets.tsx'],{encoding:'utf8'});
  source="import TownCraftReview from '../../../tools/world/town-craft/TownCraftReview';\n"+source;
  source=source.replace(/<group ref=\{group\} name="world-town-assets"(?: dispose=\{null\})?>/,`<group ref={group} name="world-town-assets"><TownCraftReview stats={built.stats} variant="${before?'before-63f3fe3':'town-craft-r1'}" />`);
 }
 return source;
}};
export default {...config,publicDir:'/tmp/town-craft-20261107/empty',outDir:before?'/tmp/town-craft-20261107/before':'/tmp/town-craft-20261107/site',vite:{...config.vite,plugins:[plugin,...config.vite.plugins]}};
