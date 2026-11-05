# Workshop contact audit, initial candidate

Read-only source audit requested after the first export. Coordinates below are metres in each station's local frame, +Y up; all share the unchanged coaster translation. This records the **initial exported candidate**, before the subsequent coordinator-authorized contact repairs. No Blender, browser, build or scene generation was run for this audit. Circular radius bounds are marked as envelopes; polygonal cylinders can fall slightly inside them. Rounded/bevelled shapes do not share the complete flat face of an equal-sized box.

## The actual physics authority

`workshopColliders()` supplies a complete cabinet cuboid `x=[-1.4,1.4], y=[0,1.36], z=[-1.15,1.15]` at every station, plus post / sign / carrier-rail boxes. `createWorkshopGeometry().contactSurface` adds **whole static workshopArt mesh parts whose maximum Y exceeds 1.36**, not just their top faces. Intake receives the separate two full channel-box proxies and nine roller meshes. Moving tools, handles and request capsules have no added collider. Foundation shoes, signs and carrier supports are not part of the contactSurface snapshot; their coarse solids come from layout.

Consequently, keeping these source files unchanged proves physics stability but does **not** prove that the new visible surface matches it. Several discrepancies below are inherited; several are introduced by the first craft candidate.

## Common bench and support discrepancies

| Surface | Old visible / physical | Initial craft visible | Finding |
| --- | --- | --- | --- |
| Worktop | Visible flat plate top 1.33; full cabinet collision top **1.36** over 2.8 × 2.3 | Crown centre top 1.33, top footprint 2.71 × 2.21, curved shoulders reach full width below | Both have inherited 3cm invisible floor; new shoulder narrows the coincident area further. Not aligned. |
| Cabinet openings | Full cuboid fills every space below 1.36, including under open plan/debug/rewrite spans | Split pedestals, open central spans and feet | A player/camera cannot traverse these visible openings. Existing physics can be retained only if they are clearly filled/guarded visually. |
| Lever base | Original moving pivot at `[.96,1.30,.75]`; no separate dynamic collider | New pivot journal reaches 1.375; mounting shoe reaches 1.345 | Journal rises 1.5cm above the 1.36 cabinet physical top without a corresponding surface. |
| Foundation | Old housing 3.1 × 0.3 × 2.65, top 0.30; no independent foundation contact | Same dimensions with bevels | Outer shoe margins beyond x±1.4/z±1.15 remain noncolliding, as before. |

## Intake

- Nine roller axes remain exactly `x=-.85→.4`, `y=1.42`, `z=-.6+.15n`, radius .07. Old 8-sided and new 24-sided barrels both reach top **1.49**, with different faceted intermediate surfaces. This is the closest retained useful contact datum.
- Physical channel proxies are `x=center±.06`, `y=1.34→1.62`, `z=±.825`, with centres -.96 and .52. Old folded outer channel occupies those x ranges. Initial new web is centred correctly, but each flange centre is `center-outward*.03`, so its x range is shifted **3cm inward**: left `[-.99,-.87]` instead of `[-1.02,-.90]`; right `[.43,.55]` instead of `[.46,.58]`. Top stays **1.62**, but parts of the old physical upper ledge are visibly absent and new material projects into the roller lane. Bevels shrink the exact top plateau further.
- Request rest root remains y=1.66. Its old/new lowest hinge-band envelope is y=1.455, which intersects the roller circular envelope up to 3.5cm wherever a hinge crosses a roller; the initial new carrier retains this inherited overlap. The main pan bottom is 1.485, only 5mm below roller top. Carrier horizontal path and its nominal travel root are unchanged, but this is not a proof of seated support.

## Lookup

