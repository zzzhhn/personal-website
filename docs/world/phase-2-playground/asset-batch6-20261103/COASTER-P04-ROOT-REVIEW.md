# Coaster / P04 coordinator review

2026-11-03. Candidate review remains separate from local delivery. Current 4341 is still source 67b5b49 with G21 and P02/P03; none of the candidates below has been promoted.

## Source and focused checks

Main inspected 357337c production changes and P04 76e0c95. The coaster geometry/contact freeze script passed on the author tree; all 22 station/workshop contact/runtime tests passed. P04 check.mjs passed with original 766/146 triangles, 9 placements, 4 hulls/45 kg and preserved emission. The separate performance/source review found no binding/lifetime/emission blocker; byte counts are not GPU frame-time evidence. Its report is performance/COASTER-P04-SOURCE-REVIEW.md.

## Ordinary visual review

Main opened all six original JPEGs in /tmp/bobby-world-coaster-craft-r1.0KSsM2/review-three and verified file hashes and recorded paired settings. This is a same-R3-build shader A/B. Canvas/viewport dimensions match. Camera values come from fixed-shot configuration; exposure was inferred from defaults rather than sampled. No night original files were delivered at this checkpoint.

- R-station: front metal edge, darker sign field and underside seams are visibly distinct. Accept provisionally as a local material improvement, pending bounded night/runtime readback. This is not whole-station modelling completion.
- W-intake: neutral satin rollers are more legible against the coated machine frame. Accept provisionally on the same limited basis.
- W-carrier: the actual ordinary pair changes too little to satisfy this round's visible-improvement criterion. Hold; do not integrate its markings along with the other two.
- R-lookout: already isolated by the author, remains held.
- P04: source accepted for runtime evaluation only; the lamp author has the next serialized capture window.

The coaster author is preparing an exact two-family extraction and tracked original evidence, preserving previous commits. After P04 releases the shared window, it will provide one night pair per accepted family with actual renderer/camera/climate/shadow readback. No geometry, ride, gameplay, collision, global lighting or public deployment is authorized by this review.

## Integration checkpoint

Main integrated only station/intake source `e5d8547` as `f368fb6` and its day archive `330f7c5` as `3a0669f`. Carrier/lookout tags are absent from the integrated consumers. The geometry/contact freeze script was rerun on this exact two-family source and passed; this is stronger scope evidence than the earlier three-family check.

P04 source `435e92f` and evidence `c235753` map to `cbdf641` and `fc01d22`. Main opened all four original day/night JPEGs and ran `verify-review.mjs`. At the ordinary full-lamp view, the axial wood grain and coated cap/collars are distinguishable. Night lens and warm light pool remain legible with no visible regression. Accept this bounded material upgrade. Main reran its geometry/emission check after integration: 766/146 triangles, nine placements and original four hulls remain unchanged.

P04's same-source editable generator and serialized geometry are retained. Blender export stalled before execution; no native `.blend` or round-trip acceptance is claimed. Author captures have the same unrelated mine-layout 404 in both modes; the release static whitelist contains that layout and final serving checks must verify it. Whole-scene draw snapshots differ by three, not yet attributed; source checks establish no added lamp draw structure, not a measured frame-time result.

Station/intake night validation is pending at this checkpoint. 4341 still serves `67b5b49`; source integration alone has not changed the user's preview.

## Final selection for local delivery

Night evidence `4306e0d` maps to `5737e87`. Main opened the station before/after originals: the metal fascia and soffit remain readable at midnight without a visible loss of the existing signage or illumination. The pair's actual camera, FOV 50, exposure 1, midnight blend and canvas match, and the shadow queue is idle before and after both captures. Accept station as the bounded material improvement described above.

The intake candidate night capture is diagnostic only: its shadow work did not settle within the bounded window and the settings layer/changed canvas invalidates the pair. It is NOT accepted for this preview. Main restores `WorldIntentWorkshop.tsx` and `intent-workshop-geometry.ts` to `4ac2360`; the full candidate remains in the author branch and immutable commits. The freeze check now explicitly requires the workshop body to have no craft tags. Carrier, lookout and C03 remain held as before.

The selected delivery therefore contains **station and P04 lamp only**. No other family is promoted by this review. This is not a claim of overall scene completion, a new FPS benchmark, or final user acceptance. Final integrated build and 4341 serving evidence will be recorded under `craft2-integration/`.
