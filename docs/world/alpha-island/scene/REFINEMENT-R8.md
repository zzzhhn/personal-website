# R8 existing grammar-tree finish and bad twig

Client date2026-11-14. R7's branch/leaf attachment, entrance sign and lantern repairs were accepted as specific corrections by main review; the tree's final appearance was not accepted. Preserve the tree skeleton, rope target, lodge sign, island shoreline, transport layout and previous immutable samples.

The current tree alone gets interrupted .3–.8m bark plates/roughness instead of continuous longitudinal grooves. No generic pine treatment or global exposure changes. Source remains directly editable TS geometry/materials.

`twig-2-5` and its actual leaf are excluded from the static bark/leaf/pulse batches, then used once by `AlphaBadBranch`. There are23 fixed leaves plus one real attached bad twig/leaf. That leaf has no pulse shader. The original parent/child attachment has0 measured error; no static duplicate stays behind when the one rigid body falls.

The controller waits for the true tree action pulse to reach its branch travel distance, then changes that same body from kinematic to dynamic. A conservative falling column checks current non-fixed bodies before release. It is physically pushable; the controller uses the island's pause/visibility-aware elapsed clock. E while waiting/fallen creates no duplicate and does not extend its18s deadline. Timeout, excessive scatter or encroaching the protected path requests return; actual collider shapes at the original attachment are checked first. Obstruction defers return, retaining a last clear pose rather than clipping through an actor or vehicle. All body option identities are stable across a React pause/context update, preserving the manual type transition.

`node tools/world/alpha-island/verify-grammar-source.mjs`: finite/unit-normal/winding/nondegenerate geometry,23+1 leaves, actual attachment, buried terminal rings/caps, measured pulse/bark gap and production-vs-verified geometry identity. Output `evidence/grammar-r8-source.json`.

`node tools/world/alpha-island/verify-branch.mjs`: real Rapier body/colliders and actual terrain, fall→pause→18 world-second return, repeatE idempotence,72kg capsule physical contact/push, and blocked-home deferred return.3 passed; `evidence/branch-r8-physics.log`. The transformed bound encloses actual visual vertices, capsule radii and leaf-box corners. Its minimum sampled path margin was.513184m in those fixtures; the push moved the body1.85m with211 contact-pair samples. These are source-level physics fixtures, not the requested browser/G24 full cycle or visual acceptance. Next browser window is limited to that actual cycle and the affected bark close view; no paper-lantern/lodge matrix rerun.


## Frozen Chromium runtime cycle

Runtime d9b0035, capture harness HEAD702b725, `evidence/702b725-branch/manifest.json`. Source and resource hashes stayed unchanged, captured errors empty. One QA starting placement at the existing rope; after E there were no teleports or forced body impulses. Ordinary WASD walked around the roots, then the real G24 capsule contacted the detached twig once and displaced it1.662311m. There was exactly1drop/1reset. During actual Esc pause, the sampled world-clock delta was0. After18.0103 active game seconds the same body returned to its original attachment withzero velocity. Actual transformed visual+collider bound minimum sampled main-path margin was.554538m; no actor/transport restore obstruction was present in this browser cycle (that delayed case is separately tested offline).

Two affected close images only: `tree-bark-day.png` retains the old directly read tree camera, and `bad-twig-pushed-day.png` shows the leaf/twig on actual ground after contact. Full actual motion/branch/player trajectory survives in the manifest, including pause. No paper-lantern/lodge/cable matrix was rerun. This verifies the functional cycle on system Chromium/M5 Pro48GiB; tree-surface aesthetic judgment, WebKit and target Safari/M3 remain distinct and unclaimed.
