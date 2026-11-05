# Coaster arrival and rider-right boarding repair

Baseline: `070de2fa47a9ba49239b0ac0e957326fae4ae665`. User accepted that revision's ground **material**, but rejected the relationship between paving, road and lawn. A subsequent screenshot reported stair cheek flicker and repeated the earlier request for right-side stairs.

## Construction and behavior

- The east access road ends outside the workshop, at a 6.4 m radius turning head around `[5,-121]`. Its contour joins the retained main asphalt boundary without a second overlapping disk. A 3 m pedestrian connection rises from 1.045 m to the 1.12 m apron. Road, map, vegetation exclusion and vehicle recovery share the survey.
- The west curb has an actual opening. The apron collider now covers its full convex outline, including the previously unsupported west/north corners. The old central box was narrower than the visible paving. North-edge grass is excluded and the tree formerly at `[38,-116]` is replanted in the verge at `[38,-112]`.
- Boarding is on **rider-right**, defined by the stopped train's forward/side frame, independent of camera angle. The stair mesh, collision, ground probe, approach/exit points, turn animations and carriage doorway all use this side. The existing ride route and speed are unchanged.
- Stair cheek plates now replace a slice of the mineral core. They stop below the contact slab instead of sharing its exterior plane. No polygon offset masks the defect. Native Blender station sources and both visual LODs were regenerated.
- The carriage's short guard is on +Z. Restraint pivots were moved forward out of the doorway. Both near and far GLBs, the editable source and parked contact shells agree. Existing materials and texture sizes are retained.

## Evidence and boundaries

`boarding-tests.txt`: 23 focused tests pass, including both shipped carriage LOD openings, the right-side return aisle, transition cancellation/exit, geometry transfer and 301,464 actual boot/tread samples. Minimum sampled sole clearance: 3 mm.

`arrival-tests.txt`: 6 focused tests pass, including no interior asphalt overlap, continuous shared road/walk top, unobstructed curb opening, northern grass exclusion and real Rapier support at apron corners. Rapier convex ray hits use a 1 mm tolerance; observed numerical error near one edge was 0.094 mm.

`station-export-check.txt`: all seven contact tops, structural datums and single exterior stair cheeks pass for both station LODs. Near/far station triangles remain 29,480 / 2,388; 7 materials and three 256 px images are retained. Carriage near/far remain 8 batches, 21,772 / 5,221 triangles; no new textures.

An unrelated existing layout assertion expects a far coaster boundary clearance below -5 m at `[230,-175]`; HEAD and the modified tree both return -4.666728 m. That boundary was not changed. Do not report the entire historical suite as passing.

The material few-shot is installed in the local `blender-material-craft` skill, with byte-identical before/after images and a separate unresolved-site badcase. This repair is not automatically a user-approved site goodcase. Runtime screenshots and bounded frame measurements are separate from the CPU checks above.

## Reproduction

Use `tools/world/coaster-site-repair-20261106/review.config.mjs` for the isolated visual/interaction harness. It adds arrival, right boarding and grazing-side views plus a pedestrian approach start. Production uses `tools/world/coaster-ground-craft-20261105/playable.config.mjs`, which contains none of these QA controls.

Builds use an empty public directory and the retained immutable public-asset fallback. Serialize native export, builds and browser work on this machine. Do not copy historical recordings or duplicate the full public asset tree.

## Browser verification, 2026-11-06

- The isolated v3 review build loaded all 241 resources without a resource failure. Ordinary interaction completed: take key, unlock gate, board through rider-right stairs, ride a full 114 s loop, request station exit and descend to the right-side exit. `right-exit.json` records the settled position `[55.36193,1.898825,-151.94504]`, matching the new exit contract.
- `stairs-day.jpg`, `stairs-graze-day.jpg`, and `stairs-graze-night.jpg` show the actual browser materials, stair surfaces and car doorway. The reported speckled cheek is absent from these inspected viewpoints. This is a bounded visual check, not a claim that every surface in the world is free of flicker.
- `arrival-day.jpg` shows the road terminating outside the workshop and the pedestrian connection. Native keyboard movement from the turning head, across the walk and into the apron reached `[19.88797,1.938649,-125.25719]` without falling through the joint. `walk-start.json` and `walk-arrival.json` retain the endpoints.
- One settled workshop sample at 1710 × 931, DPR 1, balanced, midday: 360 frames, P50 17.0 ms, P95 31.7 ms, maximum 110.3 ms; 220 calls and 959,814 triangles. See `runtime-performance.json`. Isolated hitches remain. This is not a matched baseline comparison or whole-world performance acceptance; gate/progress state and residency differ from the earlier ground sample.
- The computer reported warning memory pressure and under 20 GiB free disk. Exports, builds and browser checks were serialized in one existing tab. One native-input connection interruption required rebinding the existing tab; no extra browser window was opened.
