import base from '../../../astro.config.mjs';
// Ordinary playable entry, without camera overrides or review controls.
// The local preview server supplies unchanged public assets from its rollback root.
export default { ...base, publicDir: '/tmp/bobby-car-pilot-empty-public' };
