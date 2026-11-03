import base from '../../../astro.config.mjs';

// Test-only freeze cameras; not included in production layout or camera code.
const views = [
  ['station', [56, 4.1, -127.5], [48, 6.2, -146]],
  ['intake', [31.1, 3.55, -115.6], [34, 2.25, -122]],
].flatMap(([id, position, target]) => ['day', 'night'].map(time => ({
  id: `craft-${id}-${time}`, position, target,
})));
const review = { name: 'coaster-craft-paired-review', enforce: 'pre', transform(code, id) {
  if (id.endsWith('/layout-v4-flag.ts')) {
    const marker = 'export const WORLD_SHOTS_V4 = [';
    if (!code.includes(marker)) throw new Error('Review shot insertion point missing');
    return code.replace(marker, `${marker}\n${views.map(view => `{id:${JSON.stringify(view.id)},position:${JSON.stringify(view.position)} as Vec3,target:${JSON.stringify(view.target)} as Vec3}`).join(',\n')},`);
  }
  if (id.endsWith('/WorldIntentSurface.tsx')) {
    const marker = '  return <meshStandardMaterial';
    if (!code.includes(marker)) throw new Error('Review material insertion point missing');
    return code.replace(marker, `  craft = craft && (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('craftCompare') !== 'baseline');\n${marker}`);
  }
} };
export default { ...base, publicDir: process.env.COASTER_CRAFT_EMPTY_PUBLIC,
  vite: { ...base.vite, plugins: [review, ...base.vite.plugins] } };
