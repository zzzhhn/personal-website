# quality-v3 environment: sea, coast, camp ground (worker 02)

Spec: `bobby-3d-world/规格-quality-v3-20261022.md` sections 2, 3, 7, 10.1 and 10.2 (surface/solid split).
State: implemented in source and observed on the current-source dev server `http://127.0.0.1:4322`.
Not built and not committed; the main thread integrates.

## Valid evidence

| What | Path |
| --- | --- |
| Normal entry (`/world`, no query, no QA API, real keys only): 2 s sea video | `candidate-8/normal-entry-edge-2s.webm` |
| Normal entry stills (spawn, plateau edge after a 7 s key walk) | `candidate-8/normal-entry-default.png`, `candidate-8/normal-entry-edge.png` |
| Sea pixel metric and QA observations | `candidate-8/capture.json` (`normalEntry`, `fixtures`, `timing`, `stats`) |
| QA fixed shots, dusk and night (overview / camp / bridge) | `candidate-8/shot-*.png` |
| Player-camera views, dusk and night (fixture teleport at terrain height) | `candidate-8/{coast-west,coast-north,camp-edge,camp-terrace-se,coast-east-seawall}-{dusk,night}.png` |
| Offline geometry checks (same buffers as render and Rapier) | `geometry/geometry-report.json`, `geometry/island-shoreline.json` |
| Runtime physics checks (QA entry) | `physics/physics-report.json`, `physics/slope-walk-end.png`, `physics/terrace-block.png` |
| Before (HEAD 84e4d54) | `before/` |

Invalid or superseded: `candidate-1` (captured the old 4321 static build), `candidate-2`/`candidate-3` (coast fixtures
at a fixed y=1.9, so the player was embedded), `candidate-2` to `candidate-7` (intermediate iterations).
Each folder carries a marker file.

Re-run:

```sh
node_modules/.bin/tsx tools/world/environment/fixtures.ts
node_modules/.bin/tsx tools/world/environment/probes.ts
node_modules/.bin/tsx tools/world/environment/verify-geometry.ts docs/world/quality-v3/environment/geometry
WORLD_BASE_URL=http://127.0.0.1:4322 WORLD_BROWSER_MODULES=/Users/bobby/CodeBuddy/Claw WORLD_ENV_OUT=docs/world/quality-v3/environment/candidate-N node tools/world/environment/capture.mjs
WORLD_BASE_URL=http://127.0.0.1:4322 WORLD_BROWSER_MODULES=/Users/bobby/CodeBuddy/Claw node tools/world/environment/physics.mjs docs/world/quality-v3/environment/physics
```

## What changed

- `WorldLandform.ts` (new): one deterministic height function and a 0.5 m faceted terrain mesh for the island, camp
  plateau, beaches, underwater shelf, town seawall and ramp embankment. Nodes are jittered by ±0.1 m and snapped onto
  rock and ramp creases, and quads split along the flatter diagonal, so steep faces read as continuous bands rather
  than sawteeth. The same file provides the shore distance field (exact EDT), ground classification, scatter
  candidates, rock placements, `meshHeight`, `nearestDryPoint`, `islandShoreline()`.
- `WorldTerrain.tsx`: renders that mesh (vertex colours plus detail, wet sand that follows the swash) and two Rapier
  trimeshes built from **the same vertex buffer**: `island-terrain-surface` (triangles <= 25°, `userData.surface`) and
  `island-terrain-solid` (> 25°: rock terraces, seawall face, embankment sides, `userData.solid`). It also renders
  clumped grass tufts (5 tris) and pebbles (20 tris), one instanced draw each, refilled within 40 m of the focus.
- `WorldWater.ts` / `WorldSea.tsx`: four Gerstner waves (λ 13 / 8.5 / 5.3 / 3.4 m, ΣA 0.245 m, Q 0.6, within ±38° of
  the wind, c = √(gλ/2π)) on a camera-following grid. The grid is 0.5 m cells within ±60 m, growing ×1.3 per ring to
  ±300 m, and waves fade over 48–58 m. Also flat-shaded facets, a crest/trough tint, deep `#1E5A5E` to near-shore
  `#3C8A8A` over 0–8 m, and swash foam `#E6DCCB` (width 0.4–1.2 m, travel 0.55 m, period ~5.5 s, noise breakup,
  opacity ≤ 0.85). One draw, no extra pass. The shared wind clock is kept, so pause, shots and reduced motion still
  stop the waves.
