/** Writes fixtures.json: QA camera views placed on WorldLandform.meshHeight (the rendered and
 * collided ground). Run: node_modules/.bin/tsx tools/world/environment/fixtures.ts */
import { writeFileSync } from 'node:fs';
import { meshHeight } from '../../../src/components/world/WorldLandform';
const views = [
  { name: 'coast-west', x: -66, z: 4, zoom: 2 },
  { name: 'coast-north', x: -20, z: 54, zoom: 2 },
  { name: 'camp-edge', x: -42, z: 52, zoom: 2 },
  { name: 'camp-terrace-se', x: -24, z: 18, zoom: 1 },
  { name: 'coast-east-seawall', x: 24, z: -4, zoom: 1 },
].map(v => ({ ...v, ground: meshHeight(v.x, v.z) }));
writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify({ generatedBy: 'tools/world/environment/fixtures.ts', views }, null, 2));
console.log(views);
