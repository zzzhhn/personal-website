Three quarry props, exported and independently reimported.

| Asset | X / Y / Z dimensions in metres | Triangles | Materials | GLB bytes |
| --- | --- | ---: | ---: | ---: |
| detector | 0.311 / 0.443 / 0.206 | 2824 | 9 | 145956 |
| pickaxe | 0.565 / 0.880 / 0.090 | 1800 | 8 | 101388 |
| ore | 0.3087 / 0.3068 / 0.3005 | 334 | 5 | 25764 |

All socket rotations and scales are identity. Positions below are root-local, Y-up metres. The QA JSON also gives explicit 4 by 4 Y-up matrices and raw serialized GLB nodes.

| Asset | Socket | Position |
| --- | --- | --- |
| detector | grip_R | 0, 0, 0 |
| detector | scan_origin | 0.258, 0.235, 0 |
| pickaxe | grip_R | 0, 0, 0 |
| pickaxe | grip_L | 0, 0.17, 0 |
| pickaxe | head_contact | 0.32, 0.52, 0 |
| ore | grip_R | 0, 0, 0.15 |
| ore | grip_L | 0, 0, -0.15 |
| ore | release | 0, 0, 0 |

Right grip to pick tip is 0.6106 m. Ore release and bounding-box centre coincide with its root origin. Mineral strata and embedded mineral terminations use exactly `ore_mineral`; the three base stone materials and quartz are separate.

The builder saves editable components, reopens the native source, exports each prop, independently imports each GLB into a fresh scene, and checks bounds, evaluated triangles, finite coordinates, zero-area faces, winding, materials and sockets. A separate light JSON read-back checked raw serialized triangle counts and hashes, and added explicit socket matrices to the final QA report.

Internal visual review of the actual board passed: the wood shaft enters the forged head, the detector has a supported open sensor loop and dial, and mineral/quartz strata are visible. Metal wear and wood variation use geometry and material facets without image textures. The rock is deliberately faceted and its mineral band remains legible for gameplay recolouring. Runtime props are rigid; real G24 IK, contact timing, carrying/release and browser acceptance belong to the character/integration sessions. Each GLB has one named root in its default scene; harmless empty inactive native-scene records are also present.

Rebuild using the installed Blender in background mode, --threads 2 --python tools/world/alpha-mine/props.py. Run the workspace resource preflight and acquire /tmp/bobby-world-phase2-heavy.lock before rebuilding. The native file retains separate named editable components in one scene per prop. Runtime merges each prop into one multi-material mesh plus exact named sockets. props-qa.json binds the source, GLBs, serialized materials, bounds and sockets to SHA-256 hashes. props-board.png is rendered from the actual GLBs at relative metre scale; it is internal visual evidence, not user approval or G24 acceptance.
