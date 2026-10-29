# Static shadow cohort updates

2026-10-28. Performance session, branch `codex/perf-shadow-incremental`, base `03fee8e`. Only shadow implementation, dedicated tests and this handoff changed. No integration, audio, actors, coaster/IBD assets, browser, full build or 4341 changes.

## Evidence and cause

Read the coordinator's `docs/world/phase-2-playground/visual-calibration-20261027/runtime/world-v19-dev-frame-window.json` from integration. This is an Astro dev localization sample, normal play (`shot: null`), balanced quality, stationary at the coaster, changing daylight; not a production comparison.

- 5,444 frames / 91.4997 active seconds, p95 17.1 ms, maximum interval 336.4 ms.
- Frame 121: `shadow-chunks` 325.5 ms, 184 rigid casters, 540 chunks.
- Frame 151: `shadow-chunks` 213.5 ms, 197 rigid casters, still 540 chunks.
- Both records report zero train casters merged/eligible. Structure jobs report zero active/completed/failed. The old train-static-classification defect and a worker completion do not explain these two records.

Source confirms a global invalidation mechanism: every 30 frames `rescan()` discovers casters and advances their two-stable-scan qualification. Any eligible-set signature change previously disposed every chunk and transformed/rebinned every eligible source, even when only a later cohort joined existing cells. This accounts for redundant work on unchanged sources when the set grows. The supplied sample lacks source IDs, so it does **not** identify the 13 net additional objects or prove there were no simultaneous removals/replacements. New probe fields resolve that uncertainty on the next run.

## Implemented boundary

`ShadowChunkCache` compares current source IDs/versions. If all previous sources remain unchanged and new sources join, only the new sources pass through the existing `ShadowChunkBuilder`. Only cells touched by those triangles get replacement final buffers. Other chunk geometry and mesh identities are retained. A source removal, transform/geometry/shadow-override/side revision, eligibility loss or zone revision takes the conservative complete rebuild path. An unchanged set does no geometry work.

The source loop still chooses the same full/hull geometry, radius cutoff, material side, zones and three cascade cells (12/20/32). There is no hidden content, shadow-disable path, reduced resolution, delayed eligibility or changed caster stability threshold. Bucket keys/counts, oriented triangle sets, bounds and zone contribution counts match a complete rebuild in tests. Appended triangles can have a different submission order within opaque depth-only chunks. A tied majority-zone QA label can consequently retain a different insertion-order winner; this does not alter rendered triangles or shadows.

Replaced chunk geometry is disposed, source geometry is borrowed, and empty membership releases the final chunks. The runtime retains only current final chunk geometry plus source version strings and per-bucket zone/bounds metadata. It does not retain per-source transformed triangles, add a worker/timer, or increase chunk count. Final buffers are shared with their existing meshes, not duplicated in the cache.

Costs and limits:

- First full construction remains synchronous. This patch does **not** claim to remove the first 325.5 ms event.
- Appending to an occupied cell copies that cell's existing final vertex/index buffers and recomputes its bounding sphere; a new object spanning most cells can still be expensive.
- Updates stage new buffers while old buffers remain available, so transient CPU memory includes old/new affected geometry and builder scratch. Final retained geometry has the same triangle count. Extra metadata is bounded by current sources, chunks and zone entries.
- Changed/removing sources still rebuild globally. In-place source mutations without a changed existing signature remain outside this patch's prior invalidation contract.

## Verification

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/shadow-chunk-builder.test.mjs \
  src/components/world/shadow-chunk-cache.test.mjs \
  src/components/world/shadow-chunk-integration.test.mjs

node_modules/.bin/tsc --noEmit --skipLibCheck --target ES2022 --module ESNext \
  --moduleResolution Bundler --jsx react-jsx --allowImportingTsExtensions \
  --types vite/client src/components/world/WorldShadows.ts
```

11 tests pass, 0 fail, final suite 1,279.6 ms. Focused TypeScript checking and diff whitespace checking pass. The initial new test file had a missing closing brace; that syntax error was corrected before the passing runs.

- Synthetic 184-to-197 fixture: 13 sources built, 184 reused, 48 chunks rebuilt, 294 reused, 342 final chunks. Old heavy-source vertex reads are zero. Oriented triangle multisets, spheres, light bounds, material sides and zone counts match a full rebuild. Last single diagnostic timing: append 1.45 ms versus full 8.12 ms. These are small synthetic Node fixtures, **not production/browser speedups**.
- Tests cover interleaved source discovery, indexed/nonindexed sources, near/far hull selection, negative cells, movement/removal/replacement, unchanged updates, the 65,535 index restart boundary, error retention and resource ownership.
- Actual `WorldShadows.fitSunShadow()`/rescan integration on a tiny Three scene: late stable casters cause zero old-source vertex reads; 3 chunk buffers retained, 12 replaced; unchanged rescans reuse buffers; removal/replacement rebuild; an empty scene removes all chunk meshes. No WebGL renderer or production assets were instantiated.

Preflight: memory pressure 2, swap 8.75 GiB, disk 3.73 GiB. All work was serial source inspection and short tests; no install/download/assets/subagents or heavy window was used. The performance directory was clean; a fresh branch at the requested base preserves the previous `67f63b9` branch rather than resetting it.

## Coordinator runtime acceptance

Existing `sceneWorkProbe` naming/timing is retained. Explicit `shadowRebuildProbe` records now include `update` (mode, added/removed/changed, built/reused sources and chunks) plus at most 16 added source names, still bounded to 16 records and inactive outside the requested DEV window.

Repeat a comparable normal-play `start=coaster`, balanced initialization window and inspect whether the second update is append-only. Compare shadow-chunks duration and slow-frame context; do not infer success from Node timings. Separately verify daytime/nighttime, near/far cascade shadows, departure/re-entry and moved/removed/replaced source behavior. Compare final chunk/draw/triangle totals and GPU-resource plateau; allow for real scene-version differences. First full-build latency, production FPS, actual peak memory and visual acceptance remain unverified. Main owns integration, push and 4341.
