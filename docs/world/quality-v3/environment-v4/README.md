# quality-v4 environment: ground look, disturbable grass, see-through water

Request: main thread, 2026-10-22, plus a follow-up while the Art Lock ruling is pending. The ruling decides whether
the ground should be matte flat-shaded low-poly or use PBR photo textures, and it is with Astra. Until then the
default uses only the non-conflicting low-poly techniques, and the CC0 PBR detail is a switchable candidate
(`?groundPbr=1`). Observed on the current-source dev server `http://127.0.0.1:4322`. Not built and not committed.

## Evidence

| What | Path |
| --- | --- |
| Ground at 1080p, near and mid, three columns (before v3 / v4 default / PBR candidate) | `compare-{near-camp-grass,near-west-slope,mid-west-coast,mid-camp-rim,near-beach-north}.png` |
| Same views at full resolution | `before/`, `after-high/`, `after-balanced/`, `candidate-pbr/` (`*.png`, `compare.json`) |
| Full-resolution centre crops (near views) | `crop-near-*.png` |
| Walking through grass, real keys: video and stills | `grass-water/walk-grass.webm`, `walk-0-before.png`, `walk-1-passing.png`, `walk-2-trail-bent.png`, `walk-3-recovered.png` |
| Clean before/after pair (same camera, reduced motion so there is no wind sway) | `grass-water/still-1-trail.png`, `still-2-recovered.png`, `still-trail-diff.png` |
| Driving the offroad through grass, real keys E/W/Space | `grass-water/drive-grass.webm`, `drive-1-passing.png`, `drive-2-tracks-bent.png`, `drive-3-recovered.png` |
| Walking into the sea: clear spot | `grass-water/sea-clear-spot.webm`, `sea-1-wading.png`, `sea-2-submerged.png` |
| Car driven into the sea: clear spot | `grass-water/sea-3-vehicle.png`, `grass-water/sea-vehicle.json` |
| Numbers | `grass-water/report.json` (cases, trample curves, timing for high and balanced), `gpu-cost.json` (uncapped) |
| Geometry re-run (14/14) | `geometry/geometry-report.json` |

Some stills (`walk-trail-diff.png`, `drive-track-diff.png`) include wind sway and camera settling in the
difference. Use `still-trail-diff.png` for the clean comparison.

Tools in `tools/world/environment/`: `grass-water.mjs`, `compare-v4.mjs`, `sea-vehicle.mjs`, `gpu-cost.mjs`
(and the existing `verify-geometry.ts`).

## What changed

- **Ground, default low-poly look** (`WorldTerrain.tsx`, `WorldLandform.ts`):
  - per-vertex value mottling (±5 %) and a hue shift
  - world-space patch noise (value at 1.6 m and 0.45 m, plus a 9 m warm/cool drift); grass is darker in hollows
  - roughness 0.86–1.0 with variation (0.72 on wet sand)
  - weaker dielectric specular (F0 0.016, F90 0.4), which removes the grazing "plastic" sheen
  - faceted micro relief: a skewed triangular 0.45 m lattice with ≤5° tilts, fading with distance, on walkable ground
  - worn foot paths (camp north rim to the beach, west flank trail, beach access by the road); they are visual only
    and grass does not grow on them
  - mixing by slope and height is unchanged from v3 (stone on steep faces, grass/sand by height and coast distance)
- **PBR candidate** (`?groundPbr=1`): ambientCG CC0 Grass004 / Ground054 / Ground037 at 512 px, sampled in
  world-xz UVs. The albedo detail is colour-preserving: the texture divided by its mean multiplies the Art Lock vertex
  colour. The normal and roughness channels are also applied. Each texture is sampled twice (base tiling and a 37°
  rotated offset tiling) and blended by noise to break up repetition, and the per-vertex weights (grass, sand, dirt)
  come from the ground classification. This is not loaded by default.
- **Grass** (`WorldGrass.tsx`, new):
  - one instanced draw of 15-triangle tufts (5 blades × 3 triangles)
  - candidates are clumped at 0.8–4 per m² on grass only; never on roads, paths, the trodden camp plaza, pads, tents,
    building footprints, water or slopes over 25°
  - density is full within the near radius and thins with distance; tufts shrink into the ground before culling
  - the shared wind clock drives sway (zero under reduced motion or pause)
  - bending comes from live disturbers (player footprint 0.6 m; two axle discs per vehicle) plus a decaying 0.25 m
    trample map, so the trail stays down and then rises
  - it has no colliders
  - an actor tracker reads the player from the `world-guide-G24` scene object and the vehicles from Rapier bodies
    tagged `userData.vehicle`; `WorldActors.tsx` is not touched
