# Workshop native craft handoff

This is a source-complete candidate for coordinator integration, based on `b75c474`. It has not been visually reviewed in the game or accepted for performance. The original production workshop component has not been replaced.

## Coverage

Native source includes intake conveyor and canopy, all six distinct stations, clarification bell, seven post/branch support assemblies, central carrier hub, request capsule, one instanced seven-position crank design and six independent moving-tool roots. [Construction map](CONSTRUCTION.md) records their fabrication and exact retained datums. The supplied approved carriage and six-lock chest ordinary-view images were inspected before modelling.

The source contains continuous rolled pedestal and worktop profiles, cast motor/roller cheeks, inset service assemblies, supported miniature seats, functional route/repair/paper/field/booking assemblies, hollow bronze bell and rail load paths. Geometry remains named and editable in `coaster-workshop-editable.blend`; the GLB is a separate material-batched derivative.

The native `ShadowWorkshop` parts use wire display to distinguish the derivative in the viewport. Exclude that root from any offline beauty render; the game adapter submits it only through the nonwriting shadow carrier.

## Integration

Use `WorldIntentWorkshopCraft` as an alternative to `WorldIntentWorkshop`, exclusively. It registers the same interaction IDs and calls the same state clock, so mounting both would duplicate registration and clock advancement. The coordinator owns the production/review selection; this delivery changes no review configuration.

The candidate uses the unchanged original geometry factory for visible glow and original contact triangles, and the unchanged collider/layout/runtime functions. All four authoritative source files compare byte-for-byte with `b75c474`. Interaction labels and registration, all six parent motion formulas, request parent path points and interpolation, lever pivots and x axis, persistent output visibility, pause handling, existing signs and the single existing point lamp are retained. Local asset geometry corrects the initial surface and penetration defects documented in [CONTACT-AUDIT.md](CONTACT-AUDIT.md). Request saddles add a visible 0.295m telescopic stroke without changing the parent route or state timing. No new real-time light, reflection capture, polling, state machine or physics surface is added.

Normals, UVs, physical PBR properties, roughness maps and clearcoat survive Three's GLTFLoader and adapter in a CPU audit. The adapter clones eight materials, borrows the existing renderer-scoped `useDjcFurnitureEnvironment` cache and source images, and uses the same bounded day/night material response as the chest. The cache is never disposed by this component. Its owned static shadow buffer and lever instance buffers are disposed after the final effect release.

## Actual export cost

| Export | Measured value |
| --- | ---: |
| Named editable visible parts | 545 |
| Independent shadow source parts | 127 |
| Static / moving / shadow roots | 11 |
| Unique exported triangles, including shadow | 64,272 |
| Visible source triangles | 61,948 |
| Material primitives, including shadow | 32 |
| Physical materials | 8 |
| GLB bytes | 2,935,220 |
| Embedded images | 3 × 256 × 256 roughness PNG |
| Static visible triangles | 54,860 |
| Idle visual batches / triangles | 11 / 57,436 |
| All outputs + request visible | 31 / 64,156 |
| Independent static shadow carrier | 1 batch / 2,324 triangles |

Visual counts exclude the unchanged glow mesh. The request carrier and moving tools are conditionally visible. Seven handles share three material instance batches. No meshes were simplified and no texture tier was reduced.

`ShadowWorkshop` is a separately authored static silhouette, with its own 127 editable parts. Closed lower cabinets correspond to the visible safety/service enclosures and the frozen solid physics. The upper rewrite/field machinery, overhead assembly and open debug loop keep their real open silhouette; no whole-station box fills them. The runtime merges this derivative once, adding **59,376 bytes** of position/index buffers and still submitting **2,324 triangles in the main pass** with color/depth writing disabled, plus its shadow views. It replaces the initial 57,220-triangle duplicate carrier. Lever instance buffers add 1,344 bytes. This reduction is not an established FPS improvement; no visible LOD, decimation, distance hide or texture tier reduction was introduced.

No LOD or distance-hide threshold has been introduced. The merged static model uses whole-workshop bounds for normal Three frustum culling. Handles retain the previous `frustumCulled=false` behavior. Near/far whole-scene behavior and source-cache residency require the coordinator's actual runtime measurements; draw-count arithmetic does not establish FPS.

## Verification completed

`verify.py` reads the actual binary GLB and verifies finite positions/normals/UVs, unit normals, indices, no zero-area triangles, exactly the expected material count per movement root, 256px embedded image dimensions, clearcoat export, no lights/cameras/animation, frozen source hashes and original behavioral formulas.

`verify-contact.py` uses actual evaluated native part bounds from `construction-bounds.json`. It checks the accessible top-plane heights, 31,590 exact piecewise-linear static AABB sweep intervals, all six processing/return routes at 801 samples per phase (9,612 poses) against 117 static fixtures, and 2,335,716 carrier/output part pairs. It additionally checks 146,529 pairs with 25/100/250ms child-motion clock lag, covering the old clock's accepted dt boundary. No positive-volume AABB conflicts remain in those checks. This is a bounded geometry audit, not a triangle-level Rapier actor or visual test. Central contact tops now match; old coarse cylinder facets and new smooth curved surfaces still differ by millimetres between vertices, as documented in the audit.

`verify-runtime.mjs` loads the actual GLB through Three, audits material and geometry preservation, measures idle/all-output submissions, applies 28 seven-handle pivot matrices across four angles, verifies unchanged cache hashes, and confirms disposal releases owned geometry without disposing borrowed source geometry. Texture samplers are CPU placeholders, so this does not inspect decoded texture appearance.

Both new TypeScript files pass TypeScript transpilation diagnostics. The original 10 workshop runtime tests pass with `--experimental-transform-types`, including all six requests, error return, pause, output persistence, clarification bell and sound timing. A plain `node --test` was initially unable to load an existing parameter-property dependency; the transform-types invocation resolves that test-runner requirement. Full integration typecheck/build belongs to the coordinator's serialized pass.

## Reproduce

Run from the repository root, with the coordinator's serialized heavy slot:

```sh
/usr/bin/python3 /Users/a22309/.local/bin/codex-resource-preflight.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python tools/world/coaster-workshop-craft-20261105/build.py
/usr/bin/python3 tools/world/coaster-workshop-craft-20261105/verify.py
/usr/bin/python3 tools/world/coaster-workshop-craft-20261105/verify-contact.py
node tools/world/coaster-workshop-craft-20261105/verify-runtime.mjs
node --experimental-transform-types --test src/components/world/attractions/intent-workshop-runtime.test.mjs
```

Builder uses Blender 5.1.2 and its bundled NumPy. Materials/maps are deterministic project-authored procedural work; no photographed-map claim or external license dependency. The first portable export exposed Blender's material-slot reset on `materials.clear()`; the exporter now reapplies saved polygon-slot indices, and verification requires the exact expected per-root primitive counts. Zero-radius contact caps now omit the disabled bevel modifier rather than attempting to apply it. Final GLB SHA-256: `268fdd33212257f73e1ecf19addfb3b2a865e686f25ac8ea52c1495678f4cce2`.

## Remaining gates

The coordinator must inspect every family in ordinary day/night views and its moving states, check actual contact relationships and signed text against the frozen baseline, then measure fresh-page near/far frame windows. No browser, native render, screenshot, GPU measurement or visual acceptance was produced in this agent's lane. Heavy work is complete and its slot has been released; no temporary server or viewer was opened.
