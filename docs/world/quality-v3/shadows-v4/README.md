# Shadows v4 and occlusion fade (2026-10-22)

Scope: `WorldShadows.ts`, `WorldOcclusion.ts`, `WorldQuality.ts` (budget constants) and the new `WorldLights.ts`. Rulings applied: spec v3 §11.1 and §11.2.

Evidence comes from the dev server `http://127.0.0.1:4322` (HEAD 84e4d54 plus a shared dirty worktree; other sessions were editing concurrently).

All runs used headless Chrome with ANGLE Metal on an Apple M5 Pro, with a 1920×1080 drawing buffer. Nothing here makes an M1 claim.

Movement and camera were driven only by real input (WASD / Shift / Space / Esc / mouse drag / wheel / dialog buttons). No teleport and no store writes were used.

## Changes

- **Sun**
  - The direction stays fixed (§11.1); no drift was added.
  - The old single orthographic window becomes **two cascades**:
    - Cascade 0 covers only the view slice from the camera to the follow target plus 6 m.
    - Cascade 1 covers the rest, out to a view depth of 110 m.
  - Each cascade's extent is the light-space bounds of its view slice intersected with the receiver height band, plus the on-screen samples of the tall buildings. It therefore fits any camera yaw, pitch, and distance from 2.5 to 30 m.
  - Rendering uses three r186's `SunLight` 2-cascade atlas and its blend band. The fitting replaces `SunLightShadow.updateMatrices`.
  - In `WorldEnvironment`, the existing `directionalLight` becomes the controller: it is hidden and no longer casts. A companion `SunLight` copies its colour, intensity, and night fade every frame, so the environment files need no changes.
  - **Stability**: half extents snap to a geometric ladder with 12.5 % steps and shrink only after two steps of slack. Centres snap to whole texels.
  - **Budget**:
    - high: 2 × 3072² atlas (≈75 MB of depth), replacing one 4096² (≈67 MB).
    - balanced: 2 × 1536² (≈19 MB), replacing one 2048² (≈17 MB).
    - The maps were not inflated across the board (§11.2).
  - **Normal bias**: each cascade gets its own normal offset of about one ground texel, clamped to 0.4–3 cm. It is carried in the unused w of the cascade vector, with one replace in the shader chunk.
- **Campfire**
  - The existing fire key light (`pointLight` [-42, 6.5, 30], warm, flickering, 26 m) is made to cast shadows; no light was added.
  - The fill, warm spill, and lamp pool remain non-casting.
  - Cube map: 1024 on high, 512 on balanced.
  - It re-renders every frame only while the followed body is within 16 m of the fire; outside that it refreshes at about 2 Hz.
  - `WorldLights` finds the light at runtime (name `camp-fire-key`, or an unnamed point light at that position). Integration needs no changes to `WorldEnvironment`/`WorldCamp`.
- **Occlusion fade**
  - Candidates are no longer a fixed ID list. A mesh qualifies if it, or an ancestor, is tagged `occluder`, or if it is visible and casts shadows (camp GLBs, trees, bushes, rocks, tents, benches, buildings, greybox blocks).
  - Excluded: the guide (G24), vehicles, walkable surfaces, and anything tagged `noOcclusionFade`.
  - Instanced meshes are pre-filtered by their mesh-level bounding sphere.
  - When one layer of an asset is hit, all parts of that asset inside the corridor fade together. The world-space mask keeps the fade to the narrow corridor around the sight line.
  - When driving, the corridor widens to 1.9–2.5 m and the rays sample the car's roof, centre, and both flanks.
- **QA only (?qa=1)**: `__worldDebug.shadowInfo / shadowTexelsOf / fireShadowInfo / shadowQa.*` (A/B switches and projection helpers). The normal entry has none of these; `debugApiPresent=false` was verified (`normal-entry/`).

## Acceptance: measured results (`evidence/report.json`, run 13:16)