- Three seat centres remain x `[-.7,-.12,.46]`, z=-.2. Old copper pan top is **1.565**, new copper crown top **1.54**, leaving 2.5cm of old pan collision above its visible rim. Rubber centre top is **1.63** in both. Old rubber top plateau x width .308, full z depth .37; new crown top footprint .27 × .30. The central seat height agrees, but old flat collision extends past the new rounded pad near the edges.
- Seat backs retain their central top **1.97**. Old arm top has radius envelope **1.765** (`1.73+.035`); new envelope **1.752** (`1.72+.032`), 1.3cm lower. Rounded shoulders and old housing chamfers differ.
- Scanner pedestal changes from top **1.99** to **1.95**, 4cm lower under an unchanged old contact mesh. Bezel radius grows .14→.15. Front cyan sensor ends at old z=.94 and new z=.90, leaving up to 4cm of invisible old front sensor contact. These are not exact envelope preservation.
- Moving ring root remains `x=-.7+1.15f, y=2.05, z=-.2`. Both major/minor radii .32/.045 are retained. The new ring's exact circular vertical envelope is **2.005→2.095**; the old 6-sided tube's sampled vertical extent is narrower (about **2.011→2.089**). It remains clear of the 1.97 back by at least 3.5cm. The ring itself has no physical contact mesh; saying its axis agrees does not mean its tube surface is identical.

## Plan

- Waypoint centres and central top **1.48**, plus socket top **1.5075**, are retained. New crowned/bevelled edges are narrower than old flat depth; old contact is still the old housing/box.
- Two old straight copper rails at `z=-.55,.30`, y=1.38, radius .035, were omitted visually but remain in contactSurface. The diagonal rail axes were raised from y=1.38/r=.045 to y=1.40/r=.035: envelope top **1.425→1.435**, leaving the old lower contact behind and adding visible material above it.
- New broad route bed top **1.39** has no old matching contact across its flat interior; the cabinet catches feet at 1.36, 3cm below that new visible plate.
- Moving marker root remains `[-.85+1.3f,1.65,.25-.75sin(πf)]`. Main carriage lower surface remains **1.55** at its centre, versus socket top1.5075, a **4.25cm gap** at waypoints. This gap is inherited; the new piece does not acquire a supporting contact merely by using the old root. New small bearings do not bridge it. The x-positive console begins at x=.78; marker maximum x=.625, so its main body clears it by .155.

## Debug

- Vice top **1.62**, motor body top **1.97**, and rail axes `x=-.98→.65, y=1.39, z=±.22`, r=.035, remain nominally the same. Bevelled corners have smaller visible areas than old collision.
- Copper loop was **not** exact: old torus arc `0→1.7π`, new tubular path `.15→1.85π`; same centre/radii, but the new endpoint changes from approximately `[-.6913,1.6216,-.42]` to `[-.6094,1.7174,-.42]`. Added/removed arc portions respectively lack / retain old contact.
- Moving repair root remains `[-.8+1.4f,1.65,0]`; main body envelope x=root±.175, y=1.55→1.75, z=±.14. At f=1 it reaches x=.775. Static motor begins x=.56 and has front z=-.08; the moving body enters its front-left lower area. This **visible overlap already exists in the original formulas**, and is retained in the first craft candidate. It should not be labelled a clear repair lane. The vice front z=-.17 leaves only .03 from moving-body rear z=-.14.
- The carriage bottom1.55 is about .125 above the circular rail top envelope1.425, so the initial added bearings do not make the load path meet.

## Rewrite

- Roller axes remain exactly x=-.83→.83, y=1.78, z=±.65, r=.15; axle endpoints x=±1.05. Both have circular envelope top **1.93**, but old 10-sided cylinders' actual facet peaks/bottoms sit inside it, while new 32-sided barrels approach it. Old contact therefore is not the exact new curved surface.
- Cast cheek central top **1.88** is retained, but new rounding removes more upper corner area than the old chamfer. New bearing collars reach y=**1.90** at x around ±.95, 2cm above the cheek contact top, outside the central barrel's x extent.
- Feed/exit tray central top **1.4425** is retained, with newly rounded edges. Old left feed wheel uses the same .25 circular radius envelope but a different polygon and x end (-1.02 old / -1.03 new).
- Moving paper root stays `[0,1.53,.6-1.2sin(πf)]`; paper plus print maximum y **1.59**, new barrel minimum circular envelope1.63, leaving **4cm** under the barrel throughout the z sweep. The paper does not collide with either barrel. Its bottom1.49 remains **4.75cm above tray top1.4425**, so it floats over the feed/exit tray rather than sitting on it, inherited from the original animation.

