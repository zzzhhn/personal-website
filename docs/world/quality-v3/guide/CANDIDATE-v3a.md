# G24 v3a candidate (locomotion only) - 2026-10-22

Status: first viewable candidate, NOT released. `public/assets/world/guide/G24.glb` is unchanged (73aa0bb6).

## Files
- Draco candidate: `tools/world/guide/out/G24_candidate.glb`, sha256 `7b7349b6b3c30b225900f8f5439703190fb874c04fcfecddbac0f8ba3493eb9c`
- Uncompressed: `tools/world/guide/out/G24_candidate_uncompressed.glb`, sha256 `5090495df2cf29a2495ec60553c5f6327145ed23696523b4b4e251e905df2822`
- Native: `tools/world/guide/blend/G24.blend` (73aa native kept at `tools/world/guide/out/G24_73aa_native.blend`, source at `out/build_guide_73aa_released.py`)
- Normal-speed animatic rendered from a fresh import of the Draco candidate: `animatic/v3a_locomotion_side.mp4`, `animatic/v3a_locomotion_q34.mp4` (real time, 3 s each Walk / Run / Sprint, root travel = design speed, 0.5 m checker), contact sheets `animatic/v3a_side_sheet.png`, `animatic/v3a_q34_sheet.png`.

## What changed
Clips: Idle (unchanged), **Walk / Run / Sprint retargeted from CMU mocap**, Jump and Land are still the old L1 authored clips (RunJump, air phases and helmet are next).

| Clip | CMU source takes (measured) | Froude-scaled (s = 0.575 / leg_src) | Authored adjustment | Result |
| --- | --- | --- | --- | --- |
| Walk | 35_01-03, 12 cycles, 1.26 m/s, cycle 1.128 s, leg 0.866 m | 1.03 m/s, cycle 0.92 s | stride x1.25, cadence x1.2 (start/stop only, spec 1.3 <= 2.0 m/s) | 1.54 m/s, 46 frames |
| Run | 09_01-09, 09_11, 10 cycles, 3.52 m/s, cycle 0.75 s, leg 0.861 m | 2.88 m/s | stride x1.12, cadence x1.115 (target 3.6) | 3.59 m/s, 33 frames |
| Sprint | 143_01 + 141_01, 4 cycles, 5.88 m/s, cycle 0.35 s, leg 0.741 m | 5.18 m/s | stride x1.10, cadence x1.088 (target 6.2) | 6.20 m/s, 17 frames |

Retarget method (`tools/world/guide/mocap_retarget.py`, data prep `tools/world/guide/mocap/`):
- Measured per-segment world rotations from the ASF rest pose drive pelvis, spine (upperback), chest (thorax), head (thorax->head 50-60 % follow) and feet, with a rest-offset rotation between the CMU segment direction and the G24 bone.
- Legs: measured ankle path (scaled by s, hip-relative heights), solved with the existing two-bone IK using the measured knee direction as pole; pelvis height re-solved so stance legs keep the measured hip-ankle geometry.
- Offline contact bake: in each stance window the lowest boot vertex is pinned in virtual world space (heel -> flat -> toe pivot changes keep the pivot fixed), swing carries the correction smoothly.
- Authored clamps for the TABS body (recorded in the build report): arm abduction >= 30 deg, arm swing x0.75-0.85, elbow <= 60/80/85 deg, knee <= 100 deg in swing, foot track >= -5 mm, swing clearance 3-5 cm.

## Gates run on this candidate (native unless noted)
| Check | Result |
| --- | --- |
| Strict self-intersection, native, all clips incl. Sprint (595 samples) | 0 |
| Strict self-intersection, Draco reimport (595 samples) | 0 |
| Contact slip (cumulative per stance vertex), threshold 17.2 mm | Walk 10.9, Run 6.6, Sprint 3.3 mm: pass. Jump 35.8 mm: **still fail** (old clip, next step) |
| Sole centroid drift, 17.2 mm | Walk 22.6 mm **fail** (heel-to-toe roll moves the centroid; per-vertex slip passes), Run 6.3, Sprint 6.1 mm |
| Penetration, 4.30 mm | Walk 0.5, Run 3.6, Sprint 2.3 mm |
| Relation table / GLB parity / wrist / renders | not yet rerun for this candidate |

## Seen in the animatic (my review, not acceptance)
- Clearly different from 73aa: forward trunk lean, flight phase in Run/Sprint, knee drive and heel lift, pelvis bob and counter-rotation come from the capture.
- Arms still read stiff/short; Walk heel strike is a bit flat-footed; Sprint at 17 frames is busy. Next iteration targets these.