| Item | Result |
|---|---|
| Shadow follows the body (dusk sun) | Idle facing 4 directions / walking at 3 moments / standing before a jump: shadow direction −35.2 to −36.2° vs. the theoretical sun direction −35.84°. Root contact gap 0.004–0.137 m (the larger values are idle poses with the feet together and toes pointing along the sun). Shadow mask area varies with facing: 28.6k–39.9k px. Jump: at 0.60 / 0.90 m above take-off, the shadow centroid moves 1.57 / 2.38 m; the geometric expectation at 19.8° sun elevation is 1.66 / 2.50 m (the centroid is a whole-body average, so it moves a little less than the feet). No freezing or detachment found. |
| Free camera: on-screen direction changes, body still followed | Six drag orbits (yaw 0.93→6.15 rad, pitch 0.79/1.12): the on-screen shadow direction rotates **301°** in total (1.2°→−52.6°→−124.4°→−178.8°→123.8°→59.9°). The world-space direction deviates at most 0.43°. Contact gap 0.011–0.09 m. |
| (a) Full circle at night around the fire | 12 stations (radius 3.3 m), all reached by walking. Shadow direction sweeps **325°** in total (12 stations 30° apart; ≥270° required). Maximum deviation from the fire→player direction is 3.7°. |
| Near-shadow sharpness (§11.2: about 2× linear density) | See the table below. On high at the near camera, the linear density is about 5.3× (across the sun) / 5.2× (along the sun). |
| (d) Visible behind a tree crown | G17: 1,174 px of the guide visible without the fade → **3,713 px** with it (crowns 1/2/3 and trunk faded inside the corridor). G16: 1,622 → **3,506 px**. Images: `evidence/occ-tree-*-{nofade,fade}.png`. |
| (d) Behind a tent | **No fade case reproduced**. The tent shell is a solid trimesh, so camera collision pulls the camera in front of the canvas (`collided=true`, actual distance 0.88 m). The guide is unobstructed, with 0 blockers. See Not verified. |
| (e) Static shadows do not crawl | 24 walking frames + 20 orbit frames + 16 zoom frames, checking the texels of 3 static points in both cascades: across 74 same-extent frame pairs, 0 coordinates crawled (worst fractional drift 6e-12 texels). Extents changed 46 times, mostly during orbit/zoom; each change re-samples static shadows once (a deliberate trade-off, see Rulings). |

### Near shadow: metres per texel (measured; probe `shadow-v4-probe.mjs`, same camera recipe, same session and ground material)

Ground texel: cm across the sun / cm along the sun. For v4 these are cascade 0 values (the cascade that covers the character).

| Camera | v3 (one 4096²) | v4 high (2×3072²) | v4 balanced (2×1536²) | high linear density factor |
|---|---|---|---|---|
| 4.5 m default | 2.54 / 7.35 | 0.48 / 1.41 | 1.07 / 3.17 | 5.3× / 5.2× |
| 2.5 m default | 2.54 / 7.35 | 0.48 / 1.41 | 0.75 / 3.17 | 5.3× / 5.2× |
| 2.5 m orbit a | 2.59 / 7.35 | 0.42 / 1.11 | 0.85 / 2.23 | 6.2× / 6.6× |
| 2.5 m orbit b | 3.32 / 7.49 | 0.60 / 1.25 | 1.21 / 2.50 | 5.5× / 6.0× |
| 2.5 m high pitch | 3.61 / 7.06 | 0.60 / 1.25 | 1.21 / 2.50 | 6.0× / 5.6× |
| 10 m | 0.88 / 1.73 | 0.97 / 1.78 | 1.94 / 3.57 | 0.91× / 0.97× |
| 30 m | 1.76 / 2.59 | 2.20 / 2.85 | 4.42 / 5.71 | 0.80× / 0.91× (**correction, §14.3**: this row measured cascade 0, the cascade covering the body, not the far cascade 1; it is not a cascade 1 measurement) |

Texels per metre are the reciprocals: v3 near is 39 / 13.6 texels/m; v4 high near is 208 / 71 texels/m.

Same-position comparisons: `compare-near-2p5m-default-300_60.png` (bench shadow edge), `compare-near-2p5m-default-980_820.png` (character shadow), `compare-near-4p5m-default-700_500.png`. Raw frames are in `before-v3-samesession/`, `after/`, and `after-balanced/`.

The v3 baseline was captured in the same session by temporarily restoring v3 `WorldShadows.ts` (`baseline-src/`). The `before/` directory is the first baseline, taken before the ground material changed, and is kept for reference.

## Cost (measured, `evidence/report.json` → perf)

The headless rAF frame rate is capped at 60 Hz, so it cannot resolve the cost difference.

- Dusk, spawn area: 60.3 fps, p99 16.8 ms.
- Night, by the fire (fire shadow every frame): 60.3 fps, p99 16.8 ms; **510 draw calls / 909k triangles**.
- Same position with the fire shadow off: 60.3 fps; 209 draw calls / 511k triangles.
- The fire shadow therefore adds **+301 draw calls / +398k triangles** per frame (six cube faces), counted only within 16 m of the fire.
- Beyond 16 m it refreshes at about 2 Hz: averaged, about 1/30 of that, roughly +10 draws per frame.
- Occlusion check: 87 candidates, about 30 left after the prefilter, 4 rays, 0.1–1.3 ms CPU per frame.

