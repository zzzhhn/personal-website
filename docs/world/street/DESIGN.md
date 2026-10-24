# Street & global props: design notes (read this first each turn)

Owner: street session (`wt/street`, branch `codex/world-street`, port 4334). Baseline `8ac1a76`.

## Scope and claims (runtime, spec §15.2)
Each group claims its key with `useGreyboxClaim` inside its own error boundary + Suspense, only after
its visual AND colliders mounted. v3 entry (`?layout=v3`): WorldStreet renders nothing, claims nothing.

| group | key | contents (all from layout-v4.ts data) |
| --- | --- | --- |
| knockables | `knockable` | knockablesV4(): lamp 26, signal 4, stop 5, direction 6, delineator 11, chevron 1, bin 3 |
| roadblocks | `roadblock` | OBSTACLES_V4 (4) |
| street-fixed | `street-fixed` | benches 13, bollards 12, bus shelter 1 |
| rails | `rail` (+ `roadside`, a v4 no-op) | seawall + 4 ring chords (cream, knockable panels between fixed end pillars), hill timber rails (knockable beams, fixed posts), 2 bridge parapets (fixed, structural) |
| trees | `tree` | TREES_V4 with y < 2 (8) + pocket-park trunk; canopy decor is dropped by WorldDistricts under `tree` |
| windmill | `windmill` | G29 tower (fixed trimesh) + rotor (wind clock) |
| foundations | `foundation` | FOUNDATIONS_V4 (3 slabs, walkable top + solid sides) + F04 sign each (fixed) |

Not mine: kiosks and lifeguard tower are town's `massing` (MAIN-THREAD-NOTES for town). Billboards G15
have no layout data: reported as a gap; the shelter carries an island-map poster panel instead.

## Sources
- Runtime procedural (TS, zero download): every prop, lamp generator G10 (exported for G11/P04 reuse),
  rails G09, foundations F01-F03, F04 sign, windmill G29. Builders in `WorldStreetAssets.ts`,
  primitives in `WorldStreetGeometry.ts`. QA: `tools/world/street/qa-runtime.mjs` (tri counts, bounds,
  closed shells, LOD ratio) -> `docs/world/street/manifest.json`.
- Blender (L1, four skills): two new tree species ST1 coastal umbrella pine, ST2 street plane tree,
  forked from nature-v4 (`tools/world/street/build_trees.py`, QA `qa_trees.py`), Draco GLBs in
  `public/assets/world/street/`, nodes L0 / L1 / shadow_crown / shadow_trunk, `_WIND` attribute.

## Rendering (budget: worst view <= 30 calls / 30k tris main pass; shadows reported separately)
- Per kind: L0 + L1 InstancedMeshes compacted every frame (camera distance with hysteresis, per-instance
  frustum test, fade > 0). L1 <= 30% of L0. Small kinds: L0 to ~70 m then distance-dither out.
- One shared material (vertex colour, per-vertex roughness/metalness `rm`, `glow` code, per-instance
  dither fade `iFade`, sign atlas `suv` + `iCell`, signal phase `iPhase`). Glow codes: 1 lamp lens
  #FFD08A (night), 2 cyan strip (dim), 3/4/5 signal red/amber/green (cycle, uWindTime clock), 6 reflector.
- Shadows: stable shadow-source InstancedMesh per kind (all instances, fixed index), main pass culled by a
  far mesh boundingSphere (`userData.shadowOnly`). Static kinds: plain material -> WorldShadows merges
  them into sun chunks. Dynamic kinds: plain MeshDepthMaterial as customDepthMaterial (opts out of the
  merge so shadows follow bodies); faded instances get zero scale. Trees: attachNatureWind on both.
- Night: lamp lens emissive + one instanced additive light-pool disc draw (hidden at dusk). No lights.
- Occluder flag on trees, windmill, shelter render meshes.

## Physics
- Knockable: one sleeping dynamic RigidBody per instance (`userData {obstacle, knockable:id}`), simple
  cuboid compound fitted to the generated part bounds (lamp/signal pole + arm/head). Slept on first frame.
  Knocked: displacement > .35 m, tilt cos < .94, or y < home - .5. 30 s after the knock: 0.6 s dither
  fade-out, reset home (waits disabled if a body occupies home), sleep, 0.6 s fade-in.
- Fixed: trimesh / hull colliders from the same generated geometry and the same matrices, userData
  `{solid, assetId}`; foundation tops `{surface}`.
- QA (?qa=1): Object.assign into `__worldDistricts` {knockables, awakeKnockables} (re-merged every 0.5 s
  because WorldDistricts replaces the object), plus `__worldStreet` {stats, kinds, setVisible}.

## Change log
- 2026-10-24 G1 knockables: rendering switched from per-kind L0+L1 InstancedMeshes to ONE BatchedMesh per
  group (per-instance L0/L1 geometry id, per-object frustum cull, far dither via batch colour alpha) -> 1 main
  draw call per group. Heavy kinds (lamp, signal, sign posts) are translation/rotation-locked while only people
  are near and unlocked before any vehicle is within 6.5 m (no static first response for cars, spec 12.5); bins
  and delineators stay free for people. Base collider is a vertical-walled prism so a running capsule cannot
  ride up a flared footing. Batch is excluded from the corridor fade (thin poles never hide the player).

## 2026-10-24 integration completion
Worktree street-integration, branch codex/world-street-integration, port 4344. Inherited WIP checkpoint c0c75bf then merged current integration. The custom collider-off debris experiment is retired: props remain Rapier sleeping dynamic bodies with CCD, explicit mass/inertia, friction .45 / restitution .02. Current vehicle wheel support filters accept fixed geometry only. Collision is never disabled to hide lift.

Tree ST1 broad coastal spreading crown (G17 nature-v4 hierarchy), ST2 tall forked crown (G18 hierarchy). Geometry targets 4.4k / 4.7k near, L1 <=25%, actual authored leaves, exact L0 trunk trimesh; 8 lowland positions from TREES_V4 plus pocket-park trunk. Colour, yaw and uniform size vary per instance. Four instanced leaf/wood merged vertex-colour draws, shared wind shader and clock. Camp trees remain camp-owned.

G29 uses a tapered smooth matte cream tower (12m), plinth, service-door frame, nacelle panels, vents and spindle. Three tapered blades pivot around +X on the shared pausable wind clock. Tower is fixed; rotor is above reach and visual only, same as existing contract. Main budget tower <=1600, rotor <=1100; L1 <=30%.

F01-F03 are the three layout-sized 20cm concrete slabs, with chamfered edge and scored top strips. F04 is a timber two-post sign with separate cap, panel planks and cross brace, canvas bilingual FUTURE SITE / 二期预留. Foundation surface and all sign geometry are fixed. No second-phase buildings, new lights, or external factual content. Budget slab <=450, sign <=700. G15 has no layout placement; report gap, shelter map remains the poster.
