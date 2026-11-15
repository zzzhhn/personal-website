# Facilities site audit, 2026-11-15

Scope: DJC club, pool and coastal approach; WorldQuant quarry; Video Rebirth factory; legacy Alpha exchange. Read-only implementation audit with bounded analytical queries. No browser, full terrain construction, build, Blender or heavy test suite was run. Findings describe current source geometry, not visual acceptance. Balanced quality and all existing materials/assets should remain unchanged.

## Confirmed current presence

The old Alpha exchange is still rendered. `src/components/world/WorldPark.tsx:144` mounts `WorldAlphaExchange` unconditionally inside the park. Its world origin remains `[60, 1.14, -55]` (`alpha-exchange-layout.ts:6`). It is distinct from the newer Alpha mountain island. Removing it would be a scope/product decision, not a site-junction fix.

## High-confidence defects

### F1. Legacy exchange: raised ground-floor stone perimeter ends 31 cm above the earth

- Source: `src/components/world/alpha-exchange-layout.ts:56` assigns every platform a fixed depth of `.28`; lines 67–70 put the south walk, archive wing, clearing wing and rear walk at local `y=.45`. `WorldAlphaExchangeGeometry.ts:61–69` closes their vertical edges only down to `slab.y-slab.depth`.
- World relation: these walk tops are `1.14+.45=1.59`; undersides and exterior slab fascias stop at `1.31`. Analytical terrain is exactly `1.00` at representative exposed exterior points `[42,-75]`, `[78,-75]` and `[60,-95.8]`. Consequently there is a `0.31 m` unclosed band below the stone perimeter. The colonnade bases and back wall also begin on the elevated walk, rather than closing this band (`alpha-exchange-layout.ts:101–119`).
- Why this is a junction defect: this is a masonry building on dry cape ground. The existing pit risers already deliberately run down to local `0` (`WorldAlphaExchangeGeometry.ts:79–83`), but that closure does not cover the exterior perimeter. Upper galleries, stairs and coffered roof are intentionally elevated and are excluded from this finding.
- Minimal fix: deepen only exposed ground-floor masonry skirt faces to the terrain contact height with a small buried allowance. Reuse the existing stone materials and keep top triangles, pit, ramps, exact park seam and all authored walking heights. Do not raise the whole terrain or fill the pit. Match any new reachable vertical skirt with its solid collider.
- Acceptance: low exterior camera at the three listed points must see stone contacting earth; retain normal entry, pit and side-exit traversal. Source coordinates establish the gap; visual prominence remains unreviewed.

### F2. DJC: two timber pool approaches have unsupported low spans

- Source: `src/components/world/WorldDjcClubGeometry.ts:237–245` builds `pavedOutline` as a top plus an `.18 m` fascia only. Lines 271–274 instantiate both `CLUB_WALKWAYS`. Deck posts at lines 264 and 267 belong to the dance ellipse and stage; there is no support generation along these two outward walkway polygons.
- World relation: polygon centers are approximately `[50.20794,39.24434]` and `[50.35132,70.43869]`. Barycentric sampling of the actual ear-cut top triangles gives top heights `1.45400` / `1.45694` and undersides `1.27400` / `1.27694`; analytical earth is `1.00`. Their poolward portions extend to approximately `x=58`, beyond the dance deck's support ring, and finish at top `1.40`, underside `1.22`. This leaves a `0.22–0.277 m` band under unsupported approach sections. The slab's side colliders correctly match the side fascia, so this is missing architectural support rather than mismatched walk collision.
- Minimal fix: retain both existing outlines, timber finish, top/collider triangles and slopes. Add a few matching timber support pairs or short sleepers under the unsupported spans, with bottoms sampled from terrain and tops intersecting the existing underside. Avoid adding raised paving or reshaping the cape. Ground-level front threshold and the supported dance/stage decks are excluded.
- Acceptance: low flank views along each pool approach show a credible load path to dry earth without obstructing circulation. This is a source-confirmed support omission; a cantilever intention is not documented in the current assembly.

