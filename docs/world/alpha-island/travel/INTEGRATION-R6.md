# R6 integration evidence, pending browser verification

Scene-owned f750f56 (travel cherry68be548) adds the underwater berth basin without moving floor routes/sockets. Source6901034 and read-only camera104e9ba are included, as is coordinator weather UI d4dfdd3 (travel41157b5). Weather environment fdab31b makes any explicit menu choice yield, including clicking the already-selected clear preference. Core engine/asset dimensions are those of faaa697; twelve-centimetre sled shell/bents are6944cce. Exact current asset/source/terrain hashes are in resource-hashes.json.

R6 ferry geometry checks passed:
-501 poses ×1986 unique lower-hull/fender vertices:minimum ground clearance+.724183m (mainland stern; same vertex is no longer the island failure).
-The complete runtime GLB against2704 actual old+Alpha terrain triangles and2 conservative solid envelopes for the mainland boardwalk and mainland pier platform:501 poses,0 mesh intersections.
-Actual terrain vertices inside the ship's closed displacement hull were separately rejected, catching containment that surface intersection alone can miss;0 containment failures.

These are discrete samples and conservative structural fixtures. They do not establish a continuous swept-volume proof, loading/runtime appearance, ordinary-entry accessibility or boat acceptance. The old r5 failure remains recorded. The next browser window will exercise the actual scene with E and physics release.

Integrated candidate build: `npm run build` completed in6.36s. Astro check after correcting the4 transport type errors reported679files/0errors; the subsequent pure weatherUI and source-only reachable-hand changes were also included in the successful build. Baseline6 errors were fixed separately by coordinator commit8efd5ce, not masked or relaxed. Logs are kept under evidence.

Verification machine:Mac17,8, Apple M5 Pro,48GiB RAM. This is not the target M3 Air16GB or a real Safari acceptance run. Chromium/WebKit results remain separate, and no performance improvement is claimed from geometry tests or this build.