- **Sea clear spot** (`WorldWater.ts`, `WorldSea.tsx`): up to four soft world-space discs where the sea alpha drops
  to 0.16, with a slightly lighter teal rim. A disc appears only when a tracked body's underside is below
  WATER_Y + 5 cm. It fades in over about 0.25 s and out over about 0.5 s. The player disc is 1.5 m; a vehicle disc is
  half its width + 1.95 m. The material is now transparent but still writes depth.
- The old 5-triangle `ground-grass-tufts` scatter is replaced by the blades. Pebbles are kept.

## Measured (M5 Pro, headless Chrome on Metal, 1920×1080, DPR 1)

| | high | balanced |
| --- | --- | --- |
| Grass profile | near 16 m, far 36 m, cap 4000 | near 10 m, far 26 m, density ×0.7, cap 2200 |
| Visible grass at the west meadow | 2921 tufts / 43,815 tris | 1151 tufts / 17,265 tris |
| rAF frame time, meadow and camp (60 Hz capped) | p50 16.7, p99 16.8 ms, 0 frames over 33 ms | same |
| Uncapped GPU frame time with grass (`gl.finish`, vsync off) | mean 6.05, p50 4.7, p99 14.7 ms | mean 4.02, p50 3.0, p99 10.0 ms |
| Same, grass hidden | mean 4.75, p50 4.2, p99 12.2 ms | mean 3.83, p50 3.0, p99 8.7 ms |
| Shadow map | 4096 | 2048 |

Grass cost: about +1.3 ms mean (high) and +0.2 ms (balanced). Spec limits: ≤ 40 tris per item (15), one draw
call (1), ≤ 60k visible (43.8k high). The Blender skill budgets are per-prop (2–6k, hard cap 8k) and do not map
directly onto terrain. I used the spec's 60k ground-detail cap as the governing value. M1: **not verified**.

## Checks

- walk-grass: 12 m of real-key walking. Trail probes (path points the body left 0.4–3 s before stopping) read a peak
  of 0.88 and fall to 0 by 4.3 s.
- drive-grass: real E plus W, 25.6 m driven, 2 axle disturbers. Track probes peak at 0.65 and fall to 0 by 3.3 s.
- still pair: with the camera unchanged and no wind, the trail pixels change and the rest of the frame does not
  (mean diff 0.27, 0.2 % of pixels > 30).
- sea: the spot reaches strength 1 when the player wades in (player y down to −0.87) and is gone on land. Also
  confirmed when the coupe is driven in (2.9 m disc).
- `npx tsx tools/world/environment/verify-geometry.ts`: 14/14. The terrain mesh and colliders are unchanged.
- `npx astro check`: 0 errors, 0 warnings.

## Not done / open

- **Art Lock ruling** on PBR versus low-poly: the candidate is ready behind `?groundPbr=1` and is not the default.
- **Normal-entry evidence**: all grass and sea videos are on the QA entry (fixture start, real keys). Spec §9 wants
  normal-entry videos for final acceptance; these have not been recorded yet.
- **Underwater camera**: the follow camera is clamped above WATER_Y by `WorldActors` (not mine), so the view is
  always from above the surface. A view from below the surface is not provided.
- **Load cost**: the grass candidate build is about 1.0 s of main-thread CPU at first load (measured in Node). It has
  not been moved to a worker.
- **Coupling**: the actor tracker depends on the scene name `world-guide-G24` and the Rapier `userData.vehicle` tag
  set in `WorldActors`. If the controls session renames either, grass bending and clear spots stop silently. The
  tracker logs nothing.
- **Transparency side effect**: the sea now draws in the transparent pass. With `depthWrite` on it still occludes
  correctly in the cases tested. Other transparent objects (the occlusion fade copies, obstacle fade) were not
  re-checked against it.
- The dev server intermittently returns 504 "Outdated Optimize Dep" because a shared Vite re-optimize was running.
  One capture timed out for that reason and was re-run.

---

## Update after the Astra ruling (spec §13), 2026-10-22

**This section supersedes the earlier "Measured" table and the GPU wording above.**

