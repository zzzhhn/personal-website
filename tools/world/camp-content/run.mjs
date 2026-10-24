/** Camp-content QA runner: `node tools/world/camp-content/run.mjs <task> [args]`.
 * Sets the bot environment defaults (SESSION-RULES §6) so no shell env prefix is needed, then runs
 * tools/world/camp-content/<task>.mjs. Only scripts in this directory can be run. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.WORLD_BROWSER_MODULES ||= '/Users/bobby/.cache/codex-runtimes/codex-primary-runtime/dependencies/node';
process.env.WORLD_BASE_URL ||= 'http://127.0.0.1:4339';
const task = process.argv[2];
if (!task || !/^[a-z0-9-]+$/.test(task)) { console.error('usage: run.mjs <task> [args]'); process.exit(2); }
process.argv.splice(2, 1);
await import(pathToFileURL(path.join(here, `${task}.mjs`)).href);
