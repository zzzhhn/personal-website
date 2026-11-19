import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Evaluate the complete shipping entry, with its module scope and normal exports.
// Only host services and child components supplied by the caller are substituted.
export function compileWorldComponent(url, { lowerDynamicImports = false } = {}) {
  const resource = fileURLToPath(url), require = createRequire(url);
  const { outputFiles } = buildSync({
    entryPoints: [resource], write: false, format: 'cjs', target: 'es2022',
    jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' },
    ...(lowerDynamicImports && { supported: { 'dynamic-import': false } }),
  });
  const evaluate = new Function('require', 'module', 'exports', 'document', outputFiles[0].text);
  return (services = {}, document = globalThis.document) => {
    const module = { exports: {} };
    const resolve = id => {
      if (Object.hasOwn(services, id)) return services[id];
      if (id.endsWith('?url')) return require.resolve(id.slice(0, -4));
      return require(id);
    };
    evaluate(resolve, module, module.exports, document);
    return module.exports;
  };
}
