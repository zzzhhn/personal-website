# Poolside lantern

Geometry, fabric maps and geometry-only UV1 AO authored for Bobby’s island.
Timber color and OpenGL normal are 1K derivatives of Poly Haven wood_table_001, CC0: https://polyhaven.com/a/wood_table_001.

Editable source, true source baseline, renders, texture hashes and reproduction scripts: docs/world/phase-2-playground/djc-pool-lantern-craft-20261101/ and tools/world/djc-pool-lantern-craft/.
The runtime reuses one four-material GLB across ten instanced placements, with opaque fabric emission at night and no additional real-time light or transmission pass.

Runtime v2 uses the un-tinted source wood albedo and a 6 cm geometry-only AO bake with low-noise sampling. The r1 material review, diagnosis and exact geometry/UV equivalence evidence remain in the source package r2/ folder.
