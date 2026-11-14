# WorldOcclusion fade-material cache: delivered
Patch: /tmp/world-occlusion-cache.patch (only src/components/world/WorldOcclusion.ts; `git apply --check` is clean on world-performance; NOT applied, src untouched)
Patched file: /tmp/occl/WorldOcclusion.ts. Original snapshot: /tmp/occl/WorldOcclusion.orig.ts
Tests: /tmp/occl/occlusion-cache.test.mjs (copy at /tmp/world-occlusion-cache.test.mjs; it uses /tmp/occl/store-stub.mjs and the node_modules symlink)
Run: cd /tmp/occl && node --test occlusion-cache.test.mjs                      -> 8 pass / 0 fail
     OCCLUSION_MODULE=./WorldOcclusion.orig.ts node --test occlusion-cache.test.mjs -> 1 pass / 7 fail (old code fails the cache/lifecycle assertions as expected)
tsc --strict on the patched file (with a store stub): exit 0. No browser/build/GL run.

Behavior: one corridor variant per mesh. When inactive the mesh gets the original source material back and the copies are NOT disposed. On re-entry the same copy (same program cache key) is reused and the source's current properties are re-copied (copy() plus kept uniform objects; source.version change -> copy.needsUpdate). amount restarts at 0. Visuals, raycasts, amount curve, exclusions and shader text are unchanged; customProgramCacheKey now reads the original key live.
Release (dispose, restoring the source only if our copy is still on the mesh, so external replacements are never overwritten):
- material swap / in-place edit of either the mesh array or the source array (member snapshot), or a geometry change; checked when hit, every frame while applied, and in the 0.5 s prune
- mesh detached from the scene, idle > 90 s, more than 128 inactive entries (oldest first), and dispose()
debug().cache = {entries, created, reused, released} for A/B evidence.
Not verified: real GL program reuse/link counts in the browser (main thread's A/B), and memory of up to 128 idle copies.
