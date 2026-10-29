import { defineConfig } from "astro/config";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { alphaReplayPlugin } from "./tools/world/alpha-mine-data/local-replay-plugin.mjs";

export default defineConfig({
  site: "https://bobbyzhong.com",
  output: "static",
  integrations: [react(), mdx(), sitemap()],
  vite: {
    // Linked worktrees share dependencies, but must not invalidate one another's optimizer URLs.
    cacheDir: fileURLToPath(new URL('./.astro/node_modules/.vite', import.meta.url)),
    plugins: [tailwindcss(), alphaReplayPlugin()],
    server: { fs: { allow: [fileURLToPath(new URL(".", import.meta.url)), realpathSync(fileURLToPath(new URL("./node_modules", import.meta.url)))] } },
  },
});
