# Camp content (C11-C16, exit lamps, About interactions, bench seats) - design

Session: camp (wt/camp, codex/world-camp, port 4339). Read this first every turn.

## Frame and sources

- Ring pads: `CAMP_CENTER [-42, 4.8, 30]`, pad i at angle i*45 deg (+Z south), radius 15, top `PAD_TOP 4.9`,
  size 3.1 radial x 2.5 tangent. Same formula as `createLayout()` in WorldEnvironment (not exported);
  `WorldCampContentLayout.ts` mirrors it and a QA check compares it with the live C07/C09/C10/C06 colliders.
- Asset front is GLB +X (props convention). On a pad: yaw = PI - angle, so +X faces the fire.
- Taken pads (WorldCamp PAD_ORDER, unchanged): idx3 SW desk C07+C08, idx5 NW trophy C09, idx4 W flags C10.

## Pad reassignment for C11-C15 (frozen text only says one object per pad)

| ring idx | where | old PAD_ORDER | new | why |
| --- | --- | --- | --- | --- |
| 6 | N, at C03's real door | C11 tool wall | C13 dumbbells (0.15 m high, pushed to the pad's east half) | lowest object; keeps the door aisle and the default view of the big tent clear |
| 7 | NE, beside C04-east | C12 | C11 tool wall | both Art Lock camp refs put the wall on the NE side; its tangent plane stays ~2 m off the camera-to-tent sight line |
| 0 | E, at the exit lamps | C13 | C15 suitcase | travel object by the exit road |
| 1 | SE | C14 | C14 wok + stove | unchanged |
| 2 | S | C15 | C12 guitar on stand | faces the fire across the south benches |

## Per-asset budget (declared before modelling; skills: furniture start points, connected refinement)

| ID | size (m, GLB x*y*z) | tris target | collision class | mass |
| --- | --- | --- | --- | --- |
| C11 tool wall | 0.55 x 1.9 x 2.1 | 3,000-4,000 | hard (fixed trimesh) | - |
| C12 guitar + A stand | 0.55 x 1.05 x 0.45 | 1,500-2,200 | pushable, one body (guitar falls with its stand) | 4 kg |
| C13 hex dumbbell (x2 runtime) | 0.36 x 0.14 x 0.14 | 500-800 each | pushable, one body each | 10 kg each |
| C14 wok + stone stove | 0.9 x 0.95 x 0.9 | 2,000-3,000 | hard (fixed trimesh) | - |
| C15 suitcase | 0.30 x 0.72 x 0.50 | 1,000-1,600 | pushable | 12 kg |
| C16 hurricane lantern | 0.20 x 0.32 x 0.20 | 600-1,000 | none (sits on desk, 0.3 m, inside desk collider footprint) | - |
| L01 exit lamp post (x2) | 0.4 x 2.4 x 0.4 | 500-800 each | hard (fixed) - gate posts, a felled 2.4 m post would block the exit | - |

New total target <= 15k tris.

## Draw-call plan (<= 12 new main-pass calls)

One vertex-coloured matte material per GLB (role colours from the Art Lock palette baked as COLOR_0), plus:
C11 body 1 + label plates 1 (one canvas atlas) = 2... tools are in the body mesh; C12 1; C13 2 (two bodies, plain meshes,
never InstancedMesh so the static shadow merge does not freeze their shadows); C14 1; C15 1; C16 body 1; posts 1 (both posts merged);
glow 1 (lantern globe + both cyan lamp lenses, MeshBasic vertex colour, night scaled); light pools 1 (desk + exit ground, additive).
= 11, plus C11 metal? no - metal parts use a second vertex-colour material only where metalness differs (C14 wok iron) -> 12.
Feedback-only meshes (page flip, ring pulse) are invisible except during their <= 2 s effect.

## Interactions (useInteractable, kind 'exhibit') -> store.card = { kind: 'about', id, page? }

| object | id | i18n.ts source | feedback (<= 2 s) |
| --- | --- | --- | --- |
| C03 big tent (door threshold) | identity | UI.about.bio (+ src/content/about/bio.md) | canvas door ripple ring pulse |
| C07 desk + C08 books | education | UI.education.school / degree / period / expectedGrad / courses | page flips over the book stack |
| C09 trophy shelf | awards | UI.education.awards + UI.education.certificates | brass trophies glow up and back |
| C10 flags | languages | UI.education.languages | the four flags lift (rotation about hoist X) |
| C11 tool wall | skills | UI.about.techCategories (5 panels = 5 categories, same order) | hanging tools swing |
| C12 guitar | interests, page 0 | UI.about.bio interests (singing / music) | strings vibrate |
| C13 dumbbells | interests, page 1 | UI.about.bio (gym) | dumbbell rocks |
| C14 wok | interests, page 2 | UI.about.bio (cooking, zh bio[2]) | wok tosses |
| C15 suitcase | interests, page 3 | UI.about.bio (travel, zh bio[2]) | suitcase hops on its wheels |

Anchors keep >= 2.4 m apart (tent door vs N dumbbells is the tight pair).

## Seats

Four C06 benches x 2 seats at +-1.0 m along the log; position = seat top (from GLB) at the bench centreline; yaw faces the fire
(WorldActors convention yaw = atan2(-dz, dx)).
