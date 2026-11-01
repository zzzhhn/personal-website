import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Resolve the app's extensionless relative imports without changing production sources. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !context.parentURL || !/^\.{1,2}\//.test(specifier)) throw error;
    const url = new URL(specifier, context.parentURL);
    if (url.protocol !== 'file:' || extname(url.pathname)) throw error;
    for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const candidate = new URL(url.href + suffix);
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
    }
    throw error;
  }
}

/** Transpile syntax only. Project type checking remains a separate verification step. */
export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !/\.tsx?$/.test(new URL(url).pathname)) return nextLoad(url, context);
  const fileName = fileURLToPath(url);
  const result = ts.transpileModule(await readFile(fileName, 'utf8'), {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new SyntaxError(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  return { format: 'module', source: result.outputText, shortCircuit: true };
}
