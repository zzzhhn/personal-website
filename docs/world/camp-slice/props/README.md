> Integration update (2026-10-21): Fable has reviewed and passed all 16 final assets, including the final Draco GLB colour views. Group-local runtime/unreviewed statements below describe the production handoff; current integrated results are recorded in [the camp slice report](../README.md). Bobby has not accepted the sample yet.

# Camp L1 props: C07–C10 (props group)

2026-10-21, generator `props-r3`, Blender 4.2.23 LTS. Three rounds were used (round 3 was the last allowed). Machine checks passed. **Art acceptance (Fable), runtime materials, dusk/night lighting and the user's sign-off have not been done.**

## Outputs

| ID | GLB (Draco) | Actual GLB x×y×z m | Target | Triangles native / GLB reimport (r1) | Bytes |
| --- | --- | --- | --- | --- | --- |
| C07 desk + stool | `public/assets/world/camp/C07.glb` | 1.296×0.852×2.000 | 1.3×0.85×2.0 | 828 / 828 (828) | 15,912 |
| C08 book stack | `public/assets/world/camp/C08.glb` | 0.431×0.321×0.687 | 0.5×0.35×0.7 | 364 / 364 (364) | 10,584 |
| C09 trophy shelf | `public/assets/world/camp/C09.glb` | 0.585×1.683×1.770 | 0.65×1.7×1.8 | 1,832 / 1,832 (1,784) | 32,404 |
| C10 flagpole + 4 flags | `public/assets/world/camp/C10.glb` | 1.000×3.205×1.498 | 1.2×3.2×1.8 | 1,236 / 1,236 (1,204) | 23,844 |

All four together: 4,260 triangles. No earlier production asset exists, so the only baseline is r1 of this run (final is 1.00–1.03× r1). The declared budgets are in `manifest.json`. C09 is the largest because of its four lathed trophies (1,408 triangles), which are needed for a distinct cup silhouette.

- Native sources: `tools/world/camp/props/blend/C07.blend` … `C10.blend`.
- Scripts: `tools/world/camp/props/build_props.py` builds and exports. `qa_props.py` runs QA on the reopened .blend against a fresh import of the final Draco GLB. `render_views.py` renders six views from the fresh GLB import, and `compose_sheets.py` assembles the sheets with Pillow. `qa_connectivity.py` is a vendored copy of the skill inspector, so this group has no external helper dependency.
- Reproduce: `Blender -b --factory-startup -P tools/world/camp/props/build_props.py -- .` then run `qa_props.py -- . <report.json>`, then `render_views.py -- . <dir>` + `python3 compose_sheets.py <dir> <suffix>`.
- Evidence: `manifest.json`, `qa_final.json`, contact sheets `r3/<ID>_sixview_r3.png` (final), with `r1/` and `r2/` kept for history. The `rX/_tiles/` folders are intermediate per-view PNGs (~13 MB per round). The sandbox blocked deletion, so the main session can remove them before committing.

## Runtime interface

- Axes: metres, +Y up, +X front/use side, ground contact y=0, root node `<ID>` at the XZ bounds centre. Each GLB has one scene root and no cameras, lights, textures, animations, transmission or alpha blending.
- Draco: `KHR_draco_mesh_compression` is required on every primitive. Settings are 20-bit positions, 12-bit normals, level 6. Bounds error between the native file and the fresh-imported final GLB is ≤6.5e-7 m (C07), 3e-8 (C08), 6e-8 (C09) and 0 (C10). Triangle counts are identical.
- C07: desk-top height **0.85 m**. Usable top rectangle in GLB-local coordinates: x ∈ [-0.618, 0.122], z ∈ [-0.97, 0.97], y = 0.85 (root extras `deskTopRectGLB`). `C07_stool` is a separate node inside the 1.3 m footprint, with a 0.62 m seat. Hide it if the runtime does not want it.
- C08: origin at the bottom centre of the stack, so it can be dropped directly at y = 0.85 on the C07 rectangle. Spines and covers are blank, with no text.
- C09: dark-wood back panel so the brass-coloured cups read against it. Brass is matte (metallic 0.40, roughness 0.55). Plaques are blank.
- C10: `C10_pole` is static. `flag_01`..`flag_04` are independent nodes. Each node's origin is the top clip on the pole axis (GLB x=0, z=0.249 relative to root; heights y = 2.96 / 2.51 / 2.06 / 1.61). The cloth extends along local −Z (glTF), so rotate about local +Y for a gentle sway. Node extras carry `hoistTopLocalGLB`, `hoistBottomLocalGLB`, `flyDirectionGLB`, `lengthM` and `hoistHeightM`. A small baked ripple is in the mesh. Two iron clip rings per flag are part of the static pole.

