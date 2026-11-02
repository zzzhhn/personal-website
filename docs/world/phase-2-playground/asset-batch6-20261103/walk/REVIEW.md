# P02 / P03 candidate

Base c4f7fca427cd68294fa5abed344e999713fcf01a. Scope is the actual procedural boardwalk deck/support and independently knockable low railing. Original P02/P03 assets-v1 sources are procedural; archive GLBs below are review outputs and are not substituted into runtime.

Source changes:

- Manufactured grain follows transverse deck planks, longitudinal stringers/fascia, bent crossbeams and vertical/diagonal piles. Cut faces keep a finite matte growth-arc pigment. Existing wood colour/normal/roughness, metal slots, park material, PMREM and loader cache are reused.
- Near fascia has bounded butt joints and a lower return. Outer stringer straps contact the original stringer underside and crossbeam seat. All original deck positions/top jitter, pile positions, beam placements and support slabs stay fixed.
- Railing posts bear under a .97 m top handrail. Its 2.02 m length follows actual authored spacing; foot shoes contact the deck. Far source uses the same .97 m top rather than the original 1 m top. Independently knockable sections, original mass/cuboid, openings and reset controller are retained.

Current evidence: eight source tests pass, including exact baseline reproduction, P01 geometry, all support/rail/lamp contracts, exact walking vertices, unmodified knock/reset/LOD code, physical slot/UV preservation after merge and clone, and source-cost bounds. Visual verdict and editable-native fresh-import are pending. No source test is an art acceptance claim.

Source cost (COST.json): P02 near 5677→7621 triangles, far 1354 unchanged; P03 near 84→156 and far 24→36 per section, 42 placed sections. Added source typed arrays 438048 B. No new materials, textures, lights or recurring frame job. Actual viewport rendering and frame time remain separate.

Protected systems: P01 plaza, hut/spur models, P04 lamps, layout/routes/collision, shared materials, walking height, DJC and nature assets. Preview server/tab and heavy lease are task-owned; user 4341 remains main-owned. No push/merge/deploy performed here.
