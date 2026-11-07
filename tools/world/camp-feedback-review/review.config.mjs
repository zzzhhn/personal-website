import config from '../../../astro.config.mjs';
const review = { name:'camp-feedback-review', enforce:'pre', transform(source,id) {
  if(id.split('?')[0].endsWith('/WorldCamp.tsx')) {
    const anchor='<group name="world-camp-slice">';
    if(!source.includes(anchor)) throw new Error('Camp review anchor missing');
    return "import CampFeedbackReview from '../../../tools/world/camp-feedback-review/CampFeedbackReview';\n"+source.replace(anchor,anchor+'<CampFeedbackReview />');
  }
}};
export default {...config,publicDir:'/tmp/camp-feedback-20261107/empty',outDir:'/tmp/camp-feedback-20261107/review',vite:{...config.vite,plugins:[review,...config.vite.plugins]}};
