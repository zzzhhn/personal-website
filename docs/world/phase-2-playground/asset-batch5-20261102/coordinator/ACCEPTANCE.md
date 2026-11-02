# Batch 5 coordinator acceptance

This batch contains eight street facility families, five camp props and one G17 tree family. Ground-shoulder refinement is isolated and excluded from the fourteen-item candidate.

The coordinator personally compared the G17 and ground day/night web captures. G17 R3 is visually accepted at the sampled scale; ground R4 was returned for its hard carpet-like path boundary. See `NATURE-R4-REVIEW.md`. This is not permission to propagate the tree to every species.

The independent facility reviewer examined forty web images and accepted eleven of thirteen facility families. The coordinator inspected the two reported defects in the original web images and agreed with the findings: C13's bright, raised grip lines read as wrapped wire, and C15 needs credible wheel contact. See `FACILITIES-REVIEW.md`. The measured C15 resting wheel gap is approximately 3.58 mm above the 4.9 m paving surface; the narrow correction is to remove its candidate-only 4 mm spawn clearance, preserving legacy mode and other props.

## Runtime cost correction

Commit `3aea470` replaces per-frame material-tree traversal with attachment/removal registration, caches the guitar strings, and writes fading/night material parameters only when their values change. It preserves asynchronous craft/fallback replacement and original transparency. Five proven closed brass/paper primitives use FrontSide; the remaining twenty-six keep their exported sidedness. Guitar strings, lamp glass and wick stop casting shadows. Geometry, textures and source materials remain borrowed and unchanged.

The coordinator reviewed the implementation and ran fifteen targeted camp/street tests: fifteen passed. The tests include asynchronous subtree replacement, fade/reset material state, lifecycle cleanup, actual GLB topology, collision proxies, seat datums and street geometry. They do not establish a frame-rate improvement or visual acceptance of the runtime correction.

## Subsequent repair reviews

R7's revised C13 grip is accepted after primary daylight/night web review. C15's measured gap and real displacement/reset behavior were corrected, but its weak visual contact was returned once more. See `CAMP-R7-REVIEW.md`. Commit `ee1ea7b` adds four distance-dependent contact patches using the actual tire vertices and finite paving triangles: one draw, eight triangles, no texture/light/shadow pass. It hides when unsupported, raised, tipped or fading and does no support query or upload in a stable pose. The coordinator reviewed this change and reran the affected tests: 26 passed. Its final web appearance remains pending.

The isolated ground-shoulder daylight direction is now accepted in two actual web views, separately documented in `GROUND-SHOULDER-R1-REVIEW.md`. Night, disturbance and performance remain open. The ground change is still excluded from the fourteen-item package.

R6 was rejected because an old generated HTML page referenced a missing entry module. R7 was rebuilt from a public-resource-only overlay, and the coordinator's reusable entry-graph check verifies 25 reachable modules with no missing imports. Final revised packages must pass the same check. Receipt hash agreement alone is insufficient.

R8 passed the final entry/source identity check (60 files, 10 source files), but its three C15 web views were not accepted: the contact remained visually too weak. A bounded read-only GPU observation confirms the helper is actually rendered as one draw/eight triangles, all sixteen strengths are one, the program and both shaders compile, and the model transform is correct. All four wheel/support gaps are approximately -1.46 mm. This rules out missing rendering and geometric suspension for the observed defect. The existing patch ends before 1 cm outside the tire, with most of its darker area hidden by the wheel. The next correction extends the footprint 30 mm beyond each actual tire half-width, retains peak opacity 0.32, and uses radial^1.5 falloff. Raw diagnosis remains in the execution tree's `camp-contact-r8/runtime/r8-helper-diagnostic-1.json`; no performance sample has been taken.

Source review also reproduced an independent optional-shading limitation: if the paving is absent when C15 first registers, the helper stays hidden until another registration. That did not occur in R8. This round does not introduce persistent scene polling to work around it.

The bounded rim correction is committed as `db69721`; the coordinator reviewed its two production-line changes and ran all affected camp/contact/street tests: 28 passed. Actual four-wheel radii are approximately 58.53 by 44.00 mm. It adds no draw, texture, light or shadow pass. The coordinator personally opened R9's daylight, midnight and low daylight views and accepts the sampled contact appearance: the exposed rim is readable without an oversized dark disk. Camera/time/raw identities and image hashes are in `CAMP-R9-images.json`. No further visual-strength adjustment is requested. R9's 25-module entry graph also passes; its runtime is `WorldRuntime.D7NGFd4R.js`.

The coordinator has released R9's visual sampling hold. The execution session owns the remaining real interaction checks and the sole browser/heavy-work slot; the performance session owns independent identity and paired-window interpretation. Both report automatically. Performance and preview-promotion decisions remain open.

## Pending before preview promotion

- A bounded R9 physical check that moving, tipping, lifting and resetting leave no stale patches. C13 and C15 visual review and R7's geometric displacement/reset checks are already complete.
- Final source/asset identity, normal browser behavior, and an unobstructed shelter sitting/standing observation.
- One bounded camp/street old-new-old performance sequence on the final frozen package, independently interpreted by the performance session. Stop on invalid samples rather than selecting favorable windows.
- Preserve the shared integration tree's existing roadblock/roof coplanar-surface fixes and its unrelated terrain changes.

4341 remains on the accepted batch-four package until the final candidate has been reviewed. No public deployment is part of this handoff. Execution and performance sessions report back to the coordinator automatically, as requested by the user.