These are not M1 figures.

## Not passed / not verified

- **Tent occlusion (d) did not reproduce**: the tent is solid (camera collision), so it does not stay in the sight line. The fade path is the same as for the trees (the tent meshes are candidates, `tested` includes them), but no screenshot exists where the tent actually blocks the view.
- **Balanced tier at mid/far range**: at 10 m / 30 m, balanced is 1.94 / 3.57 and 4.42 / 5.71 cm. v3 balanced was not re-measured in this session, so there is no same-distance comparison and it may be coarser than v3 balanced. At 30 m, high cascade 0 is also only 0.80× v3 (across the sun).
- **Contact gap for idle feet**: when facing forward/right, the gap at the toes is 8–14 cm. That is the gap between the foot-sole projection and where the shadow begins, measured with the ground plane at the feet height. It has not been separated from the effect of normal bias.
- **Vehicle occlusion**: the code covers driving (wide corridor and car sample points), but there is no driving occlusion evidence.
- **The fire shadow was checked mainly at night.** At dusk the fire light still casts, at 1/2–1/3 of its night intensity; no visual judgement was made at dusk.
- The `before/` baseline and the later runs straddle concurrent edits by other sessions (terrain material, guide, camera). Per-run source hashes are listed below; final integration needs a re-run.

## Rulings needed (for Astra)

1. **Extent changes re-sample static shadows**: the extents follow the free camera (orbit/zoom), and each change re-samples static shadows once (12 changes across 20 orbit frames, 13 across 16 zoom frames). There is still no crawl while walking with the camera fixed. Option: fixed-radius cascades (stable for any rotation), at the cost of about 1.4× coarser texels in the near cascade.
2. **Far-range density**: at 30 m, high is 0.8–0.9× v3 and balanced is coarser. Is the near cascade's 5× gain worth trading for slightly coarser far shadows, or should far range get more budget (for example a 4096 atlas)?
3. **Fire cube map**: does balanced keep a 512 per-frame cube? Or should balanced fall back to the 2 Hz refresh, or turn the fire shadow off entirely?

## Integration (main thread)

- **No mount lines needed**: `WorldEnvironment.tsx` already calls `fitSunShadow(...)` every frame, and v4 attaches the SunLight and fire shadow from there.
- Recommended single line (optional, makes the lookup explicit): in `WorldEnvironment.tsx`, give the fire light `name="camp-fire-key"`, i.e. `<pointLight ref={fire} name="camp-fire-key" position={[-42, 6.5, 30]} ... />`.
- `WorldRuntime.renderInfo().shadowMapSize` now reports the per-cascade size (3072/1536), which v4 writes back onto the DirectionalLight.

## Reproduction

```bash
export WORLD_BROWSER_MODULES=/Users/bobby/CodeBuddy/Claw
node tools/world/playtest/shadow-v4-probe.mjs after                      # near-shadow texels + 1080p frames
QUALITY=balanced node tools/world/playtest/shadow-v4-probe.mjs after-balanced
node tools/world/playtest/shadow-v4-evidence.mjs http://127.0.0.1:4322 docs/world/quality-v3/shadows-v4/evidence
```

Source hashes for this round (sha256): WorldShadows.ts `415be1bc…`, WorldOcclusion.ts `92d67412…`, WorldQuality.ts `f1b9fc79…`, WorldLights.ts `29699718…`. v3 baseline: WorldShadows.ts `d106145a…`.

`npx astro check`: 0 errors, 0 warnings (21:3x run).


---

# v4.1 (2026-10-23, per spec v3 §14) — replaces the v4 implementation above

All evidence in `v41/`. Dev 4322 (HEAD 84e4d54 plus shared dirty worktree), headless Chrome with ANGLE Metal on an Apple M5 Pro, 1920×1080. Not M1 figures. Source sha256 (first 16 chars): WorldShadows.ts `c4cb0391f75da823`, WorldLights.ts `4d86c1b26429f8d5`, WorldOcclusion.ts `1402e8201656d64d`, WorldQuality.ts `41b918b0db95bdbc`, WorldEnvironment.tsx `34c732a542b24647` (my only change there is adding `name="camp-fire-key"` to the fire light). `npx astro check`: 0 errors, 0 warnings.

