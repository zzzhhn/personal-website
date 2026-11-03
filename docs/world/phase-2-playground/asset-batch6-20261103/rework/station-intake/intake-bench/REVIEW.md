# Intake worktop and cabinets

Baseline `8cba9bd` freezes the accepted `e96e02f` roller assembly and its ordinary day and midnight views. Use that same camera, position `[31.1, 3.55, -115.6]`, target `[34, 2.25, -122]`, FOV 50°. Preserve the coaster calibration palette, with the existing dark gray steel rollers and copper-coated channels above a gray steel worktop and blue-gray equipment.

| Part | Construction |
| --- | --- |
| Top | A 45 mm steel plate at the original top datum, with narrow downturned edges. The front fold and the setback below it give the old thick block a visible underside. |
| Support | A recessed dark steel frame ties the plate to both cabinet tops. It sits behind the fold and above the existing transmission. |
| Cabinets | Two blue-gray housings on inset metal plinths. A left drive cover carries the existing handwheel. A separate right access door is outlined by a recessed reveal and uses the existing front hardware. |

The concrete foundation and the approved roller assembly stay in place. The existing tabletop and cabinet collision contract remains authoritative, including space under the visible overhang and inside the roller channels. The revised parts remain below the tabletop triangle-contact cutoff.

## Source verification

The reference manifest passed the repository checker. The two tabletop and cabinet contact buffers match the frozen revision byte for byte. With the four old target parts and 14 new assembly parts removed from their respective generators, the retained body attributes match, including normals, color, baked night radiance and craft roles. The glow geometry and full workshop bounds also match. All 24 targeted workshop and coaster tests passed.

The workshop body grows from 9,108 to 9,204 triangles and from 1,338,876 to 1,352,988 bytes of vertex attributes. It retains one material batch with zero geometry groups. The 14 named parts use only the existing powder coat and worktop roles. The source receipts record the contact hashes and retained-channel hashes. [Source receipt](source-receipt.json)

At the ordinary view, check whether the near edge reads as a single folded steel sheet with a setback below it, and whether the cabinet plinths and recessed panel faces read without zooming. Read the new shapes alongside the accepted rollers in both lighting states before judging the full assembly. See the serial QA results below.

## Runtime and export review

| Ordinary view | Baseline with accepted roller supports | Worktop and cabinet candidate |
| --- | --- | --- |
| Noon | [Original](runtime/day-before.jpg) | [Original](runtime/day-after.jpg) |
| Midnight | [Original](runtime/night-before.jpg) | [Original](runtime/night-after.jpg) |

The same QA build selects the exact `8cba9bd` generator or the `a6a0089` generator. All four originals use the fixed encounter camera, balanced quality, exposure 1, a 1710 × 875 framebuffer and JPEG, and DPR 1. The observed craft program was compiled, the climate blend was settled, and the shadow queue was idle before and after each capture. The stable renderer count stayed at 101 draw calls and changed from 560,737 to 561,025 pass-counted triangles. The production workshop body adds 96 triangles and 14,112 attribute bytes. The shared public asset root served the observed scene assets. The only logged 404 was the favicon. [Capture and hash receipt](receipt.json)

At noon the thinner plate and its dark setback read separately from the cabinet. The right access panel, left drive cover, and inset bases are visible in the ordinary view. At midnight the plate and door shapes remain readable, with less separation between the dark support and cabinet body. The preserved drive wheel and diagonal linkage still dominate the front silhouette. This is a local visual comparison and export check.

Blender 5.1.2 reopened the [editable Blend](assets/intake-bench.blend) and imported the [GLB](assets/intake-bench.glb) into a fresh empty scene. Both read back as 14 mesh objects, three materials, and 168 triangles with identical bounds. The source scripts derive the meshes and PBR values from the actual runtime assembly. The runtime renderer remains authoritative for the baked night response. [Blend readback](assets/blend.json) · [GLB readback](assets/glb.json)
