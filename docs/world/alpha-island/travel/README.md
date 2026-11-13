# Alpha batch 1 transport candidate

Core 98cd8fb requires scene-owned alpha-layout.ts (r2 hash abb8dd778cb17c8711b61e2127a50763424276b77c428ee1243602578b042344); it does not independently build on bare 6205018. This file is read-only and excluded from travel commits.

Base 6205018, branch codex/alpha-batch1-travel-20261113. Interface first publication: shared evidence/status-20261112/planning/coordination/travel-interface.md.

Mount `AlphaTransports({routes,groundHeight})` inside Physics, in WORLD coordinates (do not wrap in Alpha origin). `groundHeight` accepts scene LOCAL x/z. Mount `AlphaTransportHud` alongside world HUD. `ALPHA_TRANSPORT_ROUTES` adapts the scene-owned alpha-layout.ts to cable/sled. Ferry stays explicit `alphaFerryRoute()` until its provisional shoreline survey is resolved.

Frame contract is in rides/ride-contract.ts. Coaster remains on its original transition clock; generic actor consumers use attractionActorFrame()/captureAttractionStart()/attractionPhase(). Ground samplers use serializable groundId keys. No coaster rail, timing or phase changes.

Datums: cable scene path=floor; sled scene path=runner, floor=runner+.16m. Seat patch=floor+.48m for all three; sled runners sit .16m below its root datum. Model +X forward, +Y up; adapters derive tangent, never reuse +Z socket yaw directly. Player capsule stays disabled during scripted paths; exact endpoint is validated by findSafePlayerLanding before restoring physics. Empty sled tow is visible on the actual route.

E/ride HUD requests safe egress; Esc retains global pause. Cable/ferry reverse to boarding terminal, sled completes descent. Camp reset immediately releases driver/weather/hand; camera/input use existing actor recovery. Temporary weather never writes world preference, suspends during pause/hidden and yields permanently after preference edits.

`guideActionHand` supports target/facing/mode and measured palm without camp zone coupling. Scene supplies owner and cancel callback; actor releases it on pause, hidden, blur, return, vehicle, seat, card or ride. Local wind data is a frame bridge; scene owns its strength and world envelope.

Sources: tools/world/alpha-island/transports/build-transports.py, named editable .blend per family; runtime GLBs under public/assets/world/alpha-island/transports. Native meters, game +X bow / native +X, native Z up. Generation performs evaluated export and fresh GLB bounds comparison; counts/report in export-report.json. No external textures. Runtime clones material ownership only, borrows cached geometry, and uses the established shared furniture environment with day/night intensity. The native file alone is not evidence of visual quality or runtime contact.

Tests: project loader `node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/rides/transport-driver.test.mjs src/components/world/attractions/coaster-transition.test.mjs src/components/world/attractions/attraction-camera.test.mjs`. Ordinary entrance/browser evidence is separate from fixture/numeric evidence. All-island, Safari/M3, visual acceptance and deployment remain unclaimed until explicitly recorded.
