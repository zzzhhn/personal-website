# Baseline c507506 (Cloudflare 48c59fd5, 2026-10-21)

Run once with `node tools/world/playtest/baseline.mjs`. The two walking cases were rerun once with `PT_ONLY` because the first run hit a tool failure (Playwright's video recorder needs an ffmpeg binary I did not install). Recording now uses an in-page canvas MediaRecorder. Machine: Apple M5 Pro, 48 GB, Chrome 155 headless, ANGLE Metal on the real GPU. **This machine is not M1 certification.** Raw data: `baseline-report.json`, `analysis.json`, `frames/`, `video/`, `../audit/asset-vs-collider.json`.

Walking routes start from a fresh spawn and use only real keys (`fixtureTeleports: []` in every walking case). Block positions are inferred from the position stalling while keys are held, then compared with the collider faces in source. c507506 has no contact API, so the identity of the touched collider is **not proven**.

## Confirmed defects (walked + source/audit)

| # | Defect | Evidence |
| --- | --- | --- |
| D1 | G19–G23 rocks/shrubs have no collider | Real keys walked straight chords through three instances with 0 blocks and 0 recoveries. Closest approach to the instance centre: G21 0.135 m, G21(s0.9) 0.413 m, G20 0.441 m. The strict 0.35 m rule only counts the first; the other two put the 0.34 m capsule deep inside a 2.2–2.8 m footprint, which is still passable. Source: `WorldCamp.createNature` says "No colliders". Image: `frames/nature-G21_rock_150deg-inside.png`, video `video/nature-passable.webm` |
| D2 | Tent colliders are axis-aligned 5.5×2.9×4.2 boxes: air wall at the sides, blocked short of the door at the front | East of C04: stopped at x=−29.91 (box face +0.34 = −29.91). The audit gap to the canvas is 1.47 m at 0.3 m height, 1.82 m at 1.0 m, 2.25 m at 1.6 m. Image `frames/tent-C04-east-blocked.png` shows the character standing on open grass. Front of C03: stopped at z=14.94 (= box face 14.60 + 0.34), 0.45–0.67 m short of the door canvas. 90–100% of each tent's collider footprint is more than 0.25 m below the box top (`audit`) |
| D3 | C05 fire pit has no collider | Walked to 0.178 m from the fire centre, y unchanged (5.619). `frames/firepit-inside.png`. Whether the ring should block is a design decision; I list it as an unconfirmed defect for decision |
| D4 | Character has no action | 6 walk + 6 run + 5 jump frames from the real buffer: static capsule + box head + box feet, pose identical. Jump only changes y (5.89→7.15). `action-sheet.png` |
| D5 | Nature has no wind | Source: `WorldCamp` drives only the flags (`FlagPole`) and the fire with `useFrame`; trees and shrubs have no motion code |

## Confirmed geometry mismatch (audit only, not walked in this baseline)

C07/C09/C10 still use the old shared 1.05×0.9×0.9 axis-aligned box (`createLayout` padObjects):
- C07: the visual desk spans 1.96×1.96 m (after yaw). 1537/1740 vertices below head height fall outside the collider XZ, so the desk ends are passable.
- C09: the visual is 1.65 m wide and 1.68 m tall, the collider 1.05 m wide and 0.9 m tall. The shelf ends are passable, and the top could be jumped onto at the wrong height.
- C10: the 1.05 m box surrounds a 0.1 m pole, leaving an air wall about 0.5 m from the pole above the feet (157 vertices outside).

## Not defects in this baseline

- Pause freeze: Esc, then two buffers 1 s apart. Changed pixels (>8/255) = 0; physics position change 0 m. Shot mode (`set({shot:'camp'})`): 0. Note: CampFire emissive keeps converging toward its target while paused (it updates before `if(!isRunning())`). This is a lighting transition and did not show up at the 8/255 threshold.
- Drawing buffer: 1920×1080@1 = 1920×1080, 2560×1440@1 = 2560×1440, 1440×900@1 = 1440×900; viewport equals the full buffer. **1440×900@DPR2 = 2160×1350**: Canvas `dpr={[1,1.5]}` caps the render scale at 1.5, so a retina screen does not get 2×. MSAA antialias is on, max samples 8.

## Suspected (needs runtime/source confirmation; not proven)

- S1 Clarity is limited by more than the buffer: one 2048 shadow map covers ±105 m (about 0.1 m/texel), and the buffer crops (`buffer-crops.png`) show soft, blocky shadow edges at every resolution. Materials are flat colour with no detail maps. Raising DPR alone will not fix what Bobby means by "not clear".
- S2 Camera occlusion fade only marks buildings as `occluder`. Tents, trees and the shelf can hide the character (C04 screenshot: tree canopy close to the character).
- S3 Visual boxes without colliders: decor boxes in front of each booth (1.5×1.1×1, `decor`), the orange sign on each FOUNDATION (2.8×1.2×0.18, `decor`).
- S4 Island trees outside camp: trunk collider 0.7 m matches; the crown is a decor cube with its underside at 1.8 m. The capsule top is about 1.76 m, so it barely clears; jumping (+1.5 m) goes into the canopy.
- S5 Frame timing is not informative: 1440p/1080p/900p idle and walking all show p50 16.7 / p99 16.8 ms, 0 frames >33 ms, held by vsync (60 Hz). This shows no headroom number, and **no inference to M1 should be drawn**.

## Tool limits

- The strict through-centre rule in nature-passable depends on bot steering. 8-way keys zig-zag about 0.4 m. The final suite will add a contact API plus a centre-line fixture.
- Frame timing: rAF intervals are vsync-locked. Without B5 `frameStats` there is no CPU/GPU split.
