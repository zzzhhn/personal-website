# Coastal craft candidate, 2026-11-07

Source baseline: branch `codex/coaster-car-astra-pilot`, HEAD `63f3fe3`, using
the checked-in `tools/world/town/build_town.py` and `townlib.py` in this worktree.

Owned source: `tools/world/town-craft/refine_coastal.py`. Entry point:
`refine(A)` after the original `BUILDERS[A.id]()`. This module does not create
materials, touch a Blender scene, export files, or change the runtime adapter.

| Family | Construction change | Approximate added triangles |
| --- | --- | ---: |
| T09 plaque | Rear fixing rails, post collars, frame fasteners, folded rain lip outside canvas | 450 |
| T10 kiosks, both variants | Replace flat canopy and valance with curved striped cloth, sewn scallops and rounded hems; replace suspended poles with attached diagonal supports; actual counter boards, brackets, frame feet and capitals | 3,600 total |
| T11 lifeguard tower | Replace raised fake deck seams with separated boards; bearing joists, pile saddles and bolts, hut corner trims and roof rafters; manifold striped rescue ring and carrier rope on existing front railing | 1,900 |
| T12 palms, both variants | Keep 11 / 10 fronds and 16 leaflets per frond; curved folded leaflet blades, tapered solid rachises; restrained bark relief and attached leaf-base scars | 4,400 total |

Estimated aggregate delta is about 10,400 triangles. These are construction
estimates, not measured exported totals; coordinator must measure the actual
Blender mesh and exported GLB, including bevel triangulation.

Existing physical material names are reused except for the coordinator-registered
`town_canvas_blue` on T10-b's rebuilt canopy, valance and hems. It preserves the
blue color while routing these surfaces through the cloth material family;
the original slate cladding and other slate parts remain unchanged. T10 keeps `T10_a` and `T10_b`
as separate parts at the same authoring origin. T12 keeps each variant's trunk
and leaves names, `part_extras`, and variant-b offset at Blender Y = -4 m.
Existing trunk vertex wind values are retained, new trunk scars get the source
height-based bend, and all rebuilt leaves and rachises get the original
`(bend, branch, leaf, phaseGroup)` weighting recipe. Colliders, anchors and
shadow-top data are never edited. No stair or traversability changes.

Lightweight verification completed: Python AST parse/compile, no writes or
method calls affecting colliders / anchors / variant metadata. Original material
names exist in source `townlib.MATS`; `town_canvas_blue` requires the coordinator's
shared MATS registration with family `cloth`. No Blender, build, render,
browser or image service was opened by this lane because resource-intensive
work is reserved for the coordinator's serialized integration.

Still required: actual BMesh construction, triangle and bounds readback,
manifold / winding checks on rebuilt cloth and torus, complete `_WIND` export
readback, and controlled ordinary-view / grazing-view review of all six
variants. Check canopy edge seams, diagonal-support attachment, palm
double-sided response and silhouette, and ring placement after the runtime
loader's merge/material path. Static checks do not establish visual acceptance.
