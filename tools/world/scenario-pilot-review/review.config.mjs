import config from '../../../astro.config.mjs';
const review = { name: 'tent-pilot-review', enforce: 'pre', transform(source, id) {
  if (id.split('?')[0].endsWith('/WorldCamp.tsx')) {
    source = "import TentPilotReview from '../../../tools/world/scenario-pilot-review/TentPilotReview';\n" + source;
    const anchor = '<group name="world-camp-slice">';
    if (!source.includes(anchor)) throw new Error('Missing camp review anchor');
    source = source.replace(anchor, anchor + '<TentPilotReview />');
  }
  return source;
} };
export default { ...config, publicDir: '/tmp/scenario-pilot-20261107/empty', outDir: '/tmp/scenario-pilot-20261107/review', vite: { ...config.vite, plugins: [review, ...config.vite.plugins] } };
