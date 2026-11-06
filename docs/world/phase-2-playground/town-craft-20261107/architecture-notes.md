# Town architecture construction pass

Input: `tools/world/town/build_town.py` and `townlib.py`, unchanged. Apply
`refine_architecture.refine(A)` after the base builder and before shared UV/PBR.
The refinement owns visible bmeshes only. `col_*`, `anchor_*`, building metadata,
part names, T07 variant transforms and the original ground/platform levels are
preserved. All materials reuse the existing town palette.

## Representative T03 MoE

Keep the low two-storey cream/brick building, deep flat eave, cedar screen,
recessed timber shopfront and planting. Refine the construction:

- Replace the screen's sharp battens with eased cedar edges. Steel cleats join
  the existing top/bottom crossrails to the wall.
- Separate glass from frames with narrow dark seals, add a proper window head
  and drip edge, give shop windows a projecting stone sill and doors metal
  kickplates. Every glazing rectangle remains open around the glass.
- Replace the thin upper cream roof slab with a membrane and segmented folded
  metal perimeter, preserving its outer extent and level. Add a rear collection
  channel with a connected offset downpipe located on the back corner pier.
- Add steel bearing plates at the slender porch posts and thickness at planter
  rims. No floor platforms, steps or changes to entry widths.

Coordinator calibration: T03 was exported and compared in ordinary WebGL views.
Construction and runtime material paths worked; roof-edge and window-frame
layering improved. Measured triangle increment was approximately 3,700. That is
technical/visual calibration evidence from the coordinator, not user acceptance.

## Remaining architectural families

| Family | Visible construction changes |
| --- | --- |
| T01 SDIC | Remove the front solid dark triangle that masked the cream tympanum. Build a recessed cream core, real sloping stone mouldings, apex stone and layered base. Add quiet column bed joints, capital bearings and porch ceiling framing. Replace full roof lid with parapet coping blocks. |
| T02 WorldQuant | Curtain-wall seals, projecting horizontal pressure covers and floor-jointed vertical cover plates. Screen perimeter stays outside the active runtime face. Lobby head/sill/hinge rails and pilotis bearings. Parapet caps replace the solid roof lid. |
| T04 AiME | Actual canopy tie rods with end bearings, folded fascia and returns. Slate spandrel flashings follow each floor module, clear of ribbon windows. Recessed entrance seal and segmented parapet coping. |
| T05 Video Rebirth | Arcade ceiling beams, balcony knees fixed to the first transfer slab or upper wall, reinforced railing ends and shutter guides. Rooftop tank tension hoops, support braces and an outlet connected to the existing rain/service riser. Parapet cap blocks. |
| T06 Hunyuan | Floor-jointed curtain-wall pressure caps and seals, lobby door/transom framing and restrained stone bed edges. Support-base plates and saddles connect the existing four roof posts to the dedicated cyan ring part. |
| T07 seven low-rise variants | Replace each full roof lid with segmented coping seated on its actual parapet. Add brackets bearing on the original stone door jambs, a hood drip/fascia edge, door rails/handle and roof-connected rear-corner downpipe. Each named variant stays in its original local frame. |

Estimated remaining-family increment is approximately 20,500 triangles, making
the whole architectural pass roughly 24,200 above base geometry. This is a
primitive-based estimate, not Blender's measured count. No new material names,
collision proxies, anchors or parts were introduced. T06 ring is unchanged.

This handoff passes Python AST parsing. The coordinator still owns Blender
execution, measured family/total counts, collider/anchor hash equality, portable
export and every remaining family's ordinary-view review. Shared material/UV
work is outside this script; no noise, extra bolt fields or broad wall overlays
were added. The main known check is whether removing the original full roof lids
reveals any unsupported base-builder roof prop, especially T07's tank variant.
Their original roof decks remain and all new roof trims sit on parapet walls.
