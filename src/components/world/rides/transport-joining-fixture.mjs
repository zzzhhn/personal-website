import assert from 'node:assert/strict';
import { TransportDriver } from './transport-driver.ts';
import { transportWorld } from './transport-route.ts';
import { rideFootRouteClear } from './ride-clearance.ts';

/** Called inside the existing boat/cabin/sled physical geometry fixtures. */
export function verifyPhysicalBoardingJoins(world, rapier, body, route, index) {
  const path = route.terminals[index].boarding.map(p => transportWorld(p, route.transform));
  const [a, b] = path;
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  const guard = (from, to) => rideFootRouteClear(world, rapier, body, [from, to]);
  let checked = 0;
  for (const forward of [.25, .6]) for (const side of [-.2, 0, .2]) {
    const t = Math.min(forward / length, .8);
    const root = [a[0] + dx * t - dz / length * side, a[1] + (b[1] - a[1]) * t, a[2] + dz * t + dx / length * side];
    assert.ok(Math.hypot(root[0] - a[0], root[2] - a[2]) < 2.1, 'start remains inside the E interaction radius');
    const driver = new TransportDriver(route, index);
    driver.setMovementGuard(guard);
    driver.capture(root, Math.atan2(-dz, dx) + Math.PI);
    const label = `${route.id}/${index} forward=${forward} side=${side}`;
    assert.ok(rideFootRouteClear(world, rapier, body, driver.boardingPath), `${label}: complete joining route clears actual geometry`);
    for (let frame = 0; frame < 3600 && driver.phase !== 'riding'; frame++) {
      const before = [...driver.frame.root];
      driver.step(1 / 60, false);
      assert.equal(driver.blockedMotion, false, `${label}: movement guard does not stop at a real corner`);
      const x = driver.frame.root[0] - before[0], z = driver.frame.root[2] - before[2];
      if (driver.phase === 'approach' && Math.hypot(x, z) > 1e-8) {
        const error = driver.frame.yaw - Math.atan2(-z, x);
        assert.ok(Math.abs(Math.atan2(Math.sin(error), Math.cos(error))) < Math.PI / 12, `${label}: faces actual displacement`);
      }
    }
    assert.equal(driver.phase, 'riding', `${label}: reaches the seat`);
    checked++;
  }
  return checked;
}
