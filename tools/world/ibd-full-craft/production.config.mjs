import config from '../../../astro.config.mjs';

// Sparse worktree preview: reuse the frozen public asset root in serve-review.py.
// Unlike review.config.mjs, this build has no performance toolbar injection.
export default {
  ...config,
  publicDir: '/tmp/ibd-full-craft-20261106/empty',
  outDir: '/tmp/bobby-ibd-full-playable-20261106',
};
