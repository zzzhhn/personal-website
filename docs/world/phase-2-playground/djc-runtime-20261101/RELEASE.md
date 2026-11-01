# DJC north bar promotion

User-approved 2026-11-01 craft pilot, promoted on the stable `f248bc2` world baseline. The isolated release excludes unrelated in-progress factory, coaster and terrain changes.

## Asset contract

Standard glTF Y-up, position `[40.75, 1.2, 40]`, unit scale. Near asset preserves all 72 accessor payloads, original geometry bytes, nodes and material semantics. Images are externalized losslessly to satisfy the Pages 25 MiB per-file limit. This does not reduce the near asset's total network bytes or decoded texture memory.

Near: 303,420 triangles, 13,283,808-byte GLB. Far: 204,228 triangles, 10,531,556-byte GLB. Both: 18 material batches and eight shared images totaling 14,951,193 bytes. Original 4K wood maps and glass transmission remain intact. See `asset-report.json` for identities, transformations and verification.

Fixed platform, post, counter, stool, planter and roof collision proxies total 204 triangles and are independent of visual LOD. The old bar is removed from the default scene; the dance approach now meets the refined deck. The existing Club occlusion-fade exclusion is preserved.

Asset loading and private PMREM begin on first approach within 90 m. Visibility is bounded to 180 m; LOD uses 26/30 m hysteresis. A stable Suspense boundary and React transition retain the visible level while the next one loads. Both loader geometry caches may remain resident; shared texture identity avoids duplicate uploads of equivalent external images. Owned material clones and PMREM targets are disposed separately from loader-owned resources.

## Reproduction and checks

Editable source: `../djc-quality-pilot-20261101/djc-bar-pilot.blend`. Approved export: adjacent `djc-bar-pilot.glb`. Derive with `python3 tools/world/djc-quality-pilot/runtime-assets.py`; inspect only with `--verify-only`.

Run affected Node tests with `node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/djc-bar-runtime.test.mjs src/components/world/club-geometry.test.mjs`, then `npm run build`.

QA URLs require `qa=1`: `djcBar=legacy`, `djcBar=near`, `djcBar=far`, and optional `djcBarTransmission=0`. Ordinary pages do not honor these overrides.

Offline render approval, code/build checks, browser measurements and deployed verification are tracked separately. See the runtime QA report for current measured results; this file alone does not certify frame rate or production publication.
