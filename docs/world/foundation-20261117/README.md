# Existing-world foundation migration

## Decision and scope

The user supplied an external architecture review and asked to improve the existing project before further development. Baseline: `4b92ddb72f90952cb4317e4f88fb619e41d6dc90` on GitHub main. Freeze new venues while repairing the foundations. Preserve approved models, materials, existing gameplay and Balanced startup. A 150 m replacement island, removal of whole experiences, or new Hunyuan/MoE exhibits are proposals, not this migration's accepted scope.

Do not call this program complete after a local repair. The five pipeline changes below remain the completion checklist. The external review's performance promises and estimated percentage of prevented bugs are hypotheses, not acceptance evidence.

## Verified findings

- `WorldActors.tsx` currently gates prompt discovery by radius and visibility, then searches a safe pickup stance only on E. A visible object across a floor gap can therefore advertise an action that cannot start.
- `WorldActors.tsx` directly imports mine, exchange, IBD, factory and Alpha state/layout; availability cascades across venue singletons. This remains architectural debt.
- `WorldLandform.meshHeight` already queries the actual jittered terrain triangles. `alphaGroundHeight` queries Alpha triangles. Their existence contradicts a literal reading that all ground queries are analytical. The actual problem is competing ownership and callers mixing authoring height with rendered/physical support.
- `AlphaEchoCave` already shares floor/shell geometry with its trimesh colliders, but rack and chime-frame colliders are authored separately. Collision provenance must be inventoried per mesh, not inferred from a whole component passing a test.
- Prior usability tests passed while player visual/feel acceptance remained pending. Never use the technical result as proof of player acceptance.

## Required migration outcomes

| Area | Completion evidence | State |
| --- | --- | --- |
| Terrain authority | Build-produced, versioned mesh data drives render, physics, placement and support queries; full-map contact/clearance scan from those same triangles; no runtime placement fallback to authoring heights | Not migrated; existing real-mesh queries located |
| Collision provenance | Visible meshes explicitly classified solid/pushable/soft/none, coverage fails on omissions, geometry/transform provenance connects colliders to visible assets | Not migrated; mixed implementations confirmed |
| Interaction contract | One eligibility and execution path for every registered action; short safe approach; animation contact cannot silently veto an accepted action; cancellation and environment changes explicit | Shared entry and accepted completion implemented for Alpha, cave, camp, mine, exchange and inspection; whole-registry audit and venue approach unification pending |
| Core and venue separation | Input, locomotion, vehicles, camera and interaction modules depend on generic contracts; no venue imports in controller; each region's actual collider readiness gates entry | Mine, exchange, IBD, factory and camp actor behavior registered by scenes; cameras, input ownership and camp towing limits supplied through generic contracts; other venue logic, start/zone metadata and collider readiness still pending |
| Verification | Replace implementation-string/old-AST assertions with behavior coverage; reproducible ordinary-view day/night contact sheets with baseline and capture metadata | Not migrated; behavior tests added for first change, visual suite pending |
| Device acceptance | Measured cold load and roaming on actual M3 Air Safari with resolution, quality, route, asset cache and frame-time distribution recorded | Pending actual target device; do not substitute this machine |

## First change: executable pickup offers

`interaction-offer.ts` supplies the shared eligibility query used by E discovery, Q selection, and activation. It checks live actor ownership, object enablement, distance, height, visibility and a safe stance. The generic resolver imports venue types/state nowhere. Physics stance searches cache for at most 120 ms while the actor and target remain nearly stationary; activation always rechecks. Regular signs incur no stance search.

This removes one concrete false prompt, not all interaction failure modes. A dynamic obstacle can invalidate an offer after it was drawn; E must then recheck and report the changed route, not teleport through the obstacle. Post-approach palm-contact logic is being migrated in batches below. No claim of universal action success is made until all adapters are migrated and exercised.

Behavior verification covers a real Rapier floor gap, its supported counterpart, blocked/unblocked offers, Q selection, actor locks, changed target positions, adapter replacement, invalid coordinates, cache bounds and activation revalidation. Existing pickup/collision tests remain useful. Do not delete them merely because the review proposed fewer tests.

### Batch 1 verification, 2026-11-17

- `node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/interaction-offer.test.mjs src/components/world/interact-lifecycle.test.mjs src/components/world/pickup-approach.test.mjs`: 17 passed, zero failed/skipped. Includes the real Alpha floor and lamp approach regressions.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `npm run build`: passed after the final cache correction, eight routes built.
- No new textures, models, lights, passes or quality changes. No browser/player or M3 Air performance acceptance claimed. Existing runtime chunk-size warning is unresolved.
- Live-getter adapters are explicitly tested so allocating a new approach descriptor on read cannot defeat the 120 ms probe cache. A changed stance predicate invalidates a cached positive result; an explicit activation always bypasses the cache.