## Extract

- Three receiver bed tops **1.405**, channel-wall tops **1.50**, label tops **1.4425**, guide-carriage central tops **2.185**, vertical guide end y **2.10**, and head central top **2.19** remain the same. New bevels/rounded corners shrink visible top plateaus beneath the old flat contact.
- Added head-slot inserts protrude to z=-.6875, versus old head front z=-.715, so 2.75cm of added front detail has no matching contact.
- Output root remains y=1.53, z=.5f, x scale s=.2+.8f. Old/new body envelope y=**1.49→1.57** agrees; new added lens top is **1.581**, 1.1cm taller. At f=1 each body halfwidth .20 clears lane inner faces at ±.2275 by 2.75cm.
- During expansion, the left and right output bodies sweep through intermediate lane-wall x coordinates. At f=.5 the left body x=[-.48,-.24] crosses the static rail at x≈-.355. Body bottom1.49 is **1cm below rail top1.50**; therefore the inherited sweep intersects the top of the lane wall. The first craft candidate retains this and adds no corrective lift.

## Act

- Shared seat discrepancies are the same as Lookup.
- Original right press is a solid contact housing `x=.74→1.22, y=1.35→2.03, z=-.725→-.075`, plus front wheel and ticket. New visible C body removes much of the middle. Its apparently open throat still contains the complete original collision. This is a material interaction mismatch, not just a hidden pedestal interior.
- Old ticket plate top **1.5175**, print top1.529; initial new ramp top **1.4925**, print top1.5005. The old surface remains 2.5cm / 2.85cm above the visible one.
- The descending stamp root stays `[0,2.03-.4f,0]`, while its original and initial new **local x centre is -.7**, over seat0, not the press at x=.98. Original stamp bottom is `1.83-.4f` (end1.43); the new rubber face lowers it further to `1.816-.4f` (end1.416). Both pass through seat0's pad y1.55→1.63 during the latter part of the stroke. This is a confirmed inherited local-geometry placement bug, made 1.4cm deeper by the initial new face. Preserving a root path is insufficient; local stamp geometry must change.

## Overhead and bell

- Rail/post axes and sign locations agree, but the layout uses filled rail cuboids. New decorative I-like radial sections leave portions of the coarse solid empty. Their top flange envelope is y=3.795 versus the physical radial-box top **3.80**, 5mm low. The current whole-static collider is not an I-section mesh.
- Bell pedestal central top **1.30** agrees with the cuboid top; its rounded crown narrows from .8 × .8 to .68 × .68 at that Y, leaving physical top corners beyond the visible cap. The hollow bronze bell itself has no dedicated old contact; that was also true of the original small raised bell. It must not be reported as a matched upper collider.

## Conclusion and subsequent scope

The initial export is not contact-equivalent to the original visible machinery. The old physics contract is preserved, but there are inherited invisible support planes, new narrower rounded surfaces under the old mesh, omitted contact-bearing rails/loop segments, and two inherited moving-tool penetrations. The coordinator subsequently authorized fixes confined to the owned builder/adapter, keeping collider/layout/interaction and movement **roots** fixed while correcting local geometry and visible support. Those edits and their numeric checks must be recorded separately below; this initial-audit evidence is retained.

## Final candidate repairs and actual evaluated checks

The coordinator authorized the following repairs after the initial audit. All changes are in the owned native builder / candidate adapter. The original four geometry/layout/runtime/component files remain byte-identical with `b75c474`. Parent movement paths and durations remain unchanged; local moving geometry and one explicit saddle articulation change.

