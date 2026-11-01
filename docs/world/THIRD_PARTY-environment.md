# Third-party resources: environment (water / coast / ground), quality-v3

Scope: worker 02 files `WorldLandform.ts`, `WorldTerrain.tsx`, `WorldWater.ts`, `WorldSea.tsx`, Island/sea
JSX in `WorldEnvironment.tsx`, plus camp terrain usage in `WorldCamp.tsx`. Recorded 2026-10-22.
The main thread merges this into `docs/world/THIRD_PARTY.md`; the character section is added separately by 01.

## Code or assets copied into the repository

None. No external shader, texture, normal map, model or source file was copied or downloaded for this work.
No new npm dependency. `waternormals.jpg` and the three.js `Water`/`Water2` objects are **not** used.

## Library used through its public API (already a project dependency)

| Resource | Source | Version | License | Use | Hash |
| --- | --- | --- | --- | --- | --- |
| three.js | https://github.com/mrdoob/three.js | installed `node_modules/three` (0.186.x per lockfile) | MIT (`node_modules/three/LICENSE`) | `MeshStandardMaterial.onBeforeCompile`, `DataTexture`, `BufferGeometry`, `IcosahedronGeometry` | LICENSE sha256 `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |
| @react-three/rapier | already in package.json | 2.2.0 | MIT | `TrimeshCollider` for the terrain and park plaza | not re-hashed (unchanged dependency) |

## Techniques (described in the literature; implemented from scratch, no code reused)

| Technique | Reference | Where |
| --- | --- | --- |
| Gerstner (trochoidal) waves, deep-water dispersion | NVIDIA, *GPU Gems* (2004) ch. 1, M. Finch, "Effective Water Simulation from Physical Models" | `WorldWater.ts` vertex displacement |
| Exact Euclidean distance transform (1D lower envelope, separable 2D) | P. Felzenszwalb, D. Huttenlocher, "Distance Transforms of Sampled Functions", *Theory of Computing* 8 (2012) | `WorldLandform.ts` shore distance field |
| Value noise / polynomial smooth max | common public-domain formulations | `WorldLandform.ts`, shaders |

Repositories looked at during selection (read only, nothing taken): `jbouny/ocean` (MIT),
`Nugget8/Three.js-Ocean-Scene` (MIT), three.js `examples/jsm/objects/Water*.js` (MIT). Licenses were checked
via the GitHub API on 2026-10-22.

## Attribution / credits

No CC BY or CMU material in this scope, so no in-world credit line is required for the environment.

## quality-v4 additions (2026-10-22): ground textures

Update 2026-10-22: after the Astra ruling (spec §13) these are **the default ground detail**. `?groundPbr=0`
switches to the procedural fallback, which loads no textures. The canonical entry is in `docs/world/THIRD_PARTY.md`.
Full hashes are in `public/assets/world/terrain/SOURCES.json`.

| Asset | Source | Version / date | License | Attribution | Changes | Files | Original hash (sha256) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Grass004 (grass) | https://ambientcg.com/view?id=Grass004 | 1K-JPG zip, downloaded 2026-10-22 | CC0 1.0 (ambientCG) | none required | Color, NormalGL, Roughness resized 1024 to 512 (Lanczos); normal XY and roughness packed into one RGB PNG; AO/displacement/blend/usd unused | `public/assets/world/terrain/grass_albedo.jpg`, `grass_nr.png`; only loaded with `?groundPbr=1` | zip `4b63495f459db848...`; Color `9e1c60da44b34a97...`; NormalGL `8014a81d896a5c58...`; Roughness `706580983860f942...` |
| Ground054 (sand) | https://ambientcg.com/view?id=Ground054 | 1K-JPG zip, downloaded 2026-10-22 | CC0 1.0 (ambientCG) | none required | Color, NormalGL, Roughness resized 1024 to 512 (Lanczos); normal XY and roughness packed into one RGB PNG; AO/displacement/blend/usd unused | `public/assets/world/terrain/sand_albedo.jpg`, `sand_nr.png`; only loaded with `?groundPbr=1` | zip `b325ec2f167dce95...`; Color `77c0b5ac13eead14...`; NormalGL `473474b0e0570cfa...`; Roughness `e19b6c7d4ee3d8a6...` |
| Ground037 (dirt) | https://ambientcg.com/view?id=Ground037 | 1K-JPG zip, downloaded 2026-10-22 | CC0 1.0 (ambientCG) | none required | Color, NormalGL, Roughness resized 1024 to 512 (Lanczos); normal XY and roughness packed into one RGB PNG; AO/displacement/blend/usd unused | `public/assets/world/terrain/dirt_albedo.jpg`, `dirt_nr.png`; only loaded with `?groundPbr=1` | zip `4e69db2b7251b173...`; Color `d92bec8a35b9cb16...`; NormalGL `ea59dbdcfa5bf2f2...`; Roughness `3786b088e981aae5...` |

License check: ambientCG license page (https://docs.ambientcg.com/license/) states "CC0 1.0 Universal License",
read 2026-10-22. CC0 needs no credit line; no in-world Credits entry is required for these.

New code in quality-v4 (grass blades, trample map, sea clear spot, low-poly ground shading) is written from scratch.
No third-party code or shader was copied.
