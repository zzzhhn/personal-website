# G24 v3b release: mocap motion, jump phases, round helmet, stance slope fit (2026-10-22)

Released file: `public/assets/world/guide/G24.glb`, sha256 `a75db2da8010c2b5771d7c3111bd09ab9e8fe534ea56bd935e7941440e885ccb` (411,796 bytes, Draco).
Uncompressed proof: `tools/world/guide/out/G24_uncompressed.glb`, sha256 `739459ff9998116067b5e1f93ae9f3edec27cd5ede0f226a008904c811317b77`.
Replaced: 73aa0bb6 (backup `tools/world/guide/out/G24_73aa_final_backup.glb`, native `out/G24_73aa_native.blend`, source `out/build_guide_73aa_released.py`).
Triangles 1,978 -> 2,842 (+864, almost all helmet: 20x12 flat -> 32x20 smooth, visor band 12 -> 32 segments). 18 bones unchanged. Third-party register: `docs/world/THIRD_PARTY.md`.

## Clips (all 60 fps; design speeds written to the armature extras, read by WorldGuide)

| Clip | Frames | Design speed | Source |
| --- | --- | --- | --- |
| Idle | 144 | 0 | L1 authored (unchanged) |
| Walk | 46 | 1.545 m/s | CMU 35_01-03 |
| Run | 33 | 3.587 m/s | CMU 09 (10 takes) |
| Sprint | 17 | 6.199 m/s | CMU 143_01 + 141_01 |
| JumpStart | 6 | 0 | CMU 16_01, last 0.1 s of push-off |
| JumpAir | 24 (pose table) | 0 | CMU 16_01 flight, phase 0.5 = measured apex |
| RunJumpStart | 5 | 3.6 | CMU 75_03 push-off |
| RunJumpAir | 24 (pose table) | 0 | CMU 75_03 flight |
| Land | 24 (played in 0.30 s) | 0 | CMU 16_01 touchdown to absorb, blended into Idle |

Retarget method and every authored value: `tools/world/guide/mocap_retarget.py` (CFG for loops, ONE_CFG/ONESHOT for jump phases), data prep `tools/world/guide/mocap/`. Measured quantities and authored choices are kept separate there and in `THIRD_PARTY.md`.

## Runtime (WorldGuide.tsx / WorldGuideStop.ts)

- Clip choice from `intent` (WorldActors input), not a speed threshold: idle -> Idle; walk intent -> Walk below 1.35 x Walk speed, else Run; run intent -> Sprint above the Run/Sprint midpoint. Gait speed sets the playback of each loop (planted-sole contact timing, existing phase model, now with Sprint).
- Jump: `jumpSeq` edge starts JumpStart (or RunJumpStart if horizontal speed >= 2.5 m/s at take-off), then the Air pose table is held paused and positioned by vertical speed: phase = 0.5 - 0.5 vy / vyPeak (rise -> apex -> fall). Any flight length shows a valid pose.
- Landing: moving input and >= 2.5 m/s -> straight into the gait at the nearest ankle pose plus a 0.15 s additive spine/chest compression; otherwise Land (0.30 s), interruptible by movement after 0.12 s.
- Ground bumps shorter than 0.15 s without a jump keep the gait (no air pose flicker at sprint speed).
- If the current gait would play outside 0.7-1.25 x its speed, the gait switch happens at once at the best predicted entry (counted as a phase-gate timeout in QA).
- Stance slope fit (`GuideSlopeFit`, spec 10.1): stance weight from the clips' own contact masks, faded over 0.08 s; probe via `probeGround`; active from 1 deg (full at 3 deg) up to 25 deg; per-foot vertical correction <= 10 cm at <= 1 cm per 60 Hz frame; foot tilted toward the normal <= 20 deg; analytic two-bone IK, reach <= 99.5 %, knee kept on its animated side; pelvis drop shares the 5 cm budget with the stop step (`externalDrop`), and the stop step places its Idle stance on the probed ground. Off in the air, in JumpStart/RunJumpStart and while driving.

## Gates (all on a75db2da / 739459ff, reports in `gates/`, summary `gates/summary.json`)

