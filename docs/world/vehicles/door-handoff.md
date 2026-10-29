# Vehicle cabin doors

All three vehicles now have hollow fixed cabins and genuine side apertures. Both LODs keep two separate rigid door nodes, `door-left` and `door-right`, directly under the asset root, alongside `Gxx_body` and the unchanged wheel pivots. Each door contains its outer skin, attached window and frame, inner lining, edge return and handles in one mesh. Fixed floors, sills, a dashboard, steering column/wheel and two supported seats remain in the body. The coupe uses butterfly motion; offroad and van use front-hinged conventional motion.

`tools/world/vehicles/door-contract.json` is the runtime source of truth. Coordinates use Three +X forward, +Y up, +Z right, with ground at zero. Its seat, hinge and bounds describe the +Z side. Mirror positions across Z; mirror rotation axes as pseudovectors `[-x,-y,z]`, retaining the same positive open angle. Door bounds are relative to the hinge and cover both LODs.

| Vehicle | Seat support | Hinge | Positive-side axis | Angle | Transfer X |
| --- | --- | --- | --- | --- | --- |
| offroad | `[0.05,0.77,0.42]` | `[0.60,1.02,0.98]` | `[0,1,0]` | 70° | 0.05 |
| coupe | `[-0.56,0.31,0.24]` | `[0.62,0.79,0.86]` | `[0,0.45,-0.893028555]` | 65° | -0.56 |
| van | `[1.18,0.93,0.45]` | `[1.97,1.20,1.10]` | `[0,1,0]` | 70° | 1.18 |

| Asset | Original triangles | Final triangles | Change |
| --- | ---: | ---: | ---: |
| G25 | 13,956 | 14,802 | +6.06% |
| G26 | 11,250 | 12,414 | +10.35% |
| G27 | 12,868 | 13,830 | +7.48% |
| G25 far | 3,696 | 4,820 | +1,124 |
| G26 far | 3,338 | 4,618 | +1,280 |
| G27 far | 3,256 | 4,456 | +1,200 |

The near additions remain below 11%. The far assets retain the same door and interior geometry for stable transitions, so their relative increases are larger. The coupe far model also protects the authored curved greenhouse, with its peak capped at the existing far height of 1.29 m, instead of retaining the reduced roof's inward sag. Two extra rigid meshes per car enable the runtime's two additional shared-shader door draws. No runtime allocation or collision tuning is introduced by these asset builders.

Seat support planes are deliberately lower for the measured character pose: offroad floor/cushion top are 0.55/0.77 m, coupe 0.17/0.31 m and van 0.79/0.93 m. All pedestal and cushion boxes have positive dimensions and supported overlap. Coupe cushion centers are ±0.24 m, leaving 0.04 m between the 0.44 m cushions. Its exterior sill remains 0.34 m, so feet must clear that sill during transfer before settling onto the 0.17 m floor. Side aperture cutters are restricted to the lateral walls, preserving the central roof.

At each seat center and X±0.10 m, vertical roof rays give offroad ceiling 1.735 m, coupe 1.18481–1.22607 m and van 1.955 m. These values match both LODs and give posterior-relative headroom 0.965 m, 0.87481–0.91607 m and 1.025 m respectively. The coupe's actual adapted helmet is forward of its posterior: primary's 1,211 helmet-vertex radial rays found 122 windshield intersections at seat X=-0.40 m, 33 at -0.48 m, and zero at -0.52/-0.56/-0.60 m; the final seat and transfer anchor use -0.56 m. That measured pose has reported head center approximately `[-0.0513,0.888,0.1966]` and maximum Y=1.18364 m. Center roof rays alone do not establish whole-character clearance. An uncompressed near coupe companion is exported to `/tmp/vehicle-door-G26-uncompressed.glb` for the primary's skinned-vertex fit analysis; it is temporary QA output, not a runtime asset, and its current hash is recorded in the validation manifest.

The primary's subsequent left-seat helmet test identified 21 intersections near `[0.17,0.95–0.99,-0.30]`, attributable to the steering wheel; the corresponding right-seat sample passed. The final coupe steering wheel is therefore centered at `[0.30,0.81,-0.24]` with 0.10 m major radius and 0.014 m tube radius. Its column connects from dashboard point `[0.37,0.76,-0.24]` to the wheel center. Seats, floor, dashboard and exterior remain unchanged. Both LODs and the uncompressed companion contain this correction; the primary owns the final breathing/head-gaze matrix and rendered acceptance.

Reproduction from the existing authored source vocabulary:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -t 1 -P tools/world/vehicles/build_doors.py
python3 tools/world/vehicles/qa_doors.py
```

Run the resource preflight and acquire the shared heavy-work mutex before Blender. The builder calls the original `build_vehicle.py` builders and `build_lod.py` reduction helpers, carves individual closed shell components with exact cabin/aperture subtractors, adds the interior/doors, and exports six editable native files and six GLBs. It never writes collider JSON or legacy reports. Import guards on the two existing builders allow helper reuse. Existing `qa_fresh_import.py` now selects a door-specific report when present.

Technical evidence is in `door-validation.json` and the six `door-Gxx[-lod1]-report.json` files. All six pass zero degenerate triangles, zero non-manifold native edges, finite coordinates and positive volume. Exports are freshly imported and native files reopened, with equal triangle totals and rounded bounds. Serialized material records match the original exports at pinned baseline `2d1b9c89b9ffdad87143c3d49d92759565804cd7` in full. Near closed bounds match the recorded 0.1 mm precision; regenerated G25 far has a 0.9 mm one-side bound change from source collapse reduction, while the other far bounds match. Each native and fresh import passes 18 side-aperture rays and 18 transfer rays against the fully opened door. Five rear-corner poses per door establish outward travel; coupe corners rise 1.148 m and move outward 0.578 m at full opening.

Boolean cuts introduce collinear cap vertices. Cleanup dissolves redundant coplanar edges and collinear middle vertices, then removes any exact opposed zero-volume duplicate face pair and orphan edges. It never welds the separate moving assemblies. The pipeline asserts the doorway remains clear after cleanup.

These are finite geometry witnesses, not an exhaustive continuous collision proof. Actual character posture, camera, rendered appearance and browser interaction acceptance belong to the runtime review. GLB/native hashes and executed source hashes are recorded separately from that acceptance.