| Family | Initial craft defect | Final visible / moving geometry |
| --- | --- | --- |
| Every bench | 1.33 visible top below 1.36 physical top | Full 2.8 × 2.3 walking cap at **1.36**, including a flush Plan bed. Lower panel enclosures meet the cap and make the full cabinet physics visibly closed. No central under-bench passage is suggested. |
| Intake channels | Top1.62 but 3cm inward flange displacement | Full contact cap centred on -.96/.52, x ranges exactly `[-1.02,-.90]` and `[.46,.58]`, top **1.62**, without rounded-away upper edges. Roller top stays **1.49**. |
| Lever base | Added journal top1.375 beyond physical top1.36 | Journal radius .075→.060 around y1.30, so its upper envelope is **1.36**. Original moving handle origin/axis unchanged. |
| Lookup / Act seats | Pan top1.54, narrowed pad top | Contact-shaped pan top **1.565** and pad top **1.63** match the old six-point housing profile. Arms return to y1.73/r.035; back/pad crowns match1.97/1.90. |
| Lookup scanner | Pedestal top1.95 and sensor front.90 | Old contact-shaped pedestal top **1.99**; bezel radius .14 restored; cyan sensor at y1.77 ends at z **.94**. |
| Lookup moving ring | Descending carrier crossed ring despite clear final pose | Parent ring root still `[-.7+1.15f,2.05,-.2]`; ring local geometry moves z **0→-.30**, giving actual centre z **-.50**. Same circular shape/radii and root time, now clear of every carrier descent/return sample and tested clock lag. |
| Plan bed / fixed rails | New bed top1.39 and omitted old rails | Bed top **1.36**, straight rails restored, diagonal axes/radii restored to1.38/.045. Exact waypoint/socket contact tops **1.48/1.5075**. |
| Plan marker | Original body floated4.25cm and crossed carrier late in the stroke | A shoe local bottom **-.1425** touches1.5075 at each waypoint. The visible marker body sits .25m behind its parent point, joined by a low short cantilever. Parent x/z route and shoe centre are unchanged; the offset clears carrier throughout processing/return. |
| Debug fixed parts | Loop opening angle changed; rounded tops narrowed | Original arc **0→1.7π** restored. Vice and motor contact crowns at **1.62/1.97**. |
| Debug moving repair | Root reached motor; initial localz=.24 still failed under clock lag | Body localz **0→.55**, with low cantilever bridges to wheels at z=.22. Main body rear z **.41** clears carrier's maximum front **.385** by2.5cm independently of x/time. Motor/wheel front≤.04 is also clear. Wheel localx `[-.12,.02]` gives full-stroke axle extent **[-.945,.645]**, inside fixed rail **[-.98,.65]**. Wheel lower envelope **1.425** meets the new visible front rail's circular top. |
| Rewrite cheeks / trays | Raised new bearing top and floating thick paper | Bearing radius .12→.10 fits under cheek top **1.88**; tray top **1.4425** retained. Moving sheet becomes .012m stock, bottom **1.4425**, printed top **1.4565**; it sits on feed/exit trays and clears the roller circular lower envelope1.63 by17.35cm. This preserves the original below-barrel path; it does not claim a newly simulated paper nip. |
| Extract fixed parts | Narrowed receiver/head tops and protruding slot insert | Receiver bed **1.405**, wall **1.50**, label **1.4425**, guide crown **2.185**, head crown **2.19** retained. Slot decoration now only .5mm ahead of the old head face as a deliberate render separation. |
| Extract output | Expanding bodies crossed wall top by1cm | Body localy **0→.02**, giving minimum **1.51**, 1cm above wall top1.50 throughout expansion. Added lens top is **1.601**. Parent x scale / z route unchanged. |
| Act gearbox / ticket | Apparent open throat contained old solid collision; ramp2.5cm too low | Visible enclosed contact-shaped gearbox fills the old housing volume. Front wheel remains visible. Ticket platen top **1.5175**, raised print top **1.529** exactly restored. No apparently passable throat remains. |
| Act stamp | Stamp at x=-.7 passed through seat0 | Stamp local x **-.7→.98**, z **-.2→.23**, width .30/depth .24; face final lower plane **1.529**, on old raised print. Parent root still y2.03→1.63. Body rearz=.11 clears old wheel front=.07 by4cm; left stamp extent .83 clears last seat extent .675 by15.5cm. |
| Bell / carrier supports | Rounded bell top corners / nominal radial I section left coarse solids exposed | Bell full crown **.8 × .8 at1.30**; radial rail has an actual closed .30m spine with top **3.80** and real exterior flanges. Axes/sign planes unchanged. |

