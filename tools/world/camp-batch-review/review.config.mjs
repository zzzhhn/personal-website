import config from '../../../astro.config.mjs';
const review = { name:'camp-batch-review', enforce:'pre', transform(source,id) {
  if(id.split('?')[0].endsWith('/WorldCamp.tsx')) {
    const anchor='<group name="world-camp-slice">';
    if(!source.includes(anchor)) throw new Error('Camp review anchor missing');
    return "import CampBatchReview from '../../../tools/world/camp-batch-review/CampBatchReview';\n"+source.replace(anchor,anchor+'<CampBatchReview />');
  }
}};
export default {...config,publicDir:'/tmp/camp-batch-20261107/empty',outDir:'/tmp/camp-batch-20261107/review',vite:{...config.vite,plugins:[review,...config.vite.plugins]}};
