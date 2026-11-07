# C03 independent Scenario tool pilot

This is the first complete Sol-authored candidate, selected independently from the camp backlog. The coordinator supplied the existing task, frozen contracts, approved carriage example and updated craft skill. The coordinator has not repaired this geometry or its maps.

`first-complete-manifest.json` freezes the original native source, generator and GLB. Later runtime adapter edits are separate from that source. No screenshot here establishes WebGL visual acceptance or performance.

## Construction map

| Assembly | Construction and useful change | Contract |
| --- | --- | --- |
| Fly | Two closed tensioned textile sheets; rounded bound edges and thin lapped seams replace square edge rods; slight longitudinal sag | Same ridge, eave and cell. Deviation from the original collision skin is a few centimetres. |
| Door | Same six-sided opening, fluted gathered cloth held at waist cuffs, sewn edge | Clear opening half-width 0.70 m, shoulder 1.70 m, crown 2.25 m. Existing identity anchor unchanged. |
| Timber | Named ridge, rear post, two jambs and diagonal braces with axial UVs | Original load path and centre aisle retained. |
| Ground / tension | Thin closed groundsheet, skirts, four ropes and leaning stakes | Origin stays on ground; no new physics. Four ropes remain inside the old cell. |

The main shape stays deliberately close to the old collision shell. The visible change is strongest in edge construction and cloth response; the broad silhouette improvement is conservative and must be judged at player distance.

## Files and reproduction

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python-exit-code 1 --python tools/world/scenario-craft-pilot/build_tent.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python-exit-code 1 --python tools/world/scenario-craft-pilot/render_review.py
```

The builder regenerates the first manifest; copy frozen files before deliberately rerunning after an edit. Resource preflight and a coordinator heavy-job slot are required under the current host pressure.

- `baseline-C03.glb`: exact old asset from Git HEAD, also HTTP hash-matched to 4341.
- `C03-tent-editable.blend`: named editable source, material nodes and separate offline review rig. Runtime material batches are derived copies in a hidden collection.
- `build_tent.py`: deterministic construction and original procedural 512px material images. These maps are not scans. They are original author-generated CC0 assets.
- `qa/raw-author-qa.json`: original Scenario material/density/export reports and per-part native/runtime topology.
- `qa/roundtrip.json`: fresh reimport mesh/UV checks and exact door/tent-parameter comparison.
- `qa/*ordinary.png`: source, reimport and exact old GLB under the same offline camera, lights, exposure and resolution.
- `qa/export-reimport-clay.png`: geometry-only review of the exported candidate.
- `public/assets/world/scenario-craft-pilot/C03-tent-v1.glb`: runtime delivery with embedded PNG maps, no compression or extension requirements.
- `src/components/world/WorldCampTentPilot.tsx`: visual-only adapter, receives the caller's actual placement. It clones geometry/materials, retains UV and PBR, adds the inherited cloth attribute and matching depth shader, borrows the existing renderer reflection cache, and disposes only its own copies.

The caller must retain the original C03 collider and the existing outer loading/error guard. It must select one visible model, rather than overlaying this with old canvas geometry. The original global wind clock supplies pause/reduced-motion behavior. Canvas alone retains the old warm night emission at 0.15; no global lighting, exposure or physics changes are included.

## What the Scenario tools did

The pilot used three pinned upstream capabilities through `scenario_tools.py`:

1. `uv.texel_density` measured actual fly density at 1018 px/m and the pole at 1373 px/m. Shared tiling UVs intentionally overlap, so a unique-atlas overlap gate was not imposed. The density numbers made texture scale explicit; they do not certify distortion or visual quality.
2. `materials.audit_material` checked explicit UV nodes, color/data spaces, image persistence and normal wiring. It returned no errors or warnings. A constant-groundsheet-roughness informational note is retained. This was a useful mechanical export check, not evidence that the material looked better.
3. `export.glb_summary` reported the actual delivered GLB as 508,592 bytes, 10,568 triangles, five material batches and five embedded PNG images. Fresh Blender reimport independently retained UVs and frozen extras.

The pilot did not need hard-surface modifier stacks, remeshing, baking, a cloud account or external asset downloads. Per-part topology checks were direct Blender bmesh checks, not silently attributed to Scenario. No tool supplied the design. This single candidate demonstrates selective tool use, not a causal quality gain over an old-skill control.

## Evidence boundary

The author inspected all three relevant offline images at useful size. Rounded edge profiles and softer canvas response survive export; the final ordinary-player day/night appearance, actual passage through the doorway, shadow/wind behavior and measured runtime cost remain coordinator verification. The native source and first GLB hashes remain unchanged after offline review. Adapter simplification requested by the coordinator affects only ownership of fallback handling and night-update frequency.

Coordinator runtime verification is now recorded in [the integrated pilot report](../../../docs/world/phase-2-playground/scenario-tent-pilot-20261107/README.md). After seeing the first engine close view, Sol added bounded anisotropy through shared, owned texture wrappers; source geometry and GLB stayed unchanged. Original and final engine images are both retained. This sampler correction is a separate integration pass, not part of the frozen first native result.