## Materials (materialRole in material extras)

wood `#B99469` / `#8E6E55` / `#5A4634` (roughness 0.72–0.80); paper `#E6DCCB`; accent book covers in camp orange / slate blue / olive / brick; canvas flags in orange / cream / slate / olive `#8AA24A` (roughness 0.9); metal = matte brass `#B8975A` and iron `#5E5B57`. Values are converted sRGB→linear before being written to the BSDF. All materials are opaque and none emit light.

## Machine QA (final, `qa_final.json`)

This covers native files reopened from disk and fresh imports of the final compressed GLBs. Triangle counts match. Min y = 0 and the XZ bounds are centred. Material names match, and every GLB material has a role. Every native shell is closed (0 boundary, non-manifold or inconsistent-winding edges, 0 negative-volume components). There are no zero-area or duplicate triangles, `Mesh.validate` would make no repairs, and all coordinates are finite. Flag nodes exist and their pivots sit on the pole axis.

Components are separate on purpose. They are assembled furniture parts (boards, legs, rails, stool, trophies, books, pole/feet/braces/clips), joined by overlap or burial, **not welded**. Desk legs are buried 1 cm into the top, stretchers sit between the legs, and braces run into the pole and feet. Books are sunk 1 mm into the book below to avoid coplanar contact. Each flag is one closed slab touching its clip rings at the hoist.

## Changes made after looking at the renders

- r1 → r2: desk legs, rails and stool were too spindly for the toy-chunky reference, so I thickened all members. C09 read as a plain bookcase with tiny cups. I lowered the carcass to 1.16 m and cut it to two compartment rows, put a large two-handled cup, a goblet and a blank plaque on top for a trophy skyline, and enlarged the cups inside. The flag base was too thin, so I made the feet and braces heavier. Flag rims had 28–32 zero-area triangles from `solidify`, so I rebuilt them as explicit two-sided slabs. Some books were inside-out (negative volume), so I now orient each shell by signed volume. I also fixed the QA flag-pivot axis check. Draco was added per the addendum.
- r2 → r3: the bottom shelf was coplanar with the back panel, which showed as a light strip in the back view. I moved the back panel 4 mm proud and set the shelf in. The stool seat was raised from 0.55 to 0.62 m to suit the 0.85 m top.

## Not verified / open

- No dusk/night runtime views, no in-scene scale check against the stone slabs or camera, and no runtime flag-sway test. The main session owns all three.
- Self-intersection between overlapping parts was only reviewed visually (the generalized-winding probe was not run). Overlaps are deliberate joints.
- Seen in the r3 sheets and left as is: the desk top is plain with no lamp (C16 is out of scope); the side view of C09 is a featureless panel; the flag ripple is subtle at the default camera. C09's dark back panel may read very dark at night.
- Text on books, plaques and flags is intentionally absent. The checklist note "书脊文字独立生成双语" was not done here.
- The contract mentions 18–20 bit positions; I used 20. With three.js decoding Draco locally, the runtime must register `DRACOLoader`, or these GLBs will not load.