## Changes

1. **Fixed-size sun windows (§14.2)**: three fixed light-space windows; half extents never change at runtime, and only the centres move (snapped to whole texels). c0 [9, 6.5] m and c1 [18.5, 12.5] m follow the body (shifted 4 / 12 m toward the camera's ground look direction). c2 [48, 26] m centres on the visible ground span. Cascades are chosen by window (not view depth), with blending over the outer 12 % and a fade at c2's edge. Atlas: high 3×2508² / balanced 3×1254², the same total texels as v4's 2×3072² / 2×1536² (§14.3 budget not exceeded).
2. **Per-pass caster culling**: the SunLightShadow / PointLightShadow `getFrustum(i)` hooks run on the real per-cascade and per-face render path (not `shadow.camera.layers`; see §14.1). Each pass only draws casters whose light-space footprint overlaps its window, that are not fully covered by a finer cascade, and whose shadow can reach the screen. Instanced assets are submitted through per-cascade proxy InstancedMeshes holding only the selected instances. Rigid instanced pieces (rocks, props, benches, fire ring, tent frames) are merged into shadow-only meshes per 8 m (c0/c1) / 32 m (c2) cell. c2 uses convex hulls for vegetation crowns and rocks (keeping `_wind`, so the shadow still sways) and skips instances under 0.6 m. Tent canvas never gets a hull (that would close the door opening). Shadow flags are restored after every shadow render; the main pass is unaffected.
3. **Fire whitelist (§14.1)**: the existing fire key light casts; no light was added. Only the following enter the cube: G24 and vehicles within 12 m of the fire (dynamic), plus the fire ring C05 and benches C06 merged into one static mesh. Trees, bushes, rocks, tents, and props are excluded. Tents are excluded because their shells are 17.5 m from the fire and the wind-driven canvas has no matching distance material. Faces are culled by frustum. While a dynamic caster is in range the cube re-renders every frame; when it leaves, one more render drops the dynamic shadow, after which the cube holds (no 2 Hz updates). high 1024 / balanced 512.
4. **Contact gap**: constant depth bias reduced from ≈0.000150 × 259 m = 3.9 cm to 2 mm. Each PCF tap compares against the receiver plane extrapolated from screen derivatives (receiver-plane depth bias), so wide filters no longer self-shadow. Normal offset is half a light texel.
5. **Occlusion**: shadow proxies are excluded from occlusion candidates; the rest is as in v4.

## Acceptance (measured; `v41/evidence/report.json` unless stated)

| Item | Result |
|---|---|
| Body tracking | Idle in 4 directions / walking at 3 moments / pre-jump: shadow direction −35.3 to −36.3° (theory −35.84°). Jump at 0.55 / 0.91 m: centroid moves 1.44 / 2.42 m (geometric 1.51 / 2.54 m). |
| Free camera | 6 orbits: on-screen direction travels 301° in total; world direction deviates at most 0.43°. |
| (a) Full circle at night around the fire | 12 stations all reached on foot; sweep **329°**; maximum deviation 3.8°. Light name `camp-fire-key`, 1024. |
| Static shadows do not crawl / do not jump | Walk 24 + orbit 20 + zoom 16 frames × 3 static points × 3 cascades: **all 180 frame pairs are same-size** (extent changes 0, versus 46 in v4), crawling coordinates 0, worst fractional drift 3e-12 texels. |
| Contact gap ≤2 cm (§4/§14.4) | See "Contact gap" below: maximum **2.1 mm** at idle. |
| (d) Tree crowns | G17: 1,231 px of the guide without fade → 3,744 px with fade; G16: 1,293 → 3,471 px. |
| (d) Tent | **C04 reproduced**: guide north of the tent, camera on the door side, 18 m, pitch 1.1, no camera collision (actual distance 18.63 m). Without fade 1,104 px → with fade 1,507 px (+37 %), with all 5 C04 meshes faded inside the corridor. Images `occ-tent-C04-{nofade,fade}.png`. **C03 did not reproduce**: at the same kind of camera position the ridge of 7.9 m still triggers camera collision (pulled in to 1.53 m, so nothing blocks the view). |
| Driving occlusion | The 4×4 was placed at a **fixture start** (teleport logged in the report) just north of G16. Entering (E), creeping forward (W pulses), braking (Space) and exiting (E) were all real keys. The chase camera sat behind the crown: without fade, car pixels 163,673 → 0 after the creep (fully hidden); with fade 464,491 / 369,765 px, with the G16 crown and trunk faded inside the corridor. Images `drive-*`. |

### Sun texels (fixed values, any camera)

| Cascade | Window half extent m | high: light texel cm (across / up) / ground along the sun | balanced |
|---|---|---|---|
| c0 (body) | 9 × 6.5 | 0.72 / 0.52 / **1.53** | 1.44 / 1.04 / 3.07 |
| c1 | 18.5 × 12.5 | 1.48 / 1.00 / 2.95 | 2.96 / 2.00 / 5.91 |
| c2 (far) | 48 × 26 | 3.84 / 2.08 / 6.13 | 7.69 / 4.17 / 12.29 |

- **Real value of the "1.4×"**: at the near camera (2.5–4.5 m), v4's adaptive c0 was 0.48 / 1.41 cm; v4.1's fixed c0 is 0.72 / 1.53 cm, i.e. **1.5× coarser across the sun and 1.09× coarser along it**. Versus v3 (2.54 / 7.35 cm) that is still a 3.5× / 4.8× gain in linear density. The high-tier c0 meets §4 (light-space ≤1.5 cm: 0.72 / 0.52; along the sun on the ground ≤3 cm: 1.53). Balanced c0 is 3.07 cm along the sun, within the ≤6 cm limit.
- **Coverage**: 64×36 ground-sample grid (`probe-*/telemetry.json` → coverage). From 2.5 m up to 10 m at the default/high pitch, 91–100 % of the visible ground is in c0. At 30 m, high pitch: c0 38 % / c1 36 % / c2 26 %, with 0 unshadowed. At 30 m, low pitch 0.2: unshadowed ground begins at **93 m** (the fade band starts at 83 m); at 10 m, low pitch, at 103 m; all inside the fog start of 140 m.
- 30 m: per §14.3 the trade is accepted; the old table's "30 m" row was cascade 0 (corrected above). In v4.1 the far ground at 30 m is in c2: high 3.84 / 6.13 cm.
- Same-position comparisons: `v41/compare-near-2p5m-default-*.png` (v3 / v4 adaptive / v4.1 high / v4.1 balanced).

### Contact gap (`v41/contact-gap.json`, script `tools/world/playtest/shadow-v41-contact.mjs`)

Method: the guide's color pass is made invisible (colorWrite off, shadow kept); shadow mask = luminance(guide not casting) − luminance(guide casting) > 4. For each of the 72 boot-sole contact vertices that the QA `actor().contactVertices` reports as grounded, the distance to the nearest shadow pixel is projected onto the ground. One screen pixel ≈ 3.1–3.5 mm on the ground.

| Idle facing | v4.1 | v4 depth bias 3.9 cm (normal offset unchanged) | v4 normal offset 1.15 cm (depth unchanged) |
|---|---|---|---|
| a | 2.1 mm | 20.8 mm | 2.1 mm |
| b | 1.9 mm | 21.7 mm | 2.5 mm |
| c | 1.5 mm | 21.1 mm | 1.5 mm |

**Cause found**: the 8–14 cm in v4 was the gap between the whole-body shadow and the projected soles (with the ground plane at foot height, toes pointing along the sun), measured with the old method. Using the real contact vertices, v4's constant depth bias of 3.9 cm along the light alone leaves a **~2.1 cm** lit gap (at a 19.8° sun the depth bias spreads along the ground). The normal offset contributes little. This is a shadow-parameter issue, not the character's animation or boot soles. v4.1 measures ≤2.2 mm, within §4's ≤2 cm. **No issue to hand to the character team.**

## Budget (peak, not average; `v41/budget-*/report.json`, `v41/evidence` perf)

### Line-by-line breakdown (pre-change v4 on the left, night by the fire, 10 m, fire shadow on, one actual frame; v4 totals 525 calls / 932.7k triangles)

| Source | v4 calls / triangles | v4.1 same frame |
|---|---|---|
| Main pass total | 67 / 367.2k | 70 / 367.5k |
|  Sea `world-sea-gerstner` | 1 / 152.4k | unchanged |
|  Terrain mesh `island-terrain-v3-mesh` | 1 / 109.4k | unchanged |
|  Grass `ground-grass-blades` (does not cast) | 1 / 28.1k | unchanged |
|  Vegetation G16-G20 (2N) | 10 / 41.3k | unchanged |
|  Rocks / tents / props / guide / greybox | ~54 / ~36k | unchanged |
| Sun c0 | 71 / 76.5k (one adaptive window) | 54 / 27.4k |
| Sun c1 | 86 / 90.8k | 56 / 50.2k |
| Sun c2 | — | 17 / 2.1k |
| Fire cube (6 faces) | **301 / 398.1k** (all casters in range) | **14 / 12.3k** (guide 8 + merged ring and benches 6) |
| **Total** | **525 / 932.7k** | **211 / 459.6k** |

The 209 calls / 511k triangles measured in v4 with the fire shadow off mostly came from the main pass (367k, of which sea 152k + terrain 109k = 71 %) plus two sun windows covering the whole visible ground (~167k; every crown was submitted twice).

### Peak results

- Night, by the fire, fire shadow on, 24 views (10 m / 30 m × pitch 0.3 / 0.79 / 1.2 × four orbit directions), per-view maximum over 20 frames:
  - **high: peak 314 calls / 540.4k triangles; 11 of 24 views over budget** (all 10 m low pitch facing the sea, or 30 m). Worst view: 30 m, pitch 0.3, facing the town = main pass 154 / 388.2k + c0 42 / 43.5k + c1 59 / 54.9k + c2 47 / 27.9k + fire 14 / 12.3k.
  - **balanced: peak 314 calls / 517.7k; 6 of 24 views over budget** (all at 30 m).
  - All 10 m views at default / high pitch meet budget (high 160–235 calls / 417–506k triangles).
- Walking a lap at night by the fire (cube re-rendered every frame, 120 frames): peak 276 calls / 534.0k. By the fire, fire shadow off: 238 / 503.0k. So the fire shadow's real increment in the near-fire state is **+24 calls / +26.8k triangles** (versus v4's +301 / +398k).
- **Conclusion: the target "peak ≤300 calls / 500k triangles with the fire shadow on" is not met.** The excess triangles come from the main pass (365–388k, 72–78 % of the frame), which is outside my scope. At 30 m low pitch the main pass alone is 154 calls / 388k. For calls, the worst case is in the main pass as well (154 calls, 36 of them unnamed tiny meshes + `world-greybox-environment` 5 + `greybox-roadblock` 4).
- headless rAF still caps at 60 fps (p99 16.8 ms), so frame cost cannot be resolved; no frame-time claim is made.