## Batch 2: accepted action lifecycle

`accepted-action.ts` separates logical completion from IK telemetry. An accepted action has a finite local animation duration, one commit edge, and a terminal cancellation state. It has no venue, React, physics or rendering dependency. Callers must still supply live eligibility; the clock does not authorize remote interaction or bypass a collider.

Migrated: Alpha bell, sand table, tree rope, wind gate, cairn stone, paper lantern, and the cave miner lamp. Existing safe-stance approach gates remain. The six Alpha effects now commit in `alpha-state.ts`, where they are behavior-tested independently of the rendered hand. Walking away before completion, losing ground, cancelling or a foreign hand owner prevents the effect. Stone placement keeps its original arc. Paper lantern release requires a current held object and owner, not a palm-error threshold. No new textures, lights or quality changes.

Held lanterns use the authored hand socket if the animation sample is temporarily unavailable, so their logical ownership does not become an invisible prop or a missing light. This fallback and state behavior are tested; rendered timing/attachment quality still requires player review.

Verification: 46 behavioral/physical/rig tests passed across `accepted-action`, `interaction-offer`, `interact-lifecycle`, `pickup-approach`, `alpha-state`, `alpha-action-reach`, `alpha-batch2-lifecycle`, `cave-state`, `cave-lamp-reach` and `batch2-station-feedback`. TypeScript and the production build passed (eight routes; existing large-chunk warning remains). The pre-existing palm-contact tests for **visual reach** remain useful, while tests that required logical pickup failure on missing palm have been replaced with accepted completion/cancellation tests.

Camp migration follows below. Mine and remaining venue-specific actions are still pending. This is not evidence that the global interaction contract is finished.

## Batch 3: camp interaction consistency

Camp dumbbell, suitcase and tool pickup now use the accepted-action clock instead of requiring a sampled palm contact. Missing palm samples use the authored carry socket for held dumbbells and tools. Suitcases retain their dynamic bodies and physical wall blocking; dumbbells retain collision isolation while held and the existing safe-drop restoration. Losing support, walking out of reach and session takeover still cancel the action.

Camp command helpers now drive both prompt availability and E execution. Busy curl, lowering, tool-return and page-turn phases no longer advertise a no-op command. Journal opening and continued reading share the same vertical reach band, avoiding immediate cancellation after an accepted opening.

Verification: 34 tests passed across accepted-action, interaction-offer, interact-lifecycle, pickup-approach and camp-prop-interactions, including a real Rapier pickup without palm samples, safe body restoration, suitcase turning/wall blocking and tool-geometry lane coverage. TypeScript and the production build passed (eight routes; the existing large-chunk warning remains). These results do not certify rendered attachment quality or player feel. No models, textures, lighting or quality settings changed.

## Batch 4: mine actions without render-clock vetoes

Mine equip, scan, strike, pickup and deposit now use the common accepted-action clock. Removed the exact-render-timestamp rendezvous and half-second contact timeout. Spatial reach, strike facing, grounded support, moving-away cancellation and current ore availability remain enforced. Live semantic availability is shared by offers and action entry; the rack no longer advertises a reset while loose ore blocks it. Nonfinite positions and time cannot poison a transaction.

Deposit still has separate release and arrival events. Cancellation during flight restores the same ore; pool comparison results and recovery shelves retain their previous behavior. Missing or stale ore-release samples fall back to a finite local carry socket. Hand/contact errors remain diagnostic, and the existing G24 visual-reach tests remain intact.

Verification: 52 passed and one pre-existing skipped asset-socket test across accepted-action, alpha-mine-state, mine-pickup-approach, guide-mine, world-recovery, alpha-mine-physics and alpha-mine-online. TypeScript and the eight-route production build passed. No browser, rendered motion, target-device performance or full-world completion is claimed. No model, material, lighting or quality changes.

## Batch 5: exchange, inspection and crane completion

Exchange and IBD inspection now use the same accepted-action commit clock as camp and mine. Exact render sample IDs/timestamps, palm reachability and palm distance no longer authorize business transitions. Existing real stand/yaw alignment, approach timeout, grounded support, actor availability/mode, callback generation/revision checks and cancellation remain. Callbacks still commit at most once, including rejected or thrown callbacks.

Crane motion now requires the current operation token/round, committed operator action, live physical stance/support and the correct held command. It no longer requires a palm sample from the latest render. Blocked cargo paths, release of input, pause, changed round, lost ground and cancellation still prevent motion; cargo must land before the operation is credited. Inspection retains its real jaw-gap check, tray presentation/retraction, original-pocket identity and return-before-evidence rule.

