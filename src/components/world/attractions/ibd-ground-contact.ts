import { IBD_TRUCK_WHEELS as wheels } from './ibd-yard-layout.ts';

const gl = (n: number) => Number(n.toFixed(4)).toFixed(4);
const nearestAxle = wheels.axles.map(z => `abs(p.y - ${gl(z)})`)
  .reduce((a, b) => `min(${a}, ${b})`);

/** Local ambient occlusion for the permanently parked truck. This does not paint
 * the albedo or replace the sun's directional shadows. Six contact patches and
 * a broad chassis penumbra reduce indirect light and the authored night fill.
 * The pattern is evaluated only on the paving, in the truck's local frame.
 */
export const IBD_GROUND_CONTACT_GLSL = /* glsl */`
float ibdTruckGroundVisibility(vec2 p) {
  vec2 body = abs(p - vec2(${gl(wheels.centerX)}, 14.5));
  if (body.x > 3.5 || body.y > 8.5) return 1.0;
  vec2 outside = max(body - vec2(1.5, 6.1), vec2(0.0));
  float chassis = 1.0 - smoothstep(0.0, 1.25, length(outside));
  vec2 tyre = vec2(abs(body.x - ${gl(wheels.halfTrack)}) / ${gl(wheels.halfWidth + .32)},
    ${nearestAxle} / ${gl(wheels.radius + .27)});
  float contact = 1.0 - smoothstep(0.0, 1.0, dot(tyre, tyre));
  return (1.0 - chassis * .36) * (1.0 - contact * .62);
}
`;
