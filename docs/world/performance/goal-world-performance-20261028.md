# Performance handoff: normal-play resource regression and frozen-shot rendering

2026-10-28. Owner: performance session. Branch `codex/goal-world-performance`, base `43f9507`. This work does not change integration, audio, actor controls, attraction geometry, drawing resolution, or 4341.

## Normal play: bounded regression, not an FPS improvement claim

Normal play remains `always`, including a stationary player: wind, weather, other actors and rides still need updates. Physics continues to follow R3F's render loop (installed Rapier default `updateLoop="follow"`). Pause/pool inspection use demand rendering; hidden pages use `never` and pause Physics.

The suspected unbounded resource retention on repeated facility visits was **not reproduced in the tested ownership paths**:

| Evidence | Result | Limit |
| --- | --- | --- |
| Existing actual `CoasterStructureCache` regression, 100 near/far crossings | Exactly two builds; two bounded CPU variants; explicit GPU-release calls on switches | Tiny Three geometries, not production geometry sizes or real GPU allocation |
| New actual cache + worker-job adapter regression, 100 mount/request-detail/unmount cycles | Active jobs return to baseline; zero deadline handles and abort listeners; 200 geometry dispose events; late callbacks cannot revive a task | Mock worker transport; no real browser worker created |
| Actual worker-job adapter completion/error/malformed reply/deadline paths | Every path terminates once and clears its deadline; active job count returns to baseline | Simulated completion and deadline, not a 15-second wall-clock wait |
| Actual IBD safety scheduler, 3,600 frozen calls | Zero collision-screening calls and zero elapsed-time advancement | Scheduler test, not a rendered/Rapier scene |
| Actual IBD safety scheduler, 600 blocked active steps (10 simulated seconds) | 86 screening calls; elapsed time remains zero; another 3,600 frozen calls add none | Counting predicate injected; not collision correctness or CPU profiling |
| Existing IBD game tests | Accepted actions, inactive/hidden/paused rejection, cancellation and re-entry semantics pass | Domain tests, not physical contact or visual acceptance |

Source review at the base confirms:

- `WorldIntentCoaster`: the train returns immediately when inactive; device/sign/collision children mount only while active. The two structure variants are intentionally retained as bounded CPU data; switching releases the previous GPU buffers. Unmount aborts pending generation and disposes cached geometry. First structure generation is still synchronous; this round does not establish its cost or change the coaster line's files.
- `WorldIbdMechanisms`: no pending action means the before-physics callback returns immediately. While inactive with a pending action, it reissues the held kinematic pose without advancing safety checks or elapsed time. That safety hold is not removed. `WorldIbdYard` and mechanisms own their material/geometry cleanup.
- Far scenery is intentionally retained. Coaster vegetation still checks view changes at a bounded cadence and returns when the matrix is unchanged; this is not equivalent to zero far-scene callbacks or zero far-scene render cost. No blanket unmount or distance-based hiding was introduced.
- Pause/hidden behavior and final React scene teardown still require the coordinator's real browser window. These short tests do not prove full-scene GPU cleanup, long-duration heap stability, energy savings or ordinary-play frame-time percentiles.

## Implemented fix: frozen shot only

Before this change, `shot` disabled physics, camera control, train progression and the world clock, but Canvas continued rendering in `always` mode. `WorldRuntime` now selects demand rendering for these fixed views. This savings applies to `shot`, **not normal play**.

Each requested shot update receives a finite 90-frame settling burst. This preserves the three shadow scans needed for newly discovered casters (30-frame cadence, then two unchanged scans), plus the vegetation visibility update. Existing finite NightClock/weather invalidation can extend settling. Late asset invalidation and camera/quality/resize edits can start a fresh burst; no timer, worker or background polling was added. The frozen camera is applied in a layout effect before rendering. Shot frames are excluded from gameplay frame-time sampling.

The installed R3F loop was exercised with deterministic RAF and a render counter:

- Legacy visible/unpaused fixed-view policy: 3,600 render calls in 60 simulated seconds.
- New fixed-view policy: 90 settling renders, then zero recurring calls; a further 60 simulated seconds stays asleep.
- Ordinary play still produces all 600 scheduled renders in a 10-second sample. Pause, finite menu edits, hidden/restore and root removal pass separately.
- Synthetic 120-frame climate/weather work remains finite and settles after 180 total shot renders. This models invalidation behavior; it does not execute the full scene or certify its appearance.

## Verification performed

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/performance-render-policy.test.mjs \
  src/components/world/performance-resource-regression.test.mjs \
  src/components/world/attractions/coaster-structure-cache.test.mjs \
  src/components/world/attractions/ibd-yard-game.test.mjs
```

21 tests passed, 0 failed; reported total duration 1,384 ms. The new tests create no browser, WebGL context, real worker or full coaster geometry. TypeScript syntax transpilation passed for the two changed production files. `git diff --check` passed. Full type checking/build were not run.

Resource preflight: memory pressure 2, swap 10.63 GiB, available disk 1.45 GiB. No installation, asset download, browser, Blender, build or subagent was started. The old sparse checkout omitted recent text sources; only `src/components/world/` and the existing TS test loader were expanded. Shared node_modules was retained. The missing local AGENTS was read from the current integration tree, then became available in this worktree; the reference contract was read without opening image viewers.

## Coordinator verification window / remaining boundary

Use an isolated temporary preview when the shared heavy window is available, leaving 4341 unchanged. Verify ordinary walking, an active IBD task and a coaster ride still run; pause/hidden intervals stop render and simulation progression; return does not replay elapsed time. Separately verify fixed IBD/coaster shots, a late-loaded asset, camera switch, daytime/nighttime, weather, quality and viewport changes settle with correct vegetation/shadows. Compare full-scene resources over a small number of exits/unmounts. Browser visual acceptance, runtime resource counts and normal-play FPS remain pending.

No cross-line code edit is requested in this round. Audio remains with the music session. If ordinary-play profiling later identifies first-load structure generation or far vegetation as material costs, request a narrow interface from the coaster owner rather than widening this patch.
