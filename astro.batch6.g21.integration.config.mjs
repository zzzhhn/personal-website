import config from './astro.config.mjs';
// Current root rail build resources only; old HTML/_astro are excluded.
// The five G21 runtime files overlay this verified whitelist.
export default { ...config, publicDir: '/tmp/bobby-world-batch6-g21-integration-public-01a19a62' };
