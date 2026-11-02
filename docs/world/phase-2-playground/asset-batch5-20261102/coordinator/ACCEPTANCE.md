# Batch 5 coordinator acceptance

This batch contains eight street facility families, five camp props and one G17 tree family. Ground-shoulder refinement is isolated and excluded from the fourteen-item candidate.

The coordinator personally compared the G17 and ground day/night web captures. G17 R3 is visually accepted at the sampled scale; ground R4 was returned for its hard carpet-like path boundary. See `NATURE-R4-REVIEW.md`. This is not permission to propagate the tree to every species.

The independent facility reviewer examined forty web images and accepted eleven of thirteen facility families. The coordinator inspected the two reported defects in the original web images and agreed with the findings: C13's bright, raised grip lines read as wrapped wire, and C15 needs credible wheel contact. See `FACILITIES-REVIEW.md`. The measured C15 resting wheel gap is approximately 3.58 mm above the 4.9 m paving surface; the narrow correction is to remove its candidate-only 4 mm spawn clearance, preserving legacy mode and other props.

## Runtime cost correction

Commit `3aea470` replaces per-frame material-tree traversal with attachment/removal registration, caches the guitar strings, and writes fading/night material parameters only when their values change. It preserves asynchronous craft/fallback replacement and original transparency. Five proven closed brass/paper primitives use FrontSide; the remaining twenty-six keep their exported sidedness. Guitar strings, lamp glass and wick stop casting shadows. Geometry, textures and source materials remain borrowed and unchanged.

The coordinator reviewed the implementation and ran fifteen targeted camp/street tests: fifteen passed. The tests include asynchronous subtree replacement, fade/reset material state, lifecycle cleanup, actual GLB topology, collision proxies, seat datums and street geometry. They do not establish a frame-rate improvement or visual acceptance of the runtime correction.

## Pending before preview promotion

- C13/C15 corrected day/night images and low-angle wheel contact, including a bounded physical displacement/reset check.
- Final source/asset identity, normal browser behavior, and an unobstructed shelter sitting/standing observation.
- One bounded camp/street old-new-old performance sequence on the final frozen package, independently interpreted by the performance session. Stop on invalid samples rather than selecting favorable windows.
- Preserve the shared integration tree's existing roadblock/roof coplanar-surface fixes and its unrelated terrain changes.

4341 remains on the accepted batch-four package until the final candidate has been reviewed. No public deployment is part of this handoff. Execution and performance sessions report back to the coordinator automatically, as requested by the user.
