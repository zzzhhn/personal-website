# WorldMap immutable path cache

Changed only:
- `/Users/bobby/Desktop/3D-personal-world/wt/world-performance/src/components/world/WorldMap.tsx`
- `/Users/bobby/Desktop/3D-personal-world/wt/world-performance/src/components/world/map-path-cache.ts` (new pure helper)

No build, browser, package installation, commit, renderer/light changes, or other source changes performed.

## Implementation and contract

`createMapPathCache` uses WeakSet opt-in registration and WeakMap identity caches. Its `path` and `shorePath` retain the exact original map/join serialization. Only authored static point arrays and the once-loaded map geometry are registered. Unregistered arrays always serialize afresh, allowing dynamic in-place edits. Position, waypoint, heading, labels, and alphaWorld marker coordinates are never registered or cached. All path inputs in the current WorldMap are static authored arrays or arrays created once inside loadMapGeometry; repository searches found no runtime point mutations for these inputs. The explicit immutable-input contract is required for registered geometry.

Fallback shore loops now have one module-scope identity. Lazy-loaded shoreline loops, roads, camp polygon, and coaster samples register once when the existing geometry promise resolves. Weak keys avoid holding obsolete geometry alive.

Only JSX changes are the two equivalent `geometry?.shores ?? fallbackShores` references. A source assertion against `facdc92` confirms that the complete `return <svg ...>` source is otherwise byte-identical after normalizing those references. Thus language conditionals, marker sizes, attrs, order, colors, coordinates, layout and interactions remain untouched.

Current alphaWorld calls are only station markers; no inline generated alphaWorld point arrays feed path(). There was no related map allocation to change.

## Targeted evidence

Reproducible proof script: `/tmp/world-map-cache-proof.ts`

Run from worktree:
```
node_modules/.bin/tsx /tmp/world-map-cache-proof.ts
```

Raw results: `/tmp/world-map-cache-results.json`

The proof executes the actual old `path`/`shorePath` definitions extracted from `git show facdc92:src/components/world/WorldMap.tsx` through TypeScript transpilation. It imports current real map inputs and calls real loadMapGeometry; expectations do not reproduce the serializer in test code.

- All 44 actual point arrays (10,447 points) and both fallback and loaded shore strings equal the old implementation byte-for-byte.
- Loaded shores contain 9,159 points; loaded roads contain 18 polylines.
- An instrumented real shoreline array executes .map exactly once for 900 cache calls.
- Unregistered dynamic array edits, nested coordinate edits, pushed points, changed loop contents, and pushed loops all appear in subsequent output.
- Empty registered arrays and distinct cloned registered arrays also equal the old serializer.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler src/components/world/map-path-cache.ts` passes.
- `git diff --check` on the two files passes.

The final microbenchmark uses 900 repeat updates per sample, five samples, two whole shore calls per update plus active static point paths; excludes separate unused shore-ring calls and inactive v3 road fallback. The corpus equivalence check still covers those arrays.

| Serializer | Total CPU ms for 900 repeated updates, samples | Median ms |
| --- | --- | --- |
| facdc92 original | 3326.813, 3559.415, 2755.240, 2781.590, 3281.020 | 3281.020 |
| warm registered cache | 0.516, 0.773, 1.128, 0.372, 0.351 | 0.516 |

This measures serialization only, with checksum consumption and warmed input caches. It excludes React reconciliation, SVG painting, Three rendering, frame pacing, and production app FPS. The main agent owns production A/B validation. Do not report the microbenchmark speedup as an application speedup.

No further local changes are planned.
