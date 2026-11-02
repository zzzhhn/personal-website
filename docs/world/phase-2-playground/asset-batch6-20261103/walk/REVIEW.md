# P02 / P03 candidate for main review

Base c4f7fca427cd68294fa5abed344e999713fcf01a. This pack completes only the actual procedural boardwalk deck/support and independently knockable low railing. Original assets-v1 records identify both as procedural; portable GLBs are editable review archives, not runtime substitutes. Production-side visual review is complete; main/Bobby art acceptance remains pending.

## Result and actual images

All eight JPEGs are original 1710×931 browser captures, exposure 1, FOV 50, balanced quality. Three day pairs share exact camera, time, six production-source hashes and actual instance poses. Each capture has its own JSON receipt. Wood, roughness and normal images are CPU/GPU-ready, loading inactive, climate blend 1, shadow.pending false and at least 3 seconds stable. Near rails 42, far 0, real proxy positions 42/42 valid throughout.

| View | Baseline | Candidate |
| --- | --- | --- |
| Ordinary deck | [Before](screenshots/baseline-P02-normal-day.jpg) | [After](screenshots/candidate-P02-normal-day.jpg) |
| Ordinary railing | [Before](screenshots/baseline-P03-normal-day.jpg) | [After](screenshots/candidate-P03-normal-day.jpg) |
| Ordinary fascia / piles | [Before](screenshots/baseline-P02-bearing-day.jpg) | [After](screenshots/candidate-P02-bearing-day.jpg) |

Necessary candidate night: [deck](screenshots/candidate-P02-normal-night.jpg), [railing](screenshots/candidate-P03-normal-night.jpg). Both inspected: existing warm pools illuminate wood; shoes remain restrained metal, without new self-emission or new lights. Night is a candidate readability check, not a matched night performance benchmark.

Production-side visual findings: manufactured grain follows deck planks, longitudinal fascia/stringers, piles and braces. Broad wood surfaces read as wood at ordinary distance without replacing the original five-tone palette. Fascia joints/lower return and pile grain are visible from the open-water view. Railing has a common .97 m top datum and supported feet. The nominal 2 cm through-gap is closed with a 2.02 m handrail; small authored top-end chamfers remain visible. Paired posts and independent knockable sections are retained. Fine U straps use actual stringer/crossbeam contact; ordinary-image uplift does not depend on their individual visibility.

## Runtime initialization repair

Initial fixed-shot captures had zero P03 instance translations. A finite physics warm-up also left them zero; the failed readback and initial capture are retained in screenshots/rejected-bootstrap. Installed Rapier skips sleeping object matrix publication while Knockables sleeps bodies on its first frame.

The necessary shared visual adapter now records the real body object per instance. Once that body exists, is valid and has a finite valid pose, it composes world position/quaternion with the proxy's world scale and multiplies by inverse proxy.matrixWorld. It seeds that body's matrix exactly once, including legitimate origin poses; a replacement body can initialize again. All later updates use the original Rapier proxy chain. No body setter, forced wake, sleep/reset change, LOD threshold change or collision change is introduced. P04 benefits only from this same initialization; its geometry, materials, placements and collision digest are frozen.

The `baseline: c4f7fca` capture field denotes baseline P02/P03 geometry. Both final modes use the same ed3bffc shared initialization adapter, rather than presenting missing original rails as an art improvement. Six full production-source hashes are recorded per frame. Two normal baseline views were captured in the preceding build; the final build changes only the supplementary camera. Their six source hashes and all comparison settings match exactly.

## Verification and scope

10/10 focused tests pass: repeatable original geometry, exact P01, five support rectangles, all 42 rail / nine lamp placements and openings, original walking vertices, P03 40 kg cuboid, body-state knock/reset/LOD branches, unchanged P04 geometry, grain axes, finite cylinder seam, attribute preservation after merge/clone, and real initializer logic for origin, late/invalid/recreated bodies and a rotated nonuniformly scaled parent. No fresh impulse/30-second reset run is claimed.

Actual native source: all three P02 groups, 7621 triangles / 454 named pieces; actual two adjacent P03 sections, 312 triangles / 26 named pieces. Both .blend files are editable with packed PBR textures. GLB fresh imports preserve triangle counts and bounds exactly (delta 0). JSON-to-native-to-GLB hashes are recorded. Geometry JSON stayed byte-identical through the visual initialization repair.

Final formal Astro build: 14.73 seconds, eight pages. Existing prebuild checks pass (four furniture GLBs / 16 external images, five world-craft GLBs, two audio files). Thirteen served resource paths match built bytes; HTTP 404 count and captured console errors are zero. See BUILD-AND-NATIVE.json, DAY-PAIR-CHECK.json and EVIDENCE.json.

Protected: P01 plaza, huts/spurs, P04 design/collision, layout/routes/walking heights, shared materials/cache/environment/night lighting, DJC and nature assets. Only WorldWalkCraft and the bounded WorldParkWalk visual adapter are production edits.

## Cost and evidence boundary

COST.json reports source-owned arrays, not whole-scene GPU memory: P02 near 5677→7621 triangles (+1944), far 1354 unchanged. P03 near 84→156 and far 24→36 per section, 42 sections. Added typed arrays total 438048 B. No added material, texture, light, draw owner or recurring frame job; the initializer performs its body reads/write once per body identity.

Recorded day draw calls are 170/166 (deck), 74/72 (railing), 244/242 (fascia). Texture counters are 83/81, 85/82 and 105/102. Registered asset sets match, but two unrelated DJC visible meshes differ between runs; texture counters also retain prior view uploads. These are contextual snapshots, not evidence of a speedup. GPU frame time / sustained FPS have not been measured. No shared-interface or material-cache change was needed.

## Recheck / ownership

- `node --test tools/world/facility-craft/batch6/walk/walk.test.mjs`
- `node tools/world/facility-craft/batch6/walk/verify_review.mjs`
- Exact owned paths: OWNED-PATHS.txt. Do not stage the local public resource-overlay symlinks.

Self-owned 4367 page was paused and closed; server PID 90140 was verified by full command and stopped, wrapper exited 241 and released its matching token. Own tabs [], no own listener and lock absent at release. Nature/main were notified immediately before archival. User 4341 and prior main-owned rollback roots remain untouched. No push, merge or deployment performed here; stop after these two families.
