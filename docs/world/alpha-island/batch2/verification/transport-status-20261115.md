# Transport candidate verification

Recorded 2026-11-15 01:08 CST. Candidate branch: `codex/world-alpha-batch2-20261115`, base `17674e82`. Changes remain uncommitted and are not promoted to 4341 or GitHub.

## Implementation and offline evidence

- `transport-driver.ts` connects the captured position to the nearest remaining surveyed boarding segment. A blocked joining leg searches forward on that same segment; it does not skip a corner.
- `WorldActors.tsx` installs the real capsule movement guard before capture, then validates the complete selected route before disabling the player's physics body.
- Walking completes a bounded turn before translating and visits every authored route corner. Pause, cancellation, blocked-route rollback and ferry foot contact remain covered.
- Worker reported 23/23 passing tests across `transport-boarding-motion.test.mjs`, `transport-driver.test.mjs`, `transport-structure.test.mjs` and `ferry-boarding.test.mjs`. Primary inspected the final implementation and tests. These include six route endpoints, side starts, real capsule obstacles, safe egress and actual boat/sled geometry.
- Production build passed at 00:50 CST; see `build.log`.
- Primary whole-project `tsc --noEmit --pretty false` exited 0 with no diagnostics at approximately 01:08 CST. `git diff --check` passed.
- No models, textures, materials, DPR, shadow settings or audio assets were changed by this transport repair.

## Ordinary Safari playthrough: partial

Native Safari, ordinary `http://127.0.0.1:4343/world/` entry with no QA parameters. High quality; noon, stopped world clock. Used normal keyboard movement and E interaction only.

Observed route: camp, road, mainland pier, ferry boarding, seating and departure, arrival at Alpha island, island-side walking out onto the gangway. Screenshots observed in the tool transcript show approach, seated travel and island-side walk-out. No complete motion recording was saved. Final walk-out completion was initially unobserved; the unlocked continuation below confirmed it.

The current native screenshot was 3420×2036 pixels, not the requested 1080p acceptance viewport. Do not label this as completed resolution-controlled or performance acceptance.

Safari testing stopped when the Mac locked; the tool explicitly required manual unlock. A user-input request is pending. Only one 3D test tab and one candidate server were used. Last resource check showed memory pressure level 2, swap 11.44 GiB and free disk 6.07 GiB; these are context, not proof of a rendering regression.

## Remaining gates

1. Exercise ferry return boarding, side approach and cancellation. Island-side egress and player control restoration have now been observed.
2. Complete ordinary-entry cable tests in both directions and sled tests from the upper boarding station through the lower exit, including corners, blocked paths and pause/resume. The sled lower station deliberately has no boarding interaction. Confirm motion visually rather than extrapolating from unit tests.
3. Capture controlled 1080p/DPR2 day/night comparisons and serial Safari/Chrome performance evidence. Current partial tour does not establish frame stability.
4. Batch-two style and layout were approved by the user on 2026-11-15. The reference manifest passed the implementation gate. Follow the user's order: transport play and performance acceptance before new-scene delegation.
5. Keep 4341 and both remote repositories unchanged until the applicable acceptance gates pass.

## Follow-up: physical joining coverage

The next goal turn rechecked Safari and received the same locked-Mac response. No unlock has been confirmed. Offline work continued by extending the existing physical fixtures rather than rerunning unchanged tests.

`transport-joining-fixture.mjs` now exercises six near-apron starts per terminal (two forward distances and three lateral offsets), with the actual movement guard installed before capture. It verifies full-path capsule clearance, no guard stalls during movement, heading aligned to each translated segment and arrival at the seat. The helper runs inside the existing cable collision fixture and the actual ferry/sled mesh fixtures, for 36 starts across six endpoints.

The two affected fixture suites passed: 10 tests, 0 failures, 0 skipped, 13.43 seconds. These are sampled geometric paths using the authored apron heights, not a proof of every reachable standing location or visual animation quality. No runtime code changed in this follow-up, so the existing build and TypeScript results still apply to the runtime candidate.

Command:

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/alpha-island/transports/transport-structure.test.mjs src/components/world/alpha-island/transports/ferry-boarding.test.mjs
```

Resource preflight during this follow-up reported memory pressure level 1, swap 11.56 GiB and free disk 6.10 GiB. The tests ran serially. No additional browser, image service or parallel build was started.

## Unlocked continuation and second interruption

After the user unlocked the Mac and approved the three-station reference, native Safari control resumed. Observed island-side ferry egress complete and free WASD movement restored. Walked from the dock past the lodge and tree, then along the bypass toward the wind station. The cable and sled were not ridden during this continuation.

The same ordinary entry, High quality, noon and stopped world clock were retained. Native captures remained 3420×2036 physical pixels, not a verified 1080p viewport. No frame-time acceptance numbers were collected. The Mac locked again near the wind-station approach; the UI-control tool explicitly reported that automatic unlock failed. A new unlock request was sent. The 4341 stable service and remote repositories remain unchanged.

Last resource preflight: memory pressure level 2, swap 10.57 GiB, free disk 6.16 GiB. No extra browser instance or parallel heavy job was opened.

## Performance evidence boundary

The existing `tools/world/alpha-island/integration/ride-performance.mjs` uses headless Chrome, DPR1 and QA teleportation. It is a diagnostic fixture, not this task's ordinary-entry Safari/Chrome DPR2 acceptance. In production ordinary entry, `WorldRuntime.tsx` does not expose `__worldDebug`; its passive frame sample additionally requires DEV and `qa=1`. Do not manufacture missing acceptance numbers from this fixture or relabel its conditions.

On unlock, complete the rides through ordinary E interactions, then use browser-native performance recording under an explicitly verified viewport and DPR. Keep High/material/shadow settings unchanged, record warm-up separately from steady riding and compare identical route segments and conditions. Safari and Chrome must run serially; pause the first scene before loading the second. Preserve the existing material-quality acceptance independently of frame-time results.