- `WorldEnvironment.tsx` (Island and sea only): the extruded slab, its shelves, the submerged copy and the r=24 camp
  `CylinderCollider` are removed. The park plaza now uses `WorldSurfaceColliders` (surface top, solid sides; same box
  visual and coordinates). Lighting, StaticBlocks and createLayout are untouched.
- `WorldCamp.tsx`: the old disc and cliff are removed (the terrain draws them). Scaled G21–G23 rock groups from
  `rockPlacements()` dress the terraces and the seawall ends, each with its fitted collider.

## Interface for the minimap (main thread)

```ts
import { islandShoreline } from './WorldLandform';
// [x, z][] waterline at WATER_Y, 360 points, cached; the park plaza block (x 36..54, z -54..-36) is not included.
```

A static copy is in `geometry/island-shoreline.json`. `ISLAND_OUTLINE` in `layout.ts` is **unchanged**. It is still the
base that the irregular coast is pushed outward from, so every old placement stays supported.

## Measured (M5 Pro, headless Chrome, Metal; 60 Hz cap)

- Sea metric at the normal entry, 3 samples over 0.5 s, about 10k sea pixels at 480 px width: mean 6.23–6.31/255;
  27.9–28.7 % of sea pixels change by more than 8/255 (spec: ≥ 3/255 and ≥ 10 %). Pass.
- Frame timing at the west coast (QA entry): 60.2 fps, p99 16.8 ms, 0 frames over 33 ms. That is capped at 60 Hz, so
  it is a ceiling, not headroom. M1: **not verified**.
- Scene: 50 draw calls, about 310k triangles drawn at the default camera (before: 128 calls / 82k). Terrain mesh 109k
  triangles (2952 fine 2 m blocks, 7447 coarse); sea grid 152k triangles. Visible ground detail at most about 19k
  triangles (3285 tufts + 139 pebbles inside 40 m; spec ≤ 60k).

## Geometry and physics checks (all pass)

Geometry (`geometry-report.json`, 14/14):

- surface triangles ≤ 25° (max 24.99°), all facing up; solid triangles > 25°
- terrain never above any road top (max −0.035 m); camp exit/ramp slab carried by the embankment (gap ≤ 0.24 m under
  the 0.18 m slab)
- buildings, foundations and the plateau keep their old base heights (plateau 4.80–4.84; spawn 4.80)
- shoreline local radius deviation −12.7 % to +13.6 %, 8 bay↔headland crossings over a 468 m perimeter (about 58 m
  apart, against the spec's 30–50 m; see open items)
- beaches 5–12 m wide; the underwater shelf reaches −2.5 m 10.3–16.3 m from the waterline
- rocks seated; `nearestDryPoint` lands on dry ground

Runtime (`physics-report.json`, 8/8):

- terrain surface and solid trimeshes present; no cylinder or old slab remains
- park plaza surface/solid split
- capsule ground matches the rendered mesh within 2 mm
- water recovery (west, north) sinks below −0.7 m and ends grounded on land
- a real-key walk up the 19° flank reaches the plateau
- real keys into the 58° terrace rise only 0.44 m

## Open items, not hidden

- **Bay spacing**: about 58 m between bay/headland crossings, not 30–50 m. Raising the high-frequency coast terms
  narrows the beaches near corners. It can be tuned, but has not been yet.
- **Water recovery target**: `WorldActors` (not owned by me) still recovers to `nearestRoadPoint`, which is on land
  (camp exit road). The spec says "nearest land point on the new coastline". `nearestDryPoint(x, z)` is exported for
  the main thread if it wants that behaviour.
- **Triangle count** rose about 3.8×. Draw calls fell from 128 to 50 (the old per-block slabs were folded in). If M1
  needs headroom, the first lever is the sea's outer rings (152k triangles); waves already fade beyond 58 m.
- **Vehicles**: no drive run across the new seawall/embankment edges in this round (the tyre-guard audit belongs to
  the main thread). Roads, bridge and park coordinates are unchanged, and terrain sits below every road top.
- The night sea and foam are readable but dark (see `candidate-8/*-night.png`). Final judgement is visual and belongs
  to the reviewer.
- The 404 in the normal-entry console exists at the same entry independent of these files. It was not investigated.
