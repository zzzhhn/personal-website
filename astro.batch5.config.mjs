import config from './astro.config.mjs';

// Task-owned build wrapper; reuse original public through a read-only symlink overlay.
// Runtime assets authored in this worktree are linked into that overlay separately.
export default {
  ...config,
  publicDir: '/tmp/bobby-world-batch5-public-01a19a62',
};
