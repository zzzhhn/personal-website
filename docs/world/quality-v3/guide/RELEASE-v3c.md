# G24 v3c (visor smoothing + slope stance fit)

Released file: `public/assets/world/guide/G24.glb`, sha256 `0fa1c34f9942e6d5c5845e748b4195ce03970bac879fc151cae57985ca696c46` (410,640 bytes, Draco).
Uncompressed proof: `tools/world/guide/out/G24_uncompressed.glb`, sha256 `20d0653f4243d69987027104883b629bec081b2d5fd281d6130f772152256126`.
Replaced: a75db2da (backup `tools/world/guide/out/G24_a75d_final_backup.glb`, uncompressed `out/G24_a75d_uncompressed_backup.glb`, gate reports `gates/a75d/`).
Triangles 2,842 -> 3,106 (+264, visor band only). 18 bones, clips unchanged (no_roll experiment reverted; Run slip 6.62 mm as before).

## Visor
`build_guide.py`: visor `shell_patch` 32 x 4 segments; in `bind()` visor faces with |normal . radial| > 0.9 are smooth, top/bottom rims and end caps stay flat. Render: `v3c/helmet_visor_sheet.png`.

## Slope stance fit (runtime, `WorldGuideStop.ts` GuideSlopeFit + `WorldGuide.tsx`)
1. Weight follows the clip contact curve looked one fade ahead: 0.08 s fade-in completes at touchdown (Run stance is ~4 frames). Fade-out 0.2 s.
2. Blend-dip lift (`group.position.y`, <= 2.5 cm) on slopes measures planted feet only against their own probed plane, previous lift subtracted; the fit places the sole at ground + lift (no stacking).
3. Sole points = rendered rigid boot vertices, skinned in world space from bone matrices (`skinnedWorldPoint`). `applyBoneTransform` + `matrixWorld` used a stale `bindMatrixInverse` (updated only by `updateMatrixWorld`), offset by the frame's root move: ~1.6 cm vertical per frame running on the ramp. This was the main float source.
4. Swing clearance measured on the untilted clip foot (alignment no longer counted as clearance).
5. Foot alignment split into pitch and roll, each capped at 20 deg (spec 10.1 wording).
6. 1 cm/frame foot-target limit in world space (root-plane motion added). Pelvis drop: lower 0.6 m/s, release 0.15 m/s; shared 5 cm budget with the stop step unchanged.

## Gates (all on 0fa1c34f / 20d0653f, reports in `gates/`, summary `gates/summary.json`)
qa_guide native/uncompressed/Draco, qa_selfx x3 (656 samples, 0 strict), qa_relations x3 (pass, visor/helmet embedded), main-thread guide_intersections_v3 native + Draco (0), qa_wrist Draco, inspect_glb_rig uncompressed: all pass.

## Runtime
- Ramp bot (main-thread gaps.mjs, slope scope): `runtime/ramp-v3c/report.json`, `stance-split.json`.
- Normal entry ramp clip (no query, near zoom, real keys, HUD minimap steering): `runtime/ramp-v3c/normal-near-ramp-down-up.webm`, `normal-entry-ramp.json`; script `tools/world/guide/runtime/normal-entry-ramp.mjs`.
- Flat ground: `runtime/flat-v3c/report.json`, all 8 checks true incl. slopeNeutralOnFlat, pelvisDropWithin5cm.

## Limits
See stance-split.json: 5/26 contact samples float 2.2-4.1 cm, all reach-limited (pelvis drop at the 5 cm budget and/or reachError > 0) on the downhill run. Only the ~15 deg road ramp was measured; the 10/20/25 deg matrix needs fixtures.
