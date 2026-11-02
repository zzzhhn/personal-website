# Arrival-reference calibration windows

These 300-frame streams are retained but excluded from final matched-window reporting. The old QA fixture stamped its before state before the 90-frame warmup. Full-camp and street references were still easing by millimetres; the final fixture stamps after warmup and records every sampled camera position. All three initial windows are excluded for consistent protocol.

- candidate-n-street-sample-53.json: before/after camera max delta 0.000497300 m.
- candidate-n-patches-sample-56.json: before/after camera max delta 0.000000000 m.
- candidate-n-camp-sample-48.json: before/after camera max delta 0.004421181 m.

One first street attempt was interrupted by a transient paused/hidden/shot guard. At observation the document was visible and menu closed; no specific cause was established, no complete stream was saved, and it is not counted.

The first post-warmup legacy camp window still showed 2.900 mm of ordinary player/camera drift on the terrain. The final full-camp anchor moves to the clear corner of the existing C14 concrete display pad, using its original flat collision support; ordinary physics and the follow camera remain active. This window is retained and excluded.

Legacy street sample 9 excluded: sampled geometry changed 265 to 297, triangles 582763 to 1017460, camera span 6.976 mm. Retained unchanged. Camp sample 6 and patches sample 12 remain valid despite slower timings.

Final bounded round: candidate camp sample 3 excluded because calls/triangles changed 301/1049657 to 208/717299 inside the window. Legacy forecourt street sample 3 excluded because first-load geometry/triangles changed despite zero camera drift. Final stable forecourt window is legacy sample 6 paired with candidate sample 10. Final camp attempt interrupted by actual pause, no sample saved; screenshot/TXT retained. No more performance retries.