Verification: 62 behavioral/controller/rig tests passed across exchange motion/play, G24 exchange and inspection rigs, inspection motion, pack play and crane control. This includes the complete three-leg crane route without any rendered palm samples, live support rechecking before the next actor tick, pause, invalid samples, callback rejection and fitted-jaw measurement. TypeScript and the eight-route production build passed; the existing chunk-size warning remains. Visual pose tests remain separate from logical completion. No asset/material/lighting changes or player acceptance claimed.

## Batch 6: first registered actor activity

`actor-activities.ts` is a venue-independent registry for live pose/input, action ticking, movement occupation, facing, carried-item interaction policy, commands and interruption. `alpha-mine-activity.ts` implements that contract and is registered by the mine scene. `WorldActors` no longer imports mine state or directly handles ore identity, the mine action clock, mine movement cancellation or the F-key operation. `world-recovery` uses registered interruptions and pose synchronization instead of importing mine state.

Registration has a lease identity: replacing an adapter disposes the previous registration, but its eventual old cleanup cannot remove the replacement, even if the adapter object is reused. Tick snapshots skip entries unregistered by an earlier callback. Pose arrays are copied per recipient. Unmount/interruption cancels an in-flight deposit before restoring the actor, preserving the carried ore; scene-owned state remains with the scene.

Verification: 42 tests passed across the registry/mine adapter, mine state, executable offers, interaction lifecycle, pickup approach and world recovery. Includes actual registered mine equip/scan/strike, movement cancellation, F-key put-down, mid-flight interruption/unmount, stale cleanup and invalid frame data. TypeScript and the eight-route production build passed; the existing chunk-size warning remains. This is a first functional dependency-inversion slice, not completed core separation: mine start-position metadata and other venue stores still occur in `WorldActors`; other venue registrants and general approach ownership are next.

## Batch 7: exchange registration and shared stance movement

The exchange scene now registers its own actor pose, accepted-action clock, stance request, carried-ticket state, hall-boundary cleanup and interruption lifecycle. `WorldActors` no longer imports exchange motion/play state. Exchange start metadata remains in the core pending the arrival/configuration migration.

Registry synchronization snapshots active ownership before notifying adapters. A venue's own action or carried item does not make it unavailable; a different occupied venue does. Mine and exchange use this rule, replacing their asymmetric availability cascade. Recovery explicitly identifies its interruption reason, allowing exchange to return its ticket while mine preserves its ore. Ordinary motion interruption only cancels the exchange action. Unmount clears pending exchange callbacks and visual samples.

Scene stance descriptors feed one generic walking/heading calculation, also used by the not-yet-migrated IBD action. The actor checks the real supported floor route before moving, stopping with feedback when obstructed. This does not yet consolidate every prompt, stance reservation and execution path. Registry carrying state now prevents entering a vehicle or vaulting while holding an exchange ticket; leaving the hall clears that session as before.

Verification: 81 tests passed across activity registration, actual exchange/mine adapters, exchange motion/play, mine state, world recovery, real Rapier pickup routes and IBD inspection/pack/crane regressions. Includes owner exclusion, stable occupation snapshots during cancellation, walking/heading settlement, zero-distance/invalid input, no-render exchange completion, interruption, boundary cleanup and unmount. TypeScript and the eight-route production build passed; the existing large-chunk warning remains. These results do not prove whole-world visual/feel/performance acceptance. No model, material, lighting or startup-quality changes.

## Batch 8: yard-owned inspection, crane clock and camera

The IBD scene registers inspection/coil/crane ticking, sample occupation, stance requests, interruption and the tray camera. `WorldActors` no longer imports IBD inspection motion, pack play, yard store or pack layout; the remaining IBD entrance is startup metadata. Camera collision sweeps, smoothing, occlusion and projection updates remain generic core operations. The yard supplies its original target/eye, 42-degree field of view and smoothing factor; no asset or lighting changes.

The activity contract separates movement locking from busy state. Holding a sample keeps the actor at the inspection stand while allowing the next measure/return command. Camera providers have explicit priorities and finite projection/pose validation. Removing a registration removes its camera and action ownership. Recovery/unmount clears the yard's transient control reservation and held silhouette without manufacturing inspection evidence.

Integration exposed an existing clock-ownership hazard: an idle open carton could feed a newly started coil/crane action into both pack and mechanism ticks. Its old carton-distance check could also cancel that action. The yard adapter now routes mechanism actions solely through their mechanism clock and suppresses the stale carton camera while they operate. A regression starts the real crane with a carton still open, checks one 0.25-second advance, reaches ready without hand samples and verifies recovery clears the reservation without awarding cargo movement.

