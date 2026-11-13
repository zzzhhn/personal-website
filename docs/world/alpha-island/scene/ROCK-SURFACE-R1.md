# Alpha exposed-rock material sample R1

2026-11-14. Source baseline: `7a476c43d9179a494d80771bcbfed3495f8a28cd`.

The integrated `visual-baseline-465ceee/tree-day.png` shows smooth bluegrey terrain and regular horizontal bands. The scene `references/day.png` calls for warm/cool rock units and interrupted erosion. This is one bounded material candidate for that difference; geometry and the smooth mountain silhouette remain unchanged.

## Surface construction

| Scale | Treatment |
| --- | --- |
| 11–18 m | Neutral grey / warm mineral parent masses in metric 3D coordinates |
| 2–4 m | Weathered blocks and gravity-biased crosscut joints |
| About 5.3 m | Tilted, warped bed boundaries interrupted by block coverage |
| Finish | Matte dielectric response, roughness .86–1, small derivative relief faded at distance |

The shader replaces the former height sine bands. Rock coverage uses terrain slope, existing path/snow weights, and elevation: low sand, full path/snow weights, and upward grass surfaces receive no rock replacement; transition pixels blend. The existing grass/dirt maps and their sampling remain. Night bounce and boarding clipping remain in their existing code paths.

## Resource and runtime path

Reviewed the mature `WorldTerrain.tsx` and `coaster-landscape-finish.ts` treatments and the material-craft skill. Existing town stone maps are original fine-pore procedural stone; club bar limestone is authored honed interior stone. Neither is a suitable exposed natural-cliff PBR source. This candidate therefore uses authored procedural fields, adds no downloaded asset or dependency, and creates no new asset licensing obligation. Existing terrain CC0 asset provenance remains in `public/assets/world/terrain/SOURCES.json`; bar limestone is not claimed as CC0.

`AlphaTerrain.tsx` supplies the actual merged terrain chunks, vertex palette, normals and `alphaGround` weights to `alphaMaterial('ground', textures)`. The adapter modifies that actual MeshStandardMaterial via `onBeforeCompile`. No unused preview mesh or disconnected export is involved. Only `alpha-materials.ts` changes at runtime; AlphaScenery, layout, terrain height, colliders, tree, vegetation, routes, rides, interactions and lights are untouched.

## Fragment cost accounting

- Three new non-FBM 3D value-noise calls, each with eight arithmetic hashes: 24 arithmetic hash evaluations. No loop, extra noise octave, texture branch, or trigonometry in these new functions.
- Removed three old 3D value-noise calls (24 sine-hash evaluations) and one bedding sine evaluation. The total explicit value-noise calls in the generated ground fragment remain five: two existing sine-hash calls plus three new arithmetic-hash calls, previously five sine-hash calls.
- Existing texture2D call sites remain four. Added two `fwidth` sites (four total, previously two); derivative bump reuses the existing normal-perturbation path.
- No extra texture, sampler, draw, vertex, light, per-frame JS allocation or callback. Ground keeps one material variant with a new cache-key suffix. These counts do not establish faster GPU execution or shorter compilation.

## Verification and handoff

Light esbuild TS/Node bundling and actual onBeforeCompile string generation passed. All 15 non-ground finishes have byte-identical generated vertex/fragment shader strings and cache keys compared with the source baseline. Ground vertex shader and uniform-name set remain identical. Counts and scope are recorded in `evidence/rock-surface-r1-source-check.json`.

This is source verification only. No browser, Blender, full build, GPU shader compilation, visual acceptance or performance test was run for this candidate. Main integration owns same-camera day/night inspection and WebKit compilation/frame checks. Material shading cannot add eroded silhouette or geometric cliff joints; any such work would be separate scope.
