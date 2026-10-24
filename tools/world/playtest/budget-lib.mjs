/** Shared helpers for budget-*.mjs (render session). Real mouse drags / wheel only. */
export const look = (dx, dz) => Math.atan2(-dz, -dx);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const cam = page => page.evaluate(() => __worldDebug.camera());
async function drag(page, W, H, dx, dy) {
  const cx = W / 2, cy = H / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(120);
}
/** Closed-loop aim (gain measured from the previous step) to { yaw, pitch, distance }. */
export async function aim(page, target, W = 1920, H = 1080) {
  let gy = null, gp = null;
  const clamp = v => Math.max(-700, Math.min(700, v));
  for (let i = 0; i < 8; i++) {
    const c = await cam(page);
    const ey = wrap(target.yaw - c.yaw), ep = target.pitch - c.pitch;
    if (Math.abs(ey) < .03 && Math.abs(ep) < .03) break;
    const px = clamp(gy ? ey / gy : Math.sign(ey) * Math.min(300, Math.abs(ey) * 200)), py = clamp(gp ? ep / gp : Math.sign(ep) * Math.min(200, Math.abs(ep) * 200));
    await drag(page, W, H, px, py);
    const d = await cam(page);
    const dy = wrap(d.yaw - c.yaw), dp = d.pitch - c.pitch;
    if (Math.abs(px) > 5 && Math.abs(dy) > 1e-3) gy = dy / px;
    if (Math.abs(py) > 5 && Math.abs(dp) > 1e-3) gp = dp / py;
  }
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < 40; i++) {
    const c = await cam(page), e = target.distance - c.desiredDistance;
    if (Math.abs(e) < .6) break;
    await page.mouse.wheel(0, e > 0 ? 120 : -120); await page.waitForTimeout(60);
  }
  await page.waitForTimeout(900);
  return cam(page);
}
