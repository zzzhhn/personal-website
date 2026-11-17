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
| Interaction contract | One eligibility and execution path for every registered action; short safe approach; animation contact cannot silently veto an accepted action; cancellation and environment changes explicit | Shared entry implemented; Alpha six actions and cave lamp migrated; camp, mine and other adapters pending |
| Core and venue separation | Input, locomotion, vehicles, camera and interaction modules depend on generic contracts; no venue imports in controller; each region's actual collider readiness gates entry | Not migrated; current coupling confirmed |
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

Still pending: camp dumbbell and suitcase pickup/hold, tools and remaining venue-specific actions. Camp journal already completes without a palm-contact predicate but still needs the broader registry/lifecycle migration. This is not evidence that the global interaction contract is finished.

## Next work

1. Inventory every `useInteractable` action's final success/cancellation gate; migrate palm-contact-gated pickups to an explicit accepted-action lifecycle while retaining their visible animations.
2. Extract venue state adapters out of `WorldActors` using that lifecycle; preserve the independent regional collider-readiness gate.
3. Inventory actual mesh surfaces and placement callers, then migrate build-produced mesh data region by region without changing silhouettes or material treatment. A single scalar height cannot represent both cave roof and floor; surface identity and vertical query origin must survive.
4. Introduce collision provenance alongside exported or generated geometry, then enforce full coverage once all regions are migrated.
5. Classify source-reading tests by purpose. Replace brittle implementation tests with behavioral or rendered evidence before removal; keep legitimate architecture/dependency checks. Add the fixed-view atlas and separate target-device timing.

4341 and GitHub main remain the last accepted technical candidate until each new batch passes relevant checks. User visual/feel review remains separate from those checks.
