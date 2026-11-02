import config from './astro.config.mjs';
// Only baseline public resources; no old generated HTML or _astro directories.
export default { ...config, publicDir: '/tmp/bobby-world-batch5-public-r7-01a19a62' };
