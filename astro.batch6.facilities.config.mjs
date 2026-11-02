import config from './astro.config.mjs';
export default {
  ...config,
  devToolbar: { enabled: false },
  vite: {
    ...config.vite,
    server: { ...config.vite.server, fs: { allow: [...config.vite.server.fs.allow,
      '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/public',
      '/tmp/bobby-world-batch5-public-r7-01a19a62'] } },
  },
};
