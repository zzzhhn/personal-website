# Alpha mountain batch 2 candidate

User direction, 2026-11-15: “已解锁，你不用做过于多的测试哈，可以先开发新功能的”. This supersedes the earlier requirement to finish all transport play/performance checks before new-scene production. Day/night reference style and layout remain approved. It does not turn an unobserved runtime state into acceptance.

## Implemented

| Station | Play | Construction and integration |
| --- | --- | --- |
| 2 · Rune shallows | Eight separately pushed stones, fixed snapped bridge, guarded reset, permanent southern crossing | Thick carved slabs and double-sided rune shoulders; paired grooves; shallow animated water; bank planting. Moving slabs do not support the player. |
| 5 · Three-sluice waterwheel | Independent gates, fast spill versus steady bucket filling, irrigated flowers and parted water curtain | Hollow buckets, wheel rims/spokes, axle bearings, timber flumes, stone piers and a fixed through-passage. |
| 6 · Echo cave | Pick up miner lamp, three chimes with timed spatial echoes and visible rings, mural side room, daylight exit | Thick rock shell, shared visible/collision floor, timber chime frame, hollow bronze bodies, forged lamp. |

Primary integration: one shared island-local layout; graded terrain; branches on the map; new trail-card visits; vegetation/boulder/rail clearance; generic hand cancellation; fixed light-slot reuse. Original main path and all transport datums stay in place. No changes to `player-ground.ts`, DPR, shadow maps, existing material resolution or the long BGM.

The existing static trail-lamp transforms are now initialized once. Bell changes update instance colors only when each lamp switches, removing nine expensive height queries per rendered frame without changing the visible treatment.

## Candidate entry points

- `http://127.0.0.1:4343/world/?start=alpha-shallows&quality=balanced`
- `http://127.0.0.1:4343/world/?start=alpha-waterwheel&quality=balanced`
- `http://127.0.0.1:4343/world/?start=alpha-cave&quality=balanced`

Latest user direction: all arrivals default to Balanced. The store initializes Balanced and the Canvas initially caps DPR at 1.5; players can explicitly select High in settings. Earlier High/DPR2 evidence remains historical, not a new startup requirement.

These are public playtest arrivals on permanent support, not QA completion/teleport overrides. Default `/world/` still starts at camp. The new interactions must be operated by the player.

## Evidence and limits

- Focused station state tests passed in their owner lanes. Shallows additionally sampled real Rapier capsule traversal across its finished bridge and permanent bypass.
- Primary branch-grade/main-route, waterfall floor and hand-cancellation checks passed. Final TypeScript check and production build passed after the cave-floor revision and arrival-key guard. The fork check additionally samples 169 positions for one floor surface with terrain below it. Retained logs identify the checked snapshot.
- Source review found and fixed the cave lamp being incorrectly registered as a camp-only prop, which would have cancelled it outside camp. Cave lights reuse the existing two permanent slots. Source geometry review also required a unified fork floor, avoiding overlapping route strips.
- Safari was confirmed paused before the build. Attempting to load the candidate and then reconnecting Safari both hit the UI-control tool's 30-second timeout. No new station screenshot, real E interaction, audio listening or controlled frame-time sample was obtained from those calls.
- No actual day/night or Safari/Chrome performance acceptance is claimed. Do not infer it from geometry counts, unit tests, or HTTP 200. Candidate stays separate from stable 4341 until a short actual-view/interaction review can be completed.
- Final pre-build resource check: memory pressure 1, 2.94 GiB free disk and 13.37 GiB historical swap. Heavy work was serialized; no extra browser instance, image service, package download or Blender process was launched.

## Remaining concise review

View all three stations in daylight and midnight; push a stone and reset from a safe location; change the three gates and walk the waterfall passage; carry the lamp through the fork, ring a chime, cancel and leave. Check the original branch junctions and a short comparable Balanced frame sample (the latest user-selected startup quality). Do not repeat the full historical transport matrix merely to promote these new modules. Ferry final egress was observed previously; cable and sled ordinary-entry acceptance remain separately pending.