### What changed

- **PBR detail is now the default ground**; `?groundPbr=0` restores the procedural v4 fallback.
- **Kept:**
  - colour protection (texture / its mean multiplies the Art Lock vertex colour; clamp narrowed to 0.45–1.6)
  - the matte setup (roughness 0.86–1.0, F0 0.016, F90 0.4)
  - slope/height mixing and the worn paths
- **Dirt texture (Ground037):** it contains moss, so only its luminance is used and trodden ground stays Art Lock
  earth instead of turning green.
- **Anti-tiling:** three samples per texture (base, rotated 37° ×1.13, rotated 71° ×0.87), weighted by noise over
  roughly 4–9 m. The first two-sample version still showed a square paving grid on the camp plaza.
- **Micro facets:** removed in the PBR default (weight 0), because Bobby saw an origami look up close; the texture
  normal gives the near relief instead. The fallback keeps the ≤5° facets.
- **Grass candidate build:** now runs in ≤ 6 ms slices on `requestIdleCallback` (falls back to `setTimeout`), not as
  about 1 s in one block. Grass appears once the build finishes: 0.4–0.8 s wall time after load in the runs below.

### Evidence

| What | Path |
| --- | --- |
| Three-way comparison: before v3 / fallback `?groundPbr=0` / PBR default | `default-pbr-{near-camp-grass,near-west-slope,mid-west-coast,mid-camp-rim,near-beach-north}.png` |
| Full-resolution views | `pbr-default-high/`, `pbr-default-balanced/`, `fallback-procedural/` |
| Grass and water cases re-run with the PBR default | `grass-water-pbr-default/` (walk 4.3 s recovery, drive 4.3 s, sea spot 1.0, all pass) |
| Sync wall-clock frame intervals | `sync-wall-frame-{pbr-default,fallback}{,-run2,-run3}.json` |

### Ground-detail budget (spec §3: grass + pebbles together ≤ 60k visible)

| | high | balanced |
| --- | --- | --- |
| Grass | 2921–2975 tufts × 15 = 43,815–44,625 | 1151 × 15 = 17,265 |
| Pebbles | 137 × 20 = 2,740 | 137 × 20 = 2,740 |
| **Total** | **46,555–47,365** | **20,005** |

There are no other ground-detail classes. Live value: `__worldEnv.groundDetail()` (QA entry).

### Frame-time terms, corrected

The earlier "uncapped GPU frame time" figures are actually **synchronous wall-clock frame intervals**:

- How it is measured: the rAF callback interval, with `gl.finish()` in every callback and vsync and the frame-rate
  limit off.
- What it includes: CPU frame work, GPU completion and browser overhead.
- What it is not: pure GPU time.

The earlier numbers are kept in `gpu-cost.json`, with this caveat.

Re-measured after the PBR default: three runs each, at the west meadow, 1920×1080, DPR 1, M5 Pro, headless Chrome on
Metal, values in ms.

| sync wall-clock interval | high, grass on: mean / p99 | high, grass off | balanced, grass on | balanced, grass off |
| --- | --- | --- | --- | --- |
| PBR default | 3.05, 2.69, 6.39 / 8.7, 7.5, 13.6 | 2.61, 2.52, 5.28 / 6.6, 6.4, 13.7 | 2.63, 2.57, 5.99 / 6.4, 6.2, 12.9 | 2.47, 2.41, 5.18 / 6.1, 6.3, 12.0 |
| Fallback `?groundPbr=0` | 2.12, 1.61, 4.11 / 6.1, 3.1, 11.0 | 1.96, 1.46, 4.17 / 6.1, 3.0, 12.5 | 2.02, 1.53, 3.66 / 5.5, 3.2, 10.5 | 1.92, 1.46, 3.07 / 5.6, 2.8, 9.5 |

- **Noise:** runs vary by up to 2× because the dev server and other sessions share the machine. In the two quieter
  runs, PBR costs about +0.9–1.1 ms mean over the fallback in high, and grass about +0.2–0.4 ms.
- **Normal rAF:** p99 16.8 ms, capped at 60 Hz, in both profiles and both modes.
- **M1:** not verified.

### Remaining items

- Normal-entry videos: the main thread will record these after integration.
- The camera never goes below the water. This is the controls session's anti-clipping design, so it stays as is.
- The terrain classification and grass build still run on the main thread (now sliced). They are not in a worker.
