import base from '../coaster-car-pilot/review.config.mjs';

// Only the three track families change in this comparison. Architecture,
// carriage, lighting, shadows, weather and camera contracts remain identical.
const rail = { name: 'rail-craft-comparison', enforce: 'pre', transform(code, id) {
  if (id.endsWith('/coaster-rail-craft-enabled.ts') && process.env.COASTER_RAIL_BASELINE === '1')
    return code.replace('COASTER_RAIL_CRAFT = true', 'COASTER_RAIL_CRAFT = false');
  if (id.endsWith('/layout-v4-flag.ts')) return code.replace('export const WORLD_SHOTS_V4 = [', `export const WORLD_SHOTS_V4 = [
    {id:'scene-rail-detail-day',position:[68,12.8,-328] as Vec3,target:[62.5,8,-334.2] as Vec3},
    {id:'scene-rail-detail-night',position:[68,12.8,-328] as Vec3,target:[62.5,8,-334.2] as Vec3},`);
} };
const controls = base.vite.plugins.map(plugin => plugin.name === 'single-car-astra-review' ? {
  ...plugin, transform(code, id) {
    const result = plugin.transform(code, id);
    return id.endsWith('/WorldRuntime.tsx') && typeof result === 'string'
      ? result.replace("button('侧面',", "button('轨道细节',()=>view('scene-rail-detail'));button('轨道侧面',()=>view('scene-short-bay'));button('侧面',")
      : result;
  },
} : plugin);
export default { ...base, vite: { ...base.vite, plugins: [rail, ...controls] } };