### F3. DJC default pool: submerged inner coping return is absent outside the candidate flag

- Source: `WorldDjcClubGeometry.ts:311–325`. At non-access rim sections, coping top is `1.43` and its `.14 m` depth ends at `1.29`; the mineral floor at the pool boundary is `1.00`. The only face joining `1.29` to `floorHeight-.006` is gated by `if (basinCraft && !access)` on line 313. `basinCraft` is true only for explicit `?djcBasin=candidate`, not the normal default.
- World relation: e.g. around normalized angle `π/4` (a non-access section), there is an approximately `.29 m` vertical opening between the pool floor and coping underside. Shared water is `1.35`, so this opening is submerged. The normal terrain is intentionally masked inside the mounted basin by `club-basin-mask.ts`; the missing face should not be repaired by bringing dirt back through the mineral lining.
- Minimal fix: move only the existing inner-return geometry out of the candidate-only condition, retaining access openings and the currently approved default colors/materials. This is a geometry closure repair and does not justify enabling candidate basin materials globally. If a vertical collision face is added, retain the four pool access bays.
- Acceptance: pool-inspection views show a closed mineral wall below non-access coping; ordinary exits remain traversable. Water transparency may reduce visibility, but does not close the geometry.

## Separate suspicion requiring rendered/collider mesh confirmation

### S1. Small terrain intrusion at the pool's outer apron edge

`WorldDjcClubGeometry.ts:329` fixes the outer apron edge to `y=1.015`. For segment 90, its outer corner is approximately `[86.82949,45.09775]`; `terrainHeight` returns `1.02540688`, about `10.4 mm` above that edge. A bounded 3×3 neighborhood within ±`.3 m` returns `1.01784–1.02686`. This indicates a small local dirt/paver intersection, but the actual current terrain triangle interpolation and render LOD have not been sampled, so it is not promoted to a confirmed runtime finding. Main terrain owner can check the exact mesh before choosing a footprint-specific cap with a feathered shoulder. Do not globally flatten the coast.

## Covered areas and justified exclusions

| Area | Evidence and outcome |
| --- | --- |
| DJC dance/stage | Explicit timber posts connect to `y=1` earth (`WorldDjcClubGeometry.ts:264–267`). Raised deck voids and supported roofs are intentional, not floating defects. |
| DJC coastal approach | Current entrance/spawn/approach sits on dry mainland; existing `tools/world/djc-club-terrain.test.mjs` samples the shared approach and protected bridge water. No new source-backed large approach gap found. Tests were read, not run. |
| DJC plants on sloping coast | Palms at `[83,30]` and soft plants at `[87,37]`, `[95,54]` sit on sub-1 coast, but their builders sample `terrainHeight` (`WorldDjcClubGeometry.ts:684–726`). Fixed-y vegetation floating was ruled out. |
| DJC daybeds | Stone plinths extend down from top `1.38` by `.88 m`, and eased access routes share support triangles. Source does not establish a new base gap. Existing replacement GLBs and their materials must be preserved. |
| WorldQuant quarry | `WorldAlphaMineFoundation.tsx:12–32` uses `mineFoundationSurface(terrainHeight)` for both fallback drawing and physics. `alpha-mine-foundation.ts` puts its plateau at `1.138`, 2 mm below the existing `1.14` quarry floor, with a terrain-sampled 1.75 m skirt. `mine-floor-coverage.ts` subtracts mounted flat visual coverage while keeping the fallback collider. This already repairs the historical 14 cm lip and recessed dirt gaps. No new high-confidence quarry defect found by this audit. |
| Quarry raised ledges/rocks | Authored raised decks and rock bounding overlap are not proof of floating. Quarry proxies/assets were not fully decoded or traversed, so no asset-wide visual pass is claimed. |
| Video Rebirth factory main floor | `factory-geometry.ts:68` maps the entire irregular factory footprint to local top `.12`, thickness `.20`; origin is `y=1`, giving top `1.12` and bottom `.92`, embedded in flat `1.00` cape soil. Ribs have visible base plinths (`:70–73`). No floor floating issue. |
| Factory forecourt additions | Bounded probes of portal plinths, four north bollards and five courtyard perimeter endpoints all return earth `1.00` and negative footprint distances. The details sit on the `1.12` slab and are not outboard floating props. |
| Factory galleries and roof | Supported ribs, sloping ramps, open galleries and sawtooth roof are intentional elevated architecture. A broad bounding box spanning air is harmless. Factory layout/terrain tests were inspected but not run; no new runtime collision acceptance is claimed. |
| Legacy exchange park bridge | Existing slab clipping in `exchangePlatformSlabs` deliberately owns butt joints with the park and porch. That intentional connection must be preserved; F1 concerns grounded exterior stone skirts only. |