| Gate | Result |
| --- | --- |
| Strict self-intersection, every shell (656 samples: rest + every integer and half frame of 9 clips) | native 0, uncompressed 0, Draco 0 |
| Main-thread checker (strict adjacency, all shells; v3 copy only changes body-shell pick and clip list, `tools/world/guide/qa_mainthread/`) | native 0, Draco 0 unresolved or confirmed |
| A6 relation table (11 embedded pairs, unintended pairs) | native, uncompressed, Draco: passed, unintended 0 |
| Contact slip per stance vertex (17.2 mm) | Walk 2.5, Run 6.6, Sprint 3.3, JumpStart 0.4 (was 35.8), RunJumpStart 4.0, Land 0.2 mm |
| Sole centroid drift (17.2 mm) | Walk 12.6 (was 22.6), Run 6.3, Sprint 6.1, JumpStart 7.7, RunJumpStart 2.1, Land 1.4 mm |
| Penetration (4.30 mm) | max 3.6 mm (Run) |
| GLB parity (uncompressed / Draco) | triangles equal, materials 0 mismatch, joints 7.2e-7 m at keys / 2.6e-5 m at half frames, vertex cloud 7.5e-7 / 1.3e-6 m |
| Wrist (mitten in sleeve) | >= 23 vertices inside, min overlap 17.96 mm |
| inspect_glb_rig (uncompressed) | passed |

## Runtime evidence

`runtime/report.json` (bot `tools/world/guide/runtime/jump-runtime.mjs`, real keys; QA entry only reads state):

| Case | Kind | Take-off speed | Flight | Apex | Frozen air frames | After landing |
| --- | --- | --- | --- | --- | --- | --- |
| stand-jump | Jump | 0 | 0.748 s | 0.943 m | 0 | Land -> Idle |
| run-jump-into-run | RunJump | 3.42 m/s | 0.753 s | 0.943 m | 0 | Run (no Land) |
| sprint-jump-into-sprint | RunJump | 5.98 m/s | 0.768 s | 0.943 m | 0 | Sprint (no Land) |
| run-jump-land-standing | RunJump | 3.47 m/s | 0.751 s | 0.943 m | 0 | Land -> Idle |
| stand-jump-then-run | Jump | 0 | 0.753 s | 0.943 m | 0 | Land -> Walk -> Run |

Steady playback rate (body within 5 % of 3.6 / 6.2 m/s): p05 0.95, p95 0.98 in every case (spec 0.85-1.2). Flat-ground slope fit: mean 0, max 0 mm. Pelvis drop (stop + slope) <= 3.8 mm in these cases. Page errors 0.

Normal entry (`/world/`, no query, `debugApiPresent: false`, nearest zoom via one real wheel step), canvas recordings 1920x1080:
`runtime/normal-near-stand-jump.webm`, `normal-near-run-jump-into-run.webm`, `normal-near-sprint-jump-into-sprint.webm`, `normal-near-run-jump-land-standing.webm`, `normal-near-stand-jump-then-run.webm`. Frame sheets `runtime/sheet-near-*.png`.

Ramp (main-thread `gaps.mjs`, slope scope, output `runtime/ramp/`): road ramp up to 14.9 deg traversed both ways. Stance soles (slope-fit weight >= 0.5): min clearance -16.2 mm (spec 10.1 stance limit 15 mm: 1.2 mm over, see limits). The main-thread check "soles no penetration beyond 3 cm" still fails at -38.7 mm because it includes swing soles; the deepest samples are swing feet passing low over the downhill surface (`runtime/ramp/stance-split.json`).

Poses and helmet from a fresh import: `v3b/jump_side_sheet.png`, `v3b/jump_q34_sheet.png`, `v3b/helmet_sheet.png`.

## Limits and open items

- Ramp stance penetration 16.2 mm vs 15 mm (spec 10.1) and swing-sole penetration 38.7 mm on the downhill ramp. The fit only corrects stance feet (spec forbids walking foot lock); swing feet follow the clip, whose clearance (3-5 cm) is measured on flat ground. Not hidden: reported as failing.
- The 10/20/25 deg slope matrix and a slope-stop clip (spec 10.1) were not run; only the existing ~15 deg road ramp.
- The Air clips are pose tables (paused, positioned by vertical speed): native contact checks show 0 by construction; their validity is covered by self-intersection/relation gates and the runtime frozen-frame check.
- Stand-jump and Land feet are authored at the Idle stance (measured foot yaw/roll removed) to keep the wide boots apart; RunJump keeps measured placement except a boot-separation push (max 8.4 cm, recorded per clip).
- Headless Chrome on M5 Pro; no M1 hardware claim. Visual acceptance (Opus / Bobby) pending.
