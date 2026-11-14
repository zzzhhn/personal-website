// Test-only adapter; the original alpha-mine test loader is absent in this checkout.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('/tools/world/alpha-mine-tests/register.mjs'))
    return next(new URL('./register.mjs', import.meta.url).href, context);
  try { return await next(specifier, context); }
  catch (error) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return next(url.href, context);
      }
    }
    throw error;
  }
}
export async function load(url, context, next) {
  if (url.endsWith('/shadow-chunk-hull.test.mjs')) {
    // Node's CJS eval workers do not preload --import. Redirect only the absent
    // test bootstrap URL embedded in workerData, leaving test assertions intact.
    const source = readFileSync(new URL(url), 'utf8').replace(
      '../../../tools/world/alpha-mine-tests/register.mjs', '../../../tools/world/next-steps-20261114/register.mjs');
    return { format: 'module', shortCircuit: true, source };
  }
  if (url.startsWith('file:') && /\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
    const source = readFileSync(new URL(url), 'utf8').replaceAll('import.meta.env', '({ DEV: false })');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      fileName: fileURLToPath(url), compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText };
  }
  return next(url, context);
}
