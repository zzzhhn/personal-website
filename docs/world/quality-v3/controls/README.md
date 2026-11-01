# Controls & camera round (any-direction movement, free camera)

Code: `src/components/world/WorldActors.tsx`, `actor-physics.ts`, `store.ts`, `world-i18n.ts`, `world.css`.
Bot: `tools/world/playtest/controls-camera.mjs` (real Playwright keys, mouse drags and wheel; `?qa=1` read-only observation, logged fixture starts).

| File | Content |
| --- | --- |
| `controls-camera.json` / `.log` / `.webm` | 16/16 checks (a) walking (b) steering + drive camera (c) zoom + V (d) ground/collision |
| `contact-sheet.png` | rotated-camera walk, chase view, 2.5 m, 30 m, first person, tent orbit |
| `drive-route/` | `drive-route.mjs` rerun, 15/15 |
| `final/` | `final.mjs` rerun: 14/14 checks, 56/64 collisions (G19/G20 vegetation in transition, see report) |
| `astro-check.log` | 0 errors, 0 warnings |