## Verification limits and integration direction

The bounded Node queries imported production layout and analytical height functions through the repository's existing TS loader. They did not call `buildTerrain()` or `meshHeight()`, decode full visual assets, or launch a renderer. The initial audit changed no material, model, quality setting, runtime source or collider. The authorized follow-up changes are recorded below. Main integration should prioritize F1/F2 structural contact and preserve pool access while assessing F3; S1 belongs to actual terrain mesh verification before implementation.


## Authorized structural repair follow-up

Implemented F1/F2/F3 in the two owned geometry modules only:

- `WorldAlphaExchangeGeometry.ts`: four grounded main-floor platform families now emit exterior plinth skirts from the existing slab underside to sampled terrain minus 2.5 cm. Edges are divided at no more than 2 m intervals. The new faces pass through the existing visible/solid geometry path, retaining top support triangles, interior pit, galleries and park butt joint.
- `WorldDjcClubGeometry.ts`: each of the two existing pool approaches receives two pairs of short timber piles, eight piles total. Feet bury 3 cm into terrain; tops intersect the unchanged deck underside by 3 cm. Existing timber color and the same visible/solid rod helper are reused.
- `WorldDjcClubGeometry.ts`: non-access inner coping returns now exist in the default assembly and share their triangles with solid collision. Default new faces reuse the existing mineral floor color; the candidate-only liner finish remains candidate-only. Four access bays retain their open inner lips.
- `facility-site-contact.test.mjs`: three targeted geometry/ray tests cover exchange exterior draw/solid closure, actual timber support below walking faces, and default closed pool sections plus open access sections.

Verification: the corrected regression test was first run on the unmodified geometry and failed all three tests with the expected missing-skirt, missing-timber and missing-pool-return assertions. The first post-change runner exited after approximately 25 seconds with only `test failed`, no assertion details. A subsequent direct single-process attempt was stopped on the integration owner's instruction to avoid running alongside shared terrain edits. Therefore no post-change pass is claimed. The integration owner will run this test serially after shared terrain stabilizes:

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/facility-site-contact.test.mjs
```

No browser, full build, full terrain construction or asset-generation job was deliberately started in this lane. No commits were made. Actual daylight/night appearance and ordinary traversal still require integration verification. S1 remains with the terrain owner.


### Bounded geometry extraction and final independent check

After the integration owner also observed exit 137 from the original full-builder test, the added geometry was extracted into `src/components/world/facility-site-contact.ts`. The two production geometry builders now consume its real triangle outputs for exchange skirts, eight timber piles and pool inner returns. The shared original walkway outline and pool access predicate also come from that module. This avoids duplicating the implementation in a test.

The dedicated test now imports only the small contact module plus existing layout data. It builds none of `WorldLandform`, the refined club or the full exchange. It tests actual generated triangles with rays, checks terrain-following feet with flat/sloping height surveys, and verifies that pit/park/gallery families and pool access sections emit no new closure. Result: **3 passed, 0 failed**, approximately **435 ms** including the loader. This establishes the added geometry in isolation; integrated draw/collision acceptance and current live terrain remain the integration owner's checks.
