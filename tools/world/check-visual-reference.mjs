import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const implementation = args.includes('--for-implementation');
const files = args.filter(arg => !arg.startsWith('--'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
function projectPath(path) {
  assert(typeof path === 'string' && path.length > 0 && !isAbsolute(path), 'Use a repository-relative asset path.');
  const full = resolve(root, path), rel = relative(root, full);
  assert(rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel), 'Asset path escapes the project.');
  return full;
}
try {
  assert(files.length === 1 && args.every(a => !a.startsWith('--') || a === '--for-implementation'),
    'Usage: node tools/world/check-visual-reference.mjs <manifest> [--for-implementation]');
  const pack = JSON.parse(readFileSync(projectPath(files[0]), 'utf8'));
  assert(pack.schemaVersion === 1 && typeof pack.scene === 'string', 'Invalid reference-pack schema.');
  assert(Array.isArray(pack.references) && pack.references.length > 0, 'Reference images are missing.');
  const roles = new Set();
  for (const asset of pack.references) {
    assert(typeof asset.role === 'string' && !roles.has(asset.role), 'Reference roles must be unique.');
    roles.add(asset.role);
    const digest = createHash('sha256').update(readFileSync(projectPath(asset.path))).digest('hex');
    assert(digest === asset.sha256, `Reference changed without re-calibration: ${asset.path}`);
  }
  for (const key of ['style', 'layout']) {
    const approval = pack.approvals?.[key];
    assert(approval && ['pending', 'approved', 'rejected'].includes(approval.status), `Missing ${key} review state.`);
    if (approval.status === 'approved') assert(approval.source === 'human-user' &&
      typeof approval.quote === 'string' && approval.quote.trim().length > 0 && typeof approval.date === 'string',
      `${key} approval needs an actual user quote and date.`);
  }
  assert(Array.isArray(pack.reviewViews) && pack.reviewViews.length >= 3, 'Capture viewpoints have not been defined.');
  assert(Array.isArray(pack.failureConditions) && pack.failureConditions.length >= 5, 'Visual failure criteria are missing.');
  if (implementation) {
    assert(roles.has('day') && roles.has('night'), 'Implementation needs both day and night references.');
    for (const key of ['style', 'layout']) assert(pack.approvals[key].status === 'approved', `${key} is not user-approved.`);
  }
  console.log(JSON.stringify({ scene: pack.scene, referenceIntegrity: 'passed',
    style: pack.approvals.style.status, layout: pack.approvals.layout.status,
    implementationReady: roles.has('day') && roles.has('night') && ['style', 'layout'].every(k => pack.approvals[k].status === 'approved'),
    visualAcceptance: 'requires human screenshot comparison', runtimeAcceptance: 'not evaluated by this command' }));
} catch (error) {
  console.error(JSON.stringify({ status: 'not-ready', reason: error.message }));
  process.exitCode = 1;
}
