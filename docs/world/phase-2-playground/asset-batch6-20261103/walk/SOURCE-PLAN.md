# P02 / P03 source diagnosis and bounded plan

Base: c4f7fca427cd68294fa5abed344e999713fcf01a. Original assets-v1 records identify both as procedural; the runtime consumes WorldParkWalk, not a P02/P03 GLB.

Hypotheses before production edits:

1. P02 plankPoly, beam boxes and piles reach ParkGeo.push/toBatch with zero UV and zero physical slot. Park material already retains shared wood PBR after merge. Use a local ParkGeo subclass to author physical axes before merging; leave WorldParkKit, shared shader/cache/environment and unrelated ParkGeo consumers untouched. Preserve original five-tone deck colours, board top jitter, centreline and thickness. End faces need matte cut grain instead of stretched side grain.
2. Existing piles and crossbeams intersect at DECK_Y-.28; stringers bear on this same datum. Clarify pile-head bearing and the outer stringer joint with restrained near-only shoes/straps that actually contact those members. Fascia should have a legible lower return, never a floating decorative strip. Inspect ordinary views before declaring success.
3. P03 has a 2.02 m placement step and a 2 m handrail, leaving 2 cm gaps. Near handrail top .93 m is lower than post-cap .97 m, while far handrail reaches 1 m. A continuous 2.02 m bevelled handrail with top .97 m and post bearing at .9 m can join adjacent sections without changing independently knockable bodies. Add a supported foot shoe and stop loose cap/rail intersections. Preserve all 42 placements, openings, original collider half/offset, 40 kg mass, sleep/fade/reset and 60 m LOD controller. Align the far silhouette with the near source.

Owned implementation: new WorldWalkCraft module; only P02 builder construction and P03 factory selection in WorldParkWalk; task-only source/native generation, preview config and evidence. No changes to P01 plaza, huts/spurs, lamps, gameplay, layout, collision, night lighting, DJC, nature assets or shared material interface. Baseline/physical contract checks and native fresh-import are separate from actual matched ordinary day/night acceptance. Current heavy window belongs to nature; light source work only until explicit release.