### Carrier and every phase

The root still uses all original five points, including intake1.66, overhead3.15 and tool1.60, with unchanged processing2.8s / return1.4s. The initial opaque capsule collided with machinery at its low final root and along intermediate descents.

The final document cassette keeps width .65m but uses depth **.23m**, local centre **[-.05,0,.27]**, and lower pan plane **+.003**. The depth change is a route-clearance repair: the initial deeper forward-left corner crossed Act's left post on the radial branch. It is not a performance simplification. The final cassette lower plane at a tool is **1.603**, above the highest Extract lens1.601 by2mm. Local x/z offset and the thinner profile also clear the seats, Plan marker, rewritten paper and Act machinery.

`RequestSaddles` is a real separately articulated source root. At intake, two foot planes are **1.49**, matching the roller top, with foot z range .085→.215 over the .15 roller. The steel supports are18mm thick. Their local x centres remain -.325/.225; the capsule is carried rather than resting its broad case on miniature seats.

The support root retracts vertically **.295m** with `min(1,carrierProgress*16)`, completing within the initial intake lift. It stays retracted across the hub/branch/tool descent, and deploys on the same final intake segment during return. The parent carrier translation/rotation and phase visibility are unchanged; no mesh is hidden to conceal a crossing. Telescopic upper guides make the stroke visible. The first attempted .35m stroke was rejected by actual evaluated bounds because it reached3.535 above the radial lower plane3.50. Final maximum transport height is **3.480000004**, leaving approximately **2cm**.

Every route's processing and return paths were checked at **801 poses per phase**, totalling **9,612** carrier poses. The check uses the actual modifier-evaluated part bounds from the final native builder, not nominal dimensions alone. **117** frozen layout/apparatus fixture boxes and **2,335,716** carrier/output part pairs produce no positive-volume AABB intersection. All other output families are included at their completed persistent positions. Ready/intake is the progress0 endpoint; idle/result hide the capsule by the existing visibility rule.

For static fixtures, the carrier trajectory and saddle stroke are piecewise linear. **31,590 exact swept-AABB interval checks** cover all motion segments continuously, including the1/16 saddle breakpoint. Processing and returning follow the same geometric segments in opposite order.

Separate original `useFrame` callbacks can observe adjacent clock values. The old clock accepts dt≤.25, so the final check additionally exercises child tool motion **25ms,100ms and250ms behind the carrier**, at201 samples per delay per tool, **146,529** additional part-pair checks. The prior debug z=.24 body failed this lag boundary; its final z=.55 body and low bridges pass. These are bounded CPU geometric checks, not browser frame-time or actual Rapier actor evidence.

### Remaining differences and review limits

- Accessible central upper planes and the highlighted full contact caps now coincide. Old cylinders are polygonal; denser new curved visible surfaces can lie a few millimetres outside the original facets between vertices. For example,8-sided intake radius.07 differs from its ideal circle by up to approximately5.3mm, and10-sided rewrite radius.15 by approximately7.3mm. Rounded vertical side corners also remain conservative coarse-contact approximations. This report does not claim complete triangle-for-triangle equivalence of every visible surface.
- Service face/slot overlays use deliberate sub-millimetre render separation; these are not new standing surfaces. Moving tools, handles, bell upper body and capsule still have no new actor colliders, as in the original gameplay contract.
- The simplified2,324-triangle ShadowWorkshop keeps actual upper open spaces and is a separate source root; it is not a simplified replacement for the visible near geometry. It still costs one main-pass nonwriting carrier plus shadow-view work. Actual shadow readability and GPU cost remain for the coordinator.
- Sampling of sine-driven relative motion and delay states is finite. Static carrier sweeps are continuous AABB checks; neither category is a full triangle-level physics simulation. Ordinary day/night views, every newly offset local mechanism, walking/jumping and actual frame windows remain unaccepted until coordinator review.

Final GLB SHA-256: `268fdd33212257f73e1ecf19addfb3b2a865e686f25ac8ea52c1495678f4cce2`. Source/export/runtime/contact receipts all refer to that final candidate. No further modelling is authorized in this lane after this delivery.
