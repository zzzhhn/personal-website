import { loadPlaywright, CHROME, openWorld, canvasFacts, Bot } from './lib.mjs';
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await openWorld(browser, process.argv[2] || 'https://48c59fd5.personal-website-aew.pages.dev/world/?qa=1');
const bot = new Bot(ctx.page);
console.log(JSON.stringify({ readyMs: ctx.readyMs, assets: ctx.assetsLoaded, errors: ctx.errors, facts: await canvasFacts(ctx.page), fb: await bot.feedback(), api: await ctx.page.evaluate(() => Object.keys(window.__worldDebug)) }, null, 1));
await browser.close();