Verification: 65 tests passed across generic activity ownership/camera priority, actual mine/exchange/IBD adapters, four complete IBD sample cycles, interruption/unmount/pause, inspection motion, pack play, crane control, G24 inspection poses, real camera collision and world recovery. TypeScript and the eight-route production build passed; the existing large-chunk warning remains. Player visual/feel and target-device performance acceptance remain separate; this migration does not complete global approach eligibility, core separation or collider readiness.

## Batch 9: factory input, operator stance and scene framing

The factory scene registers operator availability, exclusive console input ownership, approach descriptors, input clearing, recovery and camera framing. `WorldActors` no longer imports the factory store or reads `factoryStation`; its remaining factory imports supply startup and zone metadata. Console changes clear held keys, pending actions and pointer drag through the generic owner identity. Factory operations retain their existing scene clock; the actor registry never advances production a second time.

The common stance solver preserves the factory's 1.4 m/s cap, 0.04 m stop distance and 0.24 m heading transition. Factory consoles publish their existing 2.1 m range to the bounded real-floor route validator; ordinary pickup validation remains at 2 m. Explicit route limits outside 0..3 m or nonfinite values are rejected. A real Rapier test checks the outer workstation band and verifies that a wall still rejects the same route.

Camera providers preserve the machine, assembly, single/comparison test and dock/printer views, with 50-degree field of view and smoothing 6. Their explicit priority retains factory precedence over the inspection camera. Opening a console now shares its live eligibility predicate with its E offer; starting production rechecks actor availability, ground support, finite position and conflicting world modes. This is not yet the final unified pre-reservation route contract for every action.

Verification: 66 tests passed across all four scene adapters, input ownership/reset, all twelve factory station descriptors, dock/printer view switching, cross-scene occupation, grounded operation gates, blocked approach, unmount/recovery, batch transitions, factory operation mechanics, printer geometry, return carrier clearance, real-floor routes and world recovery. Recovery tests preserve already-extracted wheels while cancelling pending frame extraction, and prove that the actor registry does not advance the factory operation clock. TypeScript and the eight-route production build passed; the existing large-chunk warning remains. Model/material/lighting assets and Balanced startup are unchanged. Visual/feel/performance acceptance remains pending separately.

## Batch 10: camp occupation, towing limits and cleanup

The camp scene now registers its actor pose mirror, hand occupation, idle facing, suitcase locomotion constraints and interruption cleanup. `WorldActors` no longer imports camp prop state or names the suitcase. Occupation is distinct from busy/carrying: it denies a competing scene's actor availability without blocking walking, camp commands or the existing release-on-vehicle-entry behavior. Input-owner transitions release the active prop through the generic registry.

Suitcase towing preserves the original 2 m/s maximum and the 0.62 m slack / 0.12 m slowdown band. The core composes finite nonnegative speed limits and sprint permissions without knowing which prop supplied them. Ordinary input resets do not release held props; ride unavailability, recovery, console takeover and unmount do. The scene retains its existing pause, world-mode, target-switch and leaving-camp listeners, accepted-action clocks, safe dumbbell drop and physical suitcase collision handling. No asset, material, lighting or quality-setting changes.

Verification: 56 tests passed across camp lifecycle/commands/real Rapier body restoration, occupied actor self-exclusion and foreign mine denial, suitcase speed behavior, generic constraint removal, the existing mine/exchange/IBD/factory adapters, safe pickup routes and world recovery. TypeScript and the eight-route production build passed. Actual play feel and device performance remain unverified; 4341 is unchanged. This batch does not finish venue separation, terrain authority, collider provenance or the visual atlas.

## Next work

1. Inventory every `useInteractable` action's final success/cancellation gate; migrate palm-contact-gated pickups to an explicit accepted-action lifecycle while retaining their visible animations.
2. Extract venue state adapters out of `WorldActors` using that lifecycle; preserve the independent regional collider-readiness gate.
3. Inventory actual mesh surfaces and placement callers, then migrate build-produced mesh data region by region without changing silhouettes or material treatment. A single scalar height cannot represent both cave roof and floor; surface identity and vertical query origin must survive.
4. Introduce collision provenance alongside exported or generated geometry, then enforce full coverage once all regions are migrated.
5. Classify source-reading tests by purpose. Replace brittle implementation tests with behavioral or rendered evidence before removal; keep legitimate architecture/dependency checks. Add the fixed-view atlas and separate target-device timing.

The user requested GitHub consolidation on 2026-11-17. Batches 1–8 were consolidated into main through `79581acc`; batch 9 follows after its technical checks. The broader foundation program remains incomplete. 4341 remains on its prior candidate for this Git-only handoff. User visual/feel review remains separate from technical checks.
