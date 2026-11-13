# Alpha batch1 scene candidate

Isolated clone `/Users/bobby/Desktop/3D-personal-world/wt/alpha-batch1-scene`, branch `codex/alpha-batch1-scene-20261113`. Start `npm run dev -- --host 127.0.0.1 --port 4351`, then `/world?layout=v4`. QA/capture URL adds `&qa=1`; normal product entry has no capture controls. Existing4341/main/exchange are untouched. No push, deployment, merge or visual acceptance is claimed.

Scene owns island terrain/path/decks, lodge/bell/sand/card, grammar tree, wind flags/gate props, summit cairns/clouds/paper lantern, vegetation/rocks and local material/light integration. Traffic owns `transports/`, all ride protocol/actor/camera/weather integration and ferry runtime. Main owns final integration, art judgment and target-machine acceptance.

## Source and review entry points

- `src/components/world/alpha-island/alpha-layout.ts`: unique local/world coordinates and currentr6 basin/socket/path data. Mainland/ferry exports explicitly use WORLD coordinates; vehicle seats remain traffic-owned.
- `alpha-terrain.ts` + `AlphaTerrain.tsx`: shared1.5m terrain render/collider data and surface shading.
- `alpha-nature.ts` + `AlphaNature.tsx`, `alpha-rocks.ts`, `AlphaScenery.tsx`: actual editable procedural geometry consumed by renderer and colliders. TS is the authoring path; there is no unused Blender/GLB artifact offered as native-source proof.
- `AlphaInteractions.tsx`, `alpha-state.ts`: normalE actions driven by real shared palm contact; .06m for>.16s, bounded12-lantern pool,34s lifetime, cancellation ownership and persistent visit/card/cairn state.
- `AlphaLocalLights.tsx`: exactly two bounded no-shadow night point slots, mounted in WorldRuntime before main suspense; no slot allocation on paper-lantern release.
- `WORKING-REVIEW.md`: failed/successful evidence chronology and limits. Original supplied day and derived night references have manifest provenance and do not count as runtime acceptance.

Source scene revisions: `eda184c` broad terrain/material/nature repair, `f750f56`r6 basin/strict contact, `6901034` reachable rack/cairn, `104e9ba` paired camera fixture, `0c3e657` read-only transport capture, `8146a69` frozen evidence and browser harness. Later traffic integration has separate source attribution.

## Verification

`node tools/world/alpha-island/verify-scene.mjs` runs6 terrain/route/terminal/berth,3 dynamic Rapier capsule traversal/jump and2 hand/pool lifecycle tests. Latest stored run `evidence/source-checks-r6b.log`:11 pass. Capsule center-ray gaps are not continuous G24 boot contact proof.

`ALPHA_CONTACT_KINDS=stone,lantern node tools/world/alpha-island/capture-contacts.mjs` performs normal keyboardE with real G24 hand solver after QA placement, preserving runtime-source/GLB before/after hashes and actual response-body hashes. Each action records3.5seconds. `evidence/0c3e657-contacts/manifest.json`: stone increments, lantern carried then E releases an actual instance, ownership clears; no captured errors/source/resource drift. Earlier c5dc3f8/2832a04 failures remain archived.

`node tools/world/alpha-island/capture-views.mjs` places the actor on actual terrain then obtains a normal near-camera pose and freezes that directly read pose only for paired noon/midnight. `evidence/0c3e657-views/` has4 camera-identical pairs, no source/resource drift/errors. Light count22 throughout; mountain programs187→188 at first night, later pairs unchanged. This is not cold/warm FPS, original cab-camera comparison, Safari or M3 proof. `ALPHA_BROWSER=webkit` selects Playwright WebKit; its results must be recorded separately and must not be called actual Safari.

## Outstanding integration acceptance

Traffic's full sled/cable/ferry transitions, dynamic obstruction/menu/return matrix and source-aligned type/build freeze are independently coordinated. Ferry is intentionally unmounted from normal scene entry until both-end traversal acceptance. Source BVH clearances across sampled hull poses do not establish a completed runtime crossing.

Target-machine performance, actual Safari/M3, full normal walking/gait/contact/lifecycle matrix, original-cab matched framing, and final visual/user acceptance remain unclaimed. Existing final screenshots are concrete review candidates, not approval. Avoid starting another3D browser/build while another Alpha chat owns the serialized resource window.
