# Alpha batch1 transport delivery · 2026-11-14

Functional source freeze: **0ac66c7**. Timber render revision: **ce956be**, capture guard/source **ff7fbab**. Worktree `/Users/bobby/Desktop/3D-personal-world/wt/alpha-batch1-travel`, branch `codex/alpha-batch1-travel-20261113`. All implementation is local; preview4352 remains running. Bobby's4341 was not changed.

The implementation provides a shared ride driver/actor/camera/ground adapter while retaining the legacy CoasterTransition. Cable/ferry request a physical return to the boarding terminal; sled requests continue to its safe lower terminal. Full standing capsule preflight and moving-segment guards prevent blocked boarding/exit, preserve control when entry is rejected, hold a blocked stand/walk-out and resume after removal. Camera portal, destination and direct-view checks remain distinct. Cable weather is a scoped lease, yields to actual menu choices including the same preference, and restores on cancellation/pause/hidden/camp/unmount. Ride/hand/wind cleanup uses explicit ownership.

Editable Blender sources, runtime GLBs and generated bounds are under tools/public alpha-island/transports. Floor routes, sockets and endpoints are read from scene-owned alpha-layout; shared dimensions drive native source, models, colliders and probes. `resource-hashes.json` contains exact assets and source/terrain/driver/ground/pier dependencies. Current asset SHA256:

- cable: `71861542f65eee832cf4fe4f56fc33d2910117467a51deba516fd1f53db54df6`
- sled: `954951b324cd062ab28c1b0147583fab913fbf37f407df9de5053feeca39c0ec`
- ferry: `0d4209c5ae42990b22f3f2436c1cc6ef426a39fca15cac1d76ba8dafd6d87b0d`

Owned runtime paths are rides/, alpha-island/transports/, attraction-ride/camera/obstruction adapters, the permitted CoasterActorFrame alias, WorldActors, WorldGuide/WorldGuideAttraction and WorldNight. Scene mounting, map/HUD/store/portals, layout/terrain and pier construction remain scene-owned; scene-authored pure pier extraction is included separately as efae8e2/b61674c. Coordinator-authored WorldApp weather-menu hookup is included. No original track, coaster timing or gameplay gate was changed.

## Machine verification

Machine: Mac17,8 / Apple M5 Pro /48GiB, Chromium157.0.8103.78 headless. No M3 Air16GB or real Safari result is claimed.

- Cable fc3c517: ordinary E/full route/physical release, blocked entry followed by free W movement, blocked stand and late walk-out obstacle recovery, Escape clock hold, actual menu clear/snow and preserved new preference. Final release grounded/Idle speed≈.000046m/s. Evidence: chromium-r6-fc3c517.
- Sled ace870a with committed954951b model: ordinary E/actual supported side step/full slope/requested safe terminal/release and W.832m. Actual safe-landing delta≈-1.43e-7m. Side step/sit/stand/day/night images. Evidence: chromium-r7-sled-ace870a.
- Ferry0ac66c7: ordinary E/real pier and carried treads/full outward sailing; island release+W.802430m; ordinary E reboard without teleport, travel E physically returns to island and releases; ordinary E reboard/full mainland return/release+W.876391m; camp clears ownership. Both releases inactive/completed/grounded/Idle. Island landing delta+.043941m/mainland≈0. Entry/exit canvas clips plus10Hz pelvis/sole traces are retained. Only the initial mainland-apron arrival is a QA teleport. Evidence: chromium-r8-ferry-0ac66c7.
- Runtime hashes and HEAD stayed unchanged; each accepted capture's source/assets were frozen. Ferry run additionally records clean src/public status and all3 actual browser response-body hashes, matching Git/disk/manifest. Known local `/api/events`404 is listed separately; no page/console/resource errors remained.
- Directed tests include legacy coaster10/camera8, generic driver/environment7, contact4, mechanical/camera guards, two-end fresh GLB capsule and real safe-landing checks. Sled1001poses×484 actual side rails/bents/fixed gangways:0 intersections. Ferry1049poses versus both bridges, real pier boards/posts/rails and2998 actual terrain triangles:0 intersections. These are discrete samples, not continuous proofs. Ferry4 contact/canopy/stance/hold tests and generic7 pass after its scoped stair repair. Current Astro check687files/0errors/0warnings. Earlier integrated R6 build passed; the final combined build belongs to coordinator acceptance.

## Visual-only timber finish

Four longitudinal staves,6mm real seams,1.8m staggered joints, visible8/12cm sides and fixed walkway stringers replace the flat brown bands. One owned wood material borrows existing facility PBR maps; no new texture asset file/light/global exposure change. Original route/collision/support/floor arrays and vehicle collider JSX match the0ac baseline byte-for-byte. Baseline/candidate lodge camera is exactly [173.6950056181824,7.467927011108555,160.59234391669108], same quaternion/FOV50, exposure1,1440×900 CSS/1728×1080 canvas, high, clear, noon/night. See planks-baseline-0ac66c7 and planks-candidate-final.

Owned visual8 geometries/1 material are disposed to0/0 and restored8/1. Single-frame draw/triangle counters increase for the board edges and shadows and are recorded in PLANK-CRAFT; they are not a performance benefit. Dynamic sea/cloud phase and a transient zone-title overlay differ, so these are matched-condition visual fixtures rather than pixel-diff proof. Author inspection confirms grain/seams/depth are visible; final aesthetic acceptance remains with Bobby/coordinator.

## Integration boundary

Launch `npm run dev -- --host 127.0.0.1 --port 4352`. Ordinary candidate `/world?layout=v4` currently mounts cable/sled. Ferry remains the explicit `/world?layout=v4&ferryFixture=1` candidate until coordinator promotes scene mounting and its boarding mask together. Current footprints ordinary18 / withFerry24, within32 shader slots. The earlier16 count predates the flat exit apron. QA camera/lifecycle views use qa=1 and are explicitly labelled fixtures.

Coordinator now owns the combined final-scene normal entrance traversal, same-version WebKit/Safari/M3/performance checks, one integrated type/build and final visual/user acceptance. Contact clips permit semantic animation review; passing numerical support checks does not certify every motion or all cancellation timings. No push/deployment or main-island replacement was performed. All traffic-owned Playwright/Blender/BVH/check jobs exited; only the static4352 Astro/esbuild server remains. Rejected R3/R6/R7 and ferry preflight/rail-sweep/IK candidates are retained and labelled; none is counted as a pass.
