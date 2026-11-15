# Loading map and Alpha site repair

User screenshots identify an obsolete loading map, unsupported shallows banks and a sled/lodge intersection. This is a correctness repair of the approved scene, not new visual approval.

## Root causes and changes

- Loading used the legacy island outline and narrow viewBox until asynchronous terrain imports finished. Loading, full map and radar now use a synchronous snapshot generated from current waterlines, roads and tracks. Vite checks its source fingerprint and regenerates before dev/build. No runtime Three/terrain dependency is introduced into the initial map.
- The sled clearance excavation cut the shallows north-west bank roughly four metres below the authored facility. The northern descent now runs outside its footprint. The full shallow basin owns its grade before the bed cut; sampled visible bank heights are approximately 11.90–11.94 m beneath bank details at 12 m.
- The lower sled formerly traversed the lodge footprint. It now passes west and south of the lodge; curved centreline clearance to the roof footprint exceeds 2.5 m. The lower terminal moves two metres south, with its boarding and safe exit geometry following the same source. The pedestrian arrival loops around the terminus instead of crossing the runners.
- The lodge foundation and east-side egress apron retain their surveyed grade, rather than being erased by an overly broad track excavation. The obsolete polyline excavation was removed; the actual curve still controls track clearance.
- Alpha rocks, plants, path rails and trail-lamp placement now interpolate the exact rendered/collision triangles. The immutable runtime terrain arrays are shared, avoiding another mesh or per-frame raycast.

## Verification

- Targeted terrain, curved route and transport checks: 10/10 passed, including actual mesh support, capsule boarding/egress and safe landing.
- Exact triangle height lookup agrees with downward mesh rays at 48 dispersed positions within 0.00001 m.
- Map first-render tests reject any Three/terrain import and check current waterline and full map bounds. Generated v4 data is approximately 61 KiB gzipped; legacy v3 remains optional through its existing URL flag.
- Full TypeScript check and production build passed. Balanced remains the default.

Runtime browser visuals and a whole-world asset-by-asset audit are not claimed. Safari was available but the previous world tab was no longer open; memory pressure remained warning and free disk approximately 2.4 GiB. No additional 3D browser was opened. Built candidate is served on 4343; stable 4341 remains separate.
