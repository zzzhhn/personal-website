# Bounded long-frame review

This is an opt-in Astro review build, never imported by production. Use one browser tab and one heavy job at a time. Read the resource preflight before building or opening it.

Build with `CAMP_PERF_OUTPUT=/tmp/camp-longframes-20261107/candidate node_modules/.bin/astro build --config tools/world/camp-longframes-review/review.config.mjs`. For this change's old implementation, add `CAMP_PERF_REF=b495d7f`; it substitutes the three changed shadow modules only. Other scene files and assets must remain unchanged between builds. Use the existing task preview server with the delivered immutable asset fallback and symlink the current six camp/town/audio directories. Do not copy the entire public directory.

Use the visible controls to select a shot, wait for loading and shadow generation to settle, and collect a bounded 600-frame window. Save both start/end state and raw result JSON. Capture cold generation separately from steady state. Normal camp mode exercises physics and occlusion; fixed shots do not. Collapse the toolbar for matching screenshots. Finish paused and stop the temporary server.

The probes record frame callbacks, physics, renderer submission, shadow stages, buffer uploads, long tasks and optional nonblocking GPU timer queries. Nested CPU buckets overlap and must not be summed. GPU timing is every eighth outer render, with at most eight outstanding queries. There is no gl.finish or readPixels. A completed warm-up is not a steady-state result while shadow.pending remains true.

For the original lightweight 360-frame sampler, add `CAMP_PERF_SIMPLE=1`. This injects the existing CampFeedbackReview without function wrappers or GPU queries. Both modes support the same three-module baseline substitution. The legacy UI's `variant: after` describes camp surface assets, not the performance implementation; identify the implementation by the recorded build invocation and baseline override. Do not compare heavy and lightweight timings directly or select only the favorable mode. The November 7 results disagree, so the candidate has not been promoted to 4341.

Compare canvas dimensions, DPR, exposure, camera, world time, quality, draw/triangle counts, loaded resources, and memory pressure. System paging can dominate a maximum frame; report that uncertainty. Timing must not be improved by degrading artwork. The source regression tests compare exact shadow geometry against the old implementation; actual WebGL day/night and movement checks remain separate.
