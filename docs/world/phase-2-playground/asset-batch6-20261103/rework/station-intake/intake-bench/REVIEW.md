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

At the ordinary view, check whether the near edge reads as a single folded steel sheet with a setback below it, and whether the cabinet plinths and recessed panel faces read without zooming. Read the new shapes alongside the accepted rollers in both lighting states before judging the full assembly. Real screenshots, editable asset export and fresh import are pending the serial window.
