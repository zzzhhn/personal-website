# world-craft-intake-night-material-20261103 / intake_night_surface_fix

Source commit `7789327`. The intake roller role reuses the original baked light with the finished steel diffuse reflectance. The station and the other workshop roles keep their existing night response.

| Time | Legacy finish | Candidate |
| --- | --- | --- |
| 12:00 | [Before](intake-day-before.jpg) | [After](intake-day-after.jpg) |
| 00:00 | [Before](intake-night-before.jpg) | [After](intake-night-after.jpg) |

The legacy URL disables craft finishes. The candidate enables the existing intake craft finishes plus the corrected roller night response. These captures compare the full intake candidate against the legacy finish. The previous craft shader with the old night response is documented in the adjacent night evidence and has different screenshot dimensions.

All four frames used one Chrome QA tab, the same fixed camera and balanced quality, exposure 1, DPR 1, and 1710 × 875 framebuffer and JPEG. Climate blend was 1. The shadow queue was idle at two observations at least 3.3 seconds apart and remained idle after capture. The page was visible, the loading overlay was absent, and each capture reported zero console errors. The QA-only configuration keeps a fixed-camera frame scheduled while loading, climate transition, or shadow work is pending.

At midnight the roller bed shifts from deep blue toward dark charcoal with a cool cast. The ridges remain visible and the roller bed stays darker than the worktop. The source passed 24 targeted tests and the geometry/contact freeze check. Visual acceptance is pending.
