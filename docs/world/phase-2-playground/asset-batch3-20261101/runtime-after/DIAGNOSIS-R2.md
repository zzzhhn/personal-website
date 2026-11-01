# R2 bounded source diagnosis

Read-only review of the three new visual adapters, their shared environment, and renderer/shadow accounting. No extra runtime window, build, or source patch was performed for this diagnosis. Current working Camp adapter already contains the author's R3 change; R2 material flags were checked against its frozen GLB.

## Concrete avoidable cost

The R2 frozen Camp GLB contains seven materials, all seven `doubleSided: true`. The Camp author confirmed 109 closed components and owns the R3 material-copy `FrontSide` correction. This removes unnecessary back-face rasterization while retaining source textures and the existing IBL. Three's extra back/front draw path applies specifically when `transparent === true`, `side === DoubleSide`, and `forceSinglePass === false`; seven double-sided materials alone do not establish fourteen draws or a measured GPU-time saving.

## Assembly and lifetime review

- Club selects merged legacy furniture or the new furniture component. Camp/IBD wrappers likewise select fulfilled candidate or fallback. No obvious simultaneous fulfilled old/new rendering was found. Club's separation changes batching and culling scope, so cross-view draw deltas cannot be assigned solely to one asset.
- GLTF loading is shared by URL. Factories use memoized construction; frame hooks update scalar night/visibility state rather than rebuilding the visual. Camp/Club instancing is per primitive with placement matrices prepared once. IBD clones and merges geometry during construction, disposes intermediate clones, and releases owned merged geometry/materials on cleanup.
- The furniture environment is cached in a renderer-keyed WeakMap with reference counts and deferred disposal. Camp families reuse it. No per-placement PMREM, additional private reflection target, or obvious unbounded per-frame assembly was found in this bounded review. The initial environment-null to texture dependency can cause one factory refresh; it is not evidence of repeated allocation.

## Fixed-camera counters can still change

The debug counters read `gl.info`: renderer draw calls, triangles, and allocated geometry counts. Three resets render statistics before shadow rendering, so the resulting calls/triangles include shadow passes and are not an asset-mesh inventory. `render.frame` counts renderer invocations, not a GPU timing query.

The shadow system advances queued chunk work with a 32-unit / soft 3 ms slice, then publishes merged proxy geometry. Publication, allocations, and validation include indivisible operations. Proxy replacement and near/far selection can change geometry and draw counts at a fixed camera. This supplies a plausible transition mechanism, but R2 did not record shadow-job phases or occlusion state, so it does not prove the source of either IBD counter transition or its 94.4 ms frame.

R2 IBD candidate contained 35 frames at 210 calls / 806,928 triangles and 265 at 142 / 823,458. Legacy contained 200 at 200 / 1,109,808 and 100 at 192 / 695,756. Ninety warm-up frames did not establish a fully settled whole-scene state. Do not discard these as random noise, or claim a single-asset cause.

## Delivery judgment

The Camp back-face issue is concrete and already assigned to the author for R3. Apart from that correction, this bounded review found no further clear delivery-blocking repeated assembly or private-environment bug. It is not an exhaustive leak or GPU audit. Keep the R2 measured 54.7–57.3 FPS and p95 22.5–28.5 ms as limited scene-window evidence; do not claim zero overhead, guaranteed 60 FPS, or whole-island acceptance. The authorized R3 Camp check adds a ten-second settling interval and remains a single non-randomized window, not a causal R2/R3 experiment.
