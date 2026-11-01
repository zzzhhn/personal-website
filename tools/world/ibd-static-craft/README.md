# IBD static craft

Owns three visual-only equipment families. Read the scoped [construction map](../../../docs/world/phase-2-playground/ibd-static-craft-20261101/construction-map.md).

Only after the root gives the heavy slot:

```sh
node --experimental-strip-types tools/world/ibd-static-craft/capture-baseline.mjs
/usr/bin/python3 tools/world/ibd-static-craft/run.py
node --experimental-strip-types --test src/components/world/attractions/ibd-static-craft-visual.test.mjs
```

The launcher runs the resource preflight and acquires the shared atomic file lock with its PID and unique token. It starts one Blender process, at most three threads, with 960×768 review images and 24 Cycles samples. It never removes another owner's lock. No build, browser or dependency install belongs to this script.

The single runtime GLB embeds shared textures. Source photo attribution is `../ibd-crate-craft/textures/sources.json` (Poly Haven Coated Pine, CC0, Charlotte Baglioni and Rico Cilliers). Procedural metal/coating maps and original geometry are authored for this project. Runtime materials keep the glTF physical response; only original yard night fill is added in the cloned shader.

The CPU-only baseline capture imports the actual `0118dfc` builder and verifies all default output attributes and indices against the current default output byte for byte. It extracts the unchanged shell vertices, normals, vertex colors and physical surface values. Offline before images use that frozen geometry in the same rig; they are not claimed to be production screenshots.

The `.blend` keeps individual named construction parts. The GLB contains three identity top-level roots, with two height variants under UtilityBench and ControlPedestal. Runtime merges selected variants across 14 actual placements into one draw per physical material. Source geometries/materials/textures remain loader-owned.
