import { Vector3, Quaternion } from 'three';
import * as A from '../../../src/components/world/WorldStreetAssets.ts';
import { makeShape, stepDebris, supportPoints } from '../../../src/components/world/WorldStreetDebris.ts';
const hulls = A.lamp().L0.hulls();
const shape = makeShape(supportPoints(hulls), new Vector3(0, .55, 0), 140);
// Lamp toppled: lying along +X on ground y=1.14, rotated -90deg about Z.
const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2 + .3);
const s = { p: new Vector3(0, 1.6, 0), q, v: new Vector3(0, 0, 0), w: new Vector3(0, 0, 0), rest: 0, asleep: false };
const ground = () => 1.14;
const car = { kind: 'box', p: new Vector3(-6, 1.14 + .9, 0), q: new Quaternion(), half: new Vector3(2.33, 1.4, 1.18), v: new Vector3(5, 0, 0) };
for (let f = 0; f < 240; f++) {
  car.p.x += 5 / 60;
  stepDebris(s, shape, 1 / 60, ground, f > 30 ? [car] : []);
  if (f % 20 === 0) console.log(f, s.p.toArray().map(v => v.toFixed(2)).join(','), 'v', s.v.length().toFixed(2), 'w', s.w.length().toFixed(2), s.asleep);
}
