# Intent Coaster ground refinement

Scope: workshop apron and existing courtyard paving. The approved park layout,
structures, vegetation, routes, collision surfaces, exposure and lighting stay
fixed. User feedback: the ground resembles uniformly smooth ceramic tiles.

## Construction and material

- Exposed-aggregate concrete: broad cast variation, aggregate-scale height and
  pigment, filtered fine pores, spatially varying roughness. Authored procedural
  material, not a photographed scan. All sizes are world metres.
- 5.4 × 3.6 m cast bays with offset cross-joints and narrow saw-cut seams, replacing
  the uniform 2.5 × 2.25 m dark tile grid. Joint/grain contrast fades below a pixel.
- The irregular apron retains its survey. Cast perimeter blocks have real eased
  edges; two low-edge catch channels have an inset bed, rims and separate bars.
- The existing static vertex/night-light batch owns these details. No new draw
  materials, textures, lights, animated uniforms, polling or physics bodies.
- `WorldIntentSurface` consumes the actual surface role and applies the height
  gradient after the normal chunk. Night lighting is modulated by the finished
  pigment, preserving the same precomputed illumination.

## Evidence

Baseline source: `fdf9f23dd14af2d0c3e378e2e02db7fcee68a8d0`.
Fixed workshop camera: position `[48,10,-110]`, FOV 50, exposure 1,
balanced/DPR 1, 1710 × 931, clear, noon/midnight, time flow off.
The initial performance window changed canvas size and is not a matched result.

Screenshots are actual browser renders, not generated concept art.
Editable geometry source: `coaster-paving-craft.ts`; material source:
`coaster-paving-surface.ts`. Native source is procedural Three geometry, with no
new external texture dependency or Blender export required for this floor.

## Verified results

- Both near/far collider, track and terrain hashes exactly match the baseline.
  See `baseline-contract.json` and `contract-result.json`. Added construction:
  2,564 triangles per LOD. Nine relevant existing regression checks pass.
- Actual noon and midnight screenshots inspected at the frozen camera. Initial
  aggregate was too coarse; final v3 uses a finer grain and reduced height.
  The first shader compile also revealed a reserved identifier, fixed before
  these final captures. No final shader errors were observed.
- Same-origin, same save state, 360-frame windows after 90 warm-up frames and
  static-shadow completion: baseline median 18.4 ms / P95 31.0 ms / max 91.1 ms;
  candidate median 17.0 ms / P95 29.9 ms / max 64.4 ms. These are browser frame
  intervals, not isolated GPU time or proof of a whole-world performance pass.
- Actual rendered calls 212 → 214; triangles 982,551 → 994,656 (+1.23%); resident
  geometries 244 → 246 and textures 83 → 85, despite no new texture files or
  explicit material batches. The full renderer/shadow path has a measurable
  overhead beyond the source geometry delta. Programs 175 → 157: warm-up/cache
  residency differs, so do not interpret the shorter window as a speedup.
- The Mac was under warning memory pressure. No parallel build/browser render
  was used during performance capture. The first baseline window used a
  changing canvas and remains in the evidence as excluded, not silently reused.
- Local preview HTML now uses `Cache-Control: no-store` to avoid retaining an
  old entry bundle when switching candidate roots behind a stable port.

Local source and preview changes do not imply public website deployment or
human visual acceptance. The fixed-view comparison is available in `index.html`.
