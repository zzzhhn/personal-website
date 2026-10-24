# StartRun: measured candidate and unresolved start constraints

Status: **review required; not enabled, not accepted**. Baseline `41cca6b` remains untouched. The original complete startup failure (181.9 mm) is not closed by this work. No production GLB, native G24, old clip/contact, physics, runtime IK or WorldGuide code changed.

The standalone authoring tools append only `StartRun` to a copy of the locked native. The final offline preview uses CMU `143_03.amc`, zero-based inclusive frames **112–196**: arm-down double support, right first step, then running. Fixed source contact events were declared before target baking: L 112–155 and 190–196; R 112–129 and 163–177. Source files remain external; hashes are in the adjacent report. CMU/NSF EIA-0196217 credit is retained. FPS 120 follows the existing CMU pipeline; the AMC header itself does not encode FPS, so this is not a new independent per-take rate certification.

The earlier Neutral_FR 293–360 trial is rejected because the author's valid interval is 357–4227. Its preview stays external as failed-source evidence. The StartStop candidates were only inspected by FK; root stillness did not imply double support, and their scaled speeds were too slow. A subsequently tried CMU author-time retime of 1.48× was also rejected when the frozen timing constraint was reread. It is not hidden in the current tool or the strict preview.

## Strict similarity preview

`evidence/start-run/cmu-similarity.mp4` (normal playback), `cmu-similarity-poses.jpg`, `CMU-similarity.blend`, and `cmu-similarity.json` are under the repository's parent workspace, outside Git. A small six-frame contact sheet is committed as `start-run-similarity-preview.jpg`. Six rendered pose samples were inspected; the right-to-left first-step sequence is retained. This is not user artistic acceptance or runtime acceptance.

Frozen §1.2 requires **hip-to-sole height**, whereas the old shared one-shot pipeline uses leg length for its timing ratio. This new append path measures and records both, without rewriting old assets. G24's actual Idle frame-0 hip-to-sole height is 0.656000 m (the frozen document's nominal straight standing value is 0.67 m). Source static frames 88–111 measure 0.719337 m. Thus `s=0.911951`, similarity duration `0.7*sqrt(s)=0.668473 s`, rounded only to the 60 Hz grid at 40 frames / 0.666667 s (0.27%). Root travel uses this height scale; limb geometry still maps to the locked bone lengths through the existing offline solver.

The append operation compares hashes before/after: locked native mesh positions/faces/weights/groups/material assignments, rest skeleton, and **all 15 original Actions with keys and extras remain identical**. Native root/mesh/weights/rest are not regenerated. Offline maximum contact correction is L 78.8 / R 74.7 mm; those are authoring corrections, **not measured slip passes**. Offline overstretch is zero for the source's own scaled travel.

## Why stride authoring alone does not make this candidate usable

The existing body accelerates with `response=12`, not a linear 0.3-second ramp. Its continuous target response is `v=3.6*(1-exp(-12*t))`, `x=3.6*(t-(1-exp(-12*t))/12)`. This is a necessary feasibility calculation; it is not a substitute for a real keyboard bot.

At the **fastest allowed playback 1.2×**, source frame 154 is still in the original left support interval. At that point:

| Quantity | Value |
|---|---:|
| Physical elapsed time | 0.277778 s |
| Required body travel | 0.710702 m |
| Similarity clip root travel | 0.237196 m |
| Additional stride displacement to keep the same foot anchor | 0.473506 m |
| Required hip-to-ankle distance, already granting full 5 cm pelvis drop | 0.816074 m |
| Existing leg length at 99.5% | 0.572623 m |
| Unreachable amount | **0.243450 m** |

`start_feasibility.py` measures the actual candidate bone pose and foot location, keeps the same foot anchor/rotation, and substitutes body travel. Slower allowed playback only increases this first-support demand. This rejects that narrow stride-only adjustment with the existing pose and pelvis allowance. It does not claim to disprove every possible newly authored motion or pelvis trajectory.

The other promising source, `141_03`, is **not** rejected as T-pose or a turn. Its initial arms hang 16–22° from vertical. Read-only FK shows first swing L around 82, but R remains near its own standing plane at 98 (ankle +2.7 mm, toe −2.8 mm), then clearly rises around 100–104. With its measured static height, source 98 is already 0.22349 s / 0.52510 m of body travel at 1.2×. It is somewhat earlier than 143, not an obvious fast-start solution. No contact curve was changed, no 141 asset was baked, and no strict 141 reach/A6 result is claimed.

## Concrete next decision

For `143_03`, the measured source support duration, strict similarity time / 0.85–1.2 rate, immediate existing body response, and unchanged rig reach cannot be satisfied by the tested stride-only authoring. Do not mount this candidate or silently retime it. The concrete review request is to choose one of these two paths: (1) allow controlled timing retargeting of a genuine measured startup, with source time / similarity time / additional retime reported separately and normal-speed visual review, or (2) coordinate the physical acceleration curve with the measured startup timing while preserving the agreed response goals. Both need the frozen-document owner to record the scope; neither is authorised by this report. Another faster source remains possible, but no unlimited source hunt or parameter sweep is proposed. On 2026-10-25 the coordinator selected the authorised Claude-Opus-5.5 fallback and actually submitted both requests to WorkBuddy's 00-website-main. The request entered the conversation, then ended after about 11 seconds with an unknown-error response. No ruling was received. The UI also shows global quota exhaustion, but that does not establish the exact backend error cause. The earlier inference from an empty composer's disabled Send button was insufficient: **the request is now delivered, but not reviewed or approved**.

No fresh Draco export, A6, or new runtime A3/A6 was launched after this geometric failure. The normal-speed source preview and failure evidence are the reviewable deliverable. If a conforming runtime candidate is later made, its A3 window must include Idle → StartRun → Run; the existing `/Air|Start/` metric exclusions must be narrowed to jump states so StartRun cannot disappear from slip/contact statistics. The final skin capture must include the entire StartRun and its Run handoff, not only Run ±250 ms.

The later integrated full motion-bot report (`evidence/integ/motion-followup/motion/report-integ-motion.json`, read only here) contains 1178 frames and zero page errors, but **does not pass the motion gate**: Idle→Run 183.8 mm, Land→Idle 105.5 mm, the generic Run bucket 79.6 mm, and maximum switch pose jump 211.1 mm. Those buckets mix transitions/turning and cannot be called pure steady Run or attributed to a new regression without further classification. This StartRun candidate was not mounted in that run. No additional bot was launched by this task.
