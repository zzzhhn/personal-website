# Alpha pilot integration and verification

This is the first playable Alpha factor-mine pilot, integrated on `codex/world-alpha-pilot` for the existing `codex/world-greybox` PR and local 4341 playtest. It does not complete Phase 2 or establish final visual acceptance.

## Delivered experience

- A separate 32 × 36 m coastal quarry on an independent foundation, connected to the former Alpha boardwalk opening. The other five project huts keep their content and interactions. Alpha Agent and WorldQuant retain separate project and experience cards.
- Three connected levels, detector and pickaxe, three physical strikes per seam, three distinct ore identities, one carried ore, reachable temporary shelves, two replaceable result displays and three recovery shelves. The physical inventory and displayed comparisons are independent.
- The character uses the shipped asset grip/contact nodes and reversible authored IK poses. The gameplay clock waits for the rendered contact pose; a failed reach asks the player to move closer instead of granting a hit. This is authored interaction animation, not newly licensed motion capture.
- The pool replays actual precomputed historical results from the existing Alpha Agent Python kernel. The JSON stays in ignored `local/alpha-pilot/`, served by loopback-only development middleware. No result history or raw price data is committed or copied into public builds. Without the local file, the player can still mine, carry, recover and compare ore identities; the UI clearly says results are unavailable. There is no fabricated curve fallback.
- Effects share the existing physics/render clocks and finite audio owner. No new UI polling timer or audio context was introduced. Character and quarry assets share a decoder capped at two workers.

## Root verification

Final composed regression: **92 passed, 0 failed, 0 skipped**, including real G24 and shipped tool sockets, sanitized GLTF bone names, contact timing at 30 Hz render / 60 Hz physics, all-floor support and capsule clearance, shelf reach/line of sight, state transitions, interaction unregistration, audio/UI lifecycle, existing ground and driving behavior.

Final Astro check: **290 files, 0 errors**. The static build produced both pages successfully; the build contains neither the local result file nor its actual result hash.

Actual Chrome playthrough on the isolated candidate used ordinary keyboard input, with read-only visible QA diagnostics:

- Entrance tool pickup; lower, middle and upper seam scan, three accepted strikes, and pickup on each level.
- Both ascending ramps and the crossing bridge traversed. Middle ore carried down the west ramp. Upper ore also remained held after walking off the lower east-platform edge and landing; this is not recorded as a full stair-free return-route acceptance.
- Lower ore set down and picked up again. A/B casting showed two distinct historical records. The third ore replaced B without erasing A. Pool recovery pickup retained the displayed comparisons; the recovered ore could be set on a shelf.
- Temporarily removing the ignored local result file showed an unavailable state while preserving ore and display selections. Restoring it and clicking retry restored the real results. The exact file was restored afterwards.
- The loopback HTTP response matched the ignored local file; a foreign Origin was rejected. Pause/resume preserved progress. Alpha Agent and WorldQuant cards opened separately and closed back to the same carried-ore state.

No historical video was downloaded or new video recorded. Screenshots containing actual financial results remain private local evidence, outside Git. The browser work found and fixed issues that CPU-only checks had missed: GLTF bone-name sanitization, the render/effect-cleanup gap in conditional interaction registration, shared-worktree Vite access, and exact damaged-vein contact placement.

## Art review and limits

The native visual reference, PRD and production plan are committed with the assets. Three art passes replaced the initial banded walls and checkerboard ground with broken rock surfaces, irregular heights and restrained material grain. The final GLBs, source scenes, export manifests and prop board were reviewed. A first-pass ledge clearance failure was retained and corrected by moving the supported ore toward the ledge front.

The quarry remains intentionally stylized. Its stepped side-wall silhouette and the expressive quality of the authored character gestures still merit refinement after Bobby's playtest. Ore recovery appears on the pool tray without a fully animated return mechanism. No claim is made that this is GTA-quality animation, final art approval, Safari/mobile acceptance, or a long-duration CPU/GPU/energy benchmark. Existing motion, vehicle and broad performance limitations remain tracked in the Phase 2 records.

Public display permission for the historical result pack is still unresolved. This does not block local play or source/asset integration.