### Non-shadow items to coordinate (not in my files; suggestions)

| Source | Peak contribution | Owner | Suggestion |
|---|---|---|---|
| Sea `world-sea-gerstner` | 1 call / 152.4k triangles (main pass) | Environment | Gerstner grid density by distance (fine rings near the shore, coarse far away), or split it into near/far meshes so the far one can be culled; estimate ≥100k saved |
| Terrain `island-terrain-v3-mesh` | 1 / 109.4k | Environment | Lower the subdivision of the inland plateau's flat areas, or split it into chunks so only the visible ones are drawn |
| Grass `ground-grass-blades` | 1 / 28.1–29.7k | Environment | Already does not cast shadows; tighten the near-camera density cap further |
| Vegetation G16-G20 (2N) | main pass 10 / 41.3k, about 63 % of the sun c0/c1 submissions | Vegetation | A shadow-only proxy LOD (the c2 hull is already done in my files); a per-asset LOD for distant main-pass views |
| 36 unnamed small meshes in the main pass + `world-greybox-environment` + roadblock + lamps | about 50 calls | Environment / map | Merge with instancing |

## Not passed / not verified

- **Budget**: as above, 11 of 24 high views and 6 of 24 balanced views exceed it; the main pass is the cause. Per §14.1, the "turn off the fire shadow if over budget" rule applies to balanced: with the fire shadow off, balanced near the fire is still over budget at 30 m (the main pass alone is 366k). Turning the fire shadow off does not bring it inside budget (fire is only 14 calls / 12k), so it has **not** been turned off by default. That needs a ruling.
- **Tent C03 fade case not reproduced** (camera collision); only C04 was proven.
- **Driving occlusion used a teleport fixture start**; the drive itself was real keys.
- **Dusk fire shadow**: the fire still casts at dusk (dynamic casters in range, every frame); no visual judgement has been made of dusk.
- **One-time cost of the merged/proxy meshes**: shadow-only geometry is about 0.3 M vertices (rough estimate; the actual peak and generation time were not measured separately).
- The normal-entry combined clip `v41/normal-entry/fire-orbit-zoom.webm` (13.7 s, entry `http://127.0.0.1:4322/world/`, `debugApiPresent=false`, with source hashes) has only been checked programmatically; it has not been reviewed frame by frame.
