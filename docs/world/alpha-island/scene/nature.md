# Alpha alpine natural geometry

Source: `src/components/world/alpha-island/alpha-nature.ts`. These are the actual procedural Three.js geometries consumed by the scene, in metres, Y up, grounded exactly at Y=0. No downloaded assets, alpha cards, dependencies, or substitute preview model.

The approved day reference informs the soft scalloped evergreen silhouette. The scene manifest passed `check-visual-reference.mjs --for-implementation` on 2026-11-13. This establishes implementation scope; runtime daylight/night appearance and human visual acceptance remain with the scene owner.

| Part | Construction | Material batch |
| --- | --- | --- |
| Pine support | Bent tapering trunk, broad base flare, five radiating surface roots, 33 attached curved boughs in seven staggered tiers | Bark |
| Pine foliage | Five attached sprays per bough plus five crown sprays; each spray has a curved rachis, two paired short needles and one terminal needle; each needle has a closed lenticular section with an arched center | Needles |
| Shrub | Seven rooted curved shoots, each carrying three short leafy sprays | One green batch |

`createAlphaPine(seed=0)` returns `{bark, needles}`. `createAlphaShrub(seed=0)` returns one geometry. Each is indexed with position, unit normal and UV attributes; groups are empty. The same finite seed reproduces the same mesh. Temporary component geometries are disposed during merging. The caller owns the final geometries and may share them across instances before disposing them once.

Measurements over integer seeds 0–63:

| Family | Triangles | Height | Maximum X/Z span |
| --- | ---: | ---: | ---: |
| Pine | 11,920 (2,060 bark + 9,860 needles) | 5.94–7.25 m | 4.42–5.67 m |
| Shrub | 1,498 | 0.53–0.82 m | 1.22–1.83 m |

For scatter clearance, allow approximately 2.9 m pine canopy radius and 0.95 m shrub radius before any instance scale. These are visual extents, not collision proxies. Ground placement uses the asset origin; the thin exposed roots belong at the terrain surface.

Use smooth opaque nonmetallic materials, ordinary FrontSide rendering and scene lighting. Suggested starting responses: subdued grey-brown bark roughness around 0.9; muted alpine green needles/shrub roughness around 0.8. Geometry supplies the silhouette and thickness. UVs run circumference/length on stems and base/tip on needles; they support restrained fine texture, not a pre-lit canopy image. The shrub's fine stems share its green material. No vertex-color shader hook or transparency is required.

Verification: direct Node TypeScript import checked all 64 seeds for exact triangle counts, finite and matching attributes, normalized normals, nonzero triangle areas, face winding consistent with normals, exact ground datum, and seed-42 deterministic arrays. A targeted TypeScript no-emit check passed. No browser, render, visual acceptance, scatter, performance or physics claim is made here.
