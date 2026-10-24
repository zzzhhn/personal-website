# Third-party resources

Allowed licences (spec quality-v3 section 7): CC0, CC BY 4.0, MIT, BSD, Apache-2.0, and the CMU motion-capture terms. Not allowed: NC/ND, research-only, or unclear licences. Raw third-party files are not committed; only processing scripts, download addresses, hashes and the exported result are.

## Character G24 (guide): motion

### CMU Graphics Lab Motion Capture Database

- Source: http://mocap.cs.cmu.edu/ (subjects 09, 16, 35, 75, 141, 143; ASF/AMC, 120 fps except subject 75 at 60 fps). Downloaded 2026-10-22.
- Licence (original text, checked 2026-10-22): "This data is free for use in research projects. You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form." Home page: "free for all uses." No SPDX identifier.
- Attribution (for the in-world Credits): The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
- What is used:

| G24 clip | CMU takes | Notes |
| --- | --- | --- |
| Walk | 35_01, 35_02, 35_03 (12 cycles averaged) | Start/stop only |
| Run (default move) | 09_01 to 09_09, 09_11 (10 cycles) | |
| Sprint (Shift) | 143_01, 141_01 (4 cycles) | |
| JumpStart, JumpAir, Land | 16_01 (16_02 kept as an alternate) | Standing jump; air poses sampled over the measured flight |
| RunJumpStart, RunJumpAir | 75_03 (75_02 kept as an alternate) | Running jump |

- Changes (derivative work, not a copy of the data): segment rotations and joint paths retargeted to the 18-bone G24 rig; space scaled by the leg-length ratio and time by its square root (Froude); then authored adjustments (stride/cadence scales to reach 1.54 / 3.6 / 6.2 m/s, arm swing/elbow/abduction clamps, knee limit, foot track and boot separation, flat-foot re-reference, Idle-stance feet in the standing jump and landing, offline contact bake). All values: `tools/world/guide/mocap_retarget.py` (CFG / ONE_CFG) and the build report.
- Affected files: `public/assets/world/guide/G24.glb` (sha256 0fa1c34f9942e6d5c5845e748b4195ce03970bac879fc151cae57985ca696c46; previous a75db2da8010c2b5771d7c3111bd09ab9e8fe534ea56bd935e7941440e885ccb), `tools/world/guide/blend/G24.blend`, `tools/world/guide/out/G24_uncompressed.glb`.
- Reproduce: `sh tools/world/guide/mocap/fetch_cmu.sh` (downloads to ~/.cache/g24-cmu and verifies the hashes below), `python3 tools/world/guide/mocap/prepare_clips.py`, then the Blender build `tools/world/guide/build_guide.py`.
- Original file hashes (SHA-256):

| SHA-256 | File |
| --- | --- |
| `2a8e2eda3c0d7d828566b2a9a8ab36b2b8b3864110574e8b73c8f069fded416c` | `35.asf` |
| `0743f4ea48e7e199cd56b2810b5ce81f8ede08d32ff79aa4e363c44cc4fe33aa` | `35_01.amc` |
| `c2573ac32712c503d0d957a4708e0f3488348269485cdc7b00266b44d116c903` | `35_02.amc` |
| `268e87ca19726fe03a66b4f792e3226706afe8a393ab1587a8794de6b43dc447` | `35_03.amc` |
| `be10dbce393fd60a2d322410032d618757afcc5bb2f7a508d887c5b0213f1897` | `09.asf` |
| `02c94e8c2d4d2ff05f9a784f06403700c2c9d7caedd9bd92b50284d1a05f2bee` | `09_01.amc` |
| `9e618b1c3897776e98485ad01509708b1e5190c76fc630ad6db9ccb12529b927` | `09_02.amc` |
| `2d2114dcc00c3e4d5f08b95e36a7e82883804d3dcfbcb1a4a5c976eebbc538b1` | `09_03.amc` |
| `8dab7838b13302ba49183cb506c25832d9ae398c229c690a6cdb580551064771` | `09_04.amc` |
| `291760ca4a0ad482400233e56862df39fb7de7018bbe16ad4657ff52cbf3b992` | `09_05.amc` |
| `d181d43ca32c8c2b3906f796e7670c8c679aa1767184d3a919540e7bb6d7382f` | `09_06.amc` |
| `123e5ebb29f428a6048a4bca264dcdae09d25d383bb8aed435fd32935c8bd2c9` | `09_07.amc` |
| `2529ea372b5604c0ba88aa0dfc52f0e52485d3072c70e3045fc70c137937ccfe` | `09_08.amc` |
| `7185ba29118fa01809e61a6a1e61c90d1ee5926f46d62977ba7ecee87e3a0a91` | `09_09.amc` |
| `061415f9a707270f9ad570ca904bb0478f02080a960811d6d47a3c104fd9de4b` | `09_11.amc` |
| `6d7207da3bb9eceeaa32f23fb641b69f5836d11242b00c052e7d64f0cbe20a35` | `143.asf` |
| `021bc69edce5ca9272ec71de6e38bb9bf2984d9467798467dc47858c7e86f795` | `143_01.amc` |
| `e32993b8079c0914ed4d865ad53f7b9646398808855233e6f650d4f4417df2bb` | `141.asf` |
| `f0127a9067895d4fc6e2c82c0c3e8329ab102e392c579e6eaad2e7661ad3d180` | `141_01.amc` |
| `2323f876564610f84bfbec9b90b8ebffb57515673b7f4a45b0fb0849af465bdb` | `16.asf` |
| `88cb269478dc81ada9645965b034c596731794ed266a8d58828271ed45e1ea7a` | `16_01.amc` |
| `0d0c9c84ebe3bb4f94dee7483d1d79c0a29bb9b64d5f0dccd52d87753d4f2584` | `16_02.amc` |
| `25961b3566d225039f87d5180c7a4da523382b252552a6478707dd5e2c1dd1e2` | `75.asf` |
| `7ec85e1fc37df2796413a6f288ecb7d5db87cbfcd7b2976984e74d8c3e6d39d9` | `75_02.amc` |
| `ac07c21a668b6f888f31e8810b20ba05dfd47ea5a22386e2e8bf55f8f8d1386b` | `75_03.amc` |

### G24 v3d additions (2026-10-24, character session)

Released file `public/assets/world/guide/G24.glb` sha256 `c72a74abcf4c65b2e2e465bf1822e69b74834d8959c6f9decd2f1f0c6367a983` (726,872 bytes Draco; was 0fa1c34f, 410,640 bytes); uncompressed proof `tools/world/guide/out/G24_uncompressed.glb` sha256 `265825dba74af1c293658c476c24f953d04ef36b50912f5f044ca32f3a9206b9`. Mesh, rig and the nine v3c clips are unchanged; six clips are added. Raw files stay in `~/.cache/g24-cmu2` and `~/.cache/g24-100style` (not committed); intermediate `~/.cache/g24-extra/g24_extra_motion.json` from `tools/world/guide/mocap/prepare_extra.py`.

| G24 clip | Source take (frames) | Licence | Changes |
| --- | --- | --- | --- |
| SitDown, SitIdle, StandUp | CMU 143_18 "Sit Down And Get Up" (hip-height events: down 0.758 s, seat 1.275 s, rise 2.525 s, stand 2.8 s) | CMU terms (above) | Same rest-offset retarget, Froude time scale and offline contact bake as the jump one-shots; pelvis travel kept relative to the seated frame; SitIdle = 0.6 s of the seated hold, played ping-pong. |
| TurnL, TurnR | CMU 69_16 / 69_18 "turn in place" (one 89 deg / 99 deg turn each) | CMU terms | Per-frame yaw removed (smoothed 13 frames) and exported as `yawCurve`; the runtime turns the body by the actual angle along that curve. Measured stepping kept; boots only clamped to the floor (no pin). |
| IdleLook | 100STYLE Neutral_ID.bvh, 10.05-11.9 s (a ~14 deg glance and back) | CC BY 4.0, credit "The 100STYLE Dataset - Ian Mason" (https://ianxmason.github.io/100style/, Zenodo 8127870) | BVH loaded by `bvh_motion.py`; retargeted like the CMU one-shots; feet at the Idle stance. |

Original file hashes (SHA-256): 143_18.amc `569b08c314d08e0d32e0474e2a69fc73f4c340f6cf773b174c06361250e2e9c5`; 69.asf `c3019031ae5789b1d43d3bba424229ac544ccc68bb8c06e7d67bf75b1c41605f`; 69_16.amc `2d9848b05cb7b69e7abe65f5405ec25f4971cfd764707560a3cb8bddad2afe91`; 69_18.amc `ab26d17f420194b74a0434ad1a9ac400f364f839298bb3a10f37e15b98e81429`; 143.asf as above; Neutral_ID.bvh `71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f` (fetched by HTTP range from the Zenodo zip, CRC checked, `fetch_100style.py`). Also downloaded and measured but not used in a clip: 143_02, 143_19, 69_17, 69_19 (CMU), Neutral_TR1 / FW / FR (100STYLE).

Credits text to add (ui session, Esc menu): "Motion: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu, NSF EIA-0196217) and The 100STYLE Dataset - Ian Mason (CC BY 4.0)."

Runtime transitions use inertialization (Bollo, GDC 2018) with critically damped spring decay after Holden's MIT-licensed reference code; the implementation is written here (`WorldGuidePhase.ts` GuideInertializer), no third-party code is copied.

### Considered, not used

| Resource | Licence | Decision |
| --- | --- | --- |
| Quaternius Universal Animation Library (free) | CC0 1.0 | Inspected only; its Jump_Start / Loop / Land split informed the state structure. No data used. |
| 100STYLE (Zenodo 8127870) | CC BY 4.0 | v3d: Neutral_ID used (IdleLook, above). |
| Ubisoft LAFAN1 | CC BY-NC-ND 4.0 | Excluded. |
| Bandai Namco Research Motiondataset | CC BY-NC 4.0 | Excluded. |
| Mixamo | Adobe terms, free but not open | Not used. |

The G24 mesh, rig, materials and helmet are script-authored in this repository (`tools/world/guide/build_guide.py`) and contain no third-party geometry.

## Environment: ground textures (worker 02, quality-v4)

The default island ground uses these as matte detail (Astra ruling, spec §13). `?groundPbr=0` switches back to the
procedural fallback, which loads no textures. Output-file hashes and per-asset metadata are in
`public/assets/world/terrain/SOURCES.json`. Further environment notes are in `docs/world/THIRD_PARTY-environment.md`.

| Resource | Source | Downloaded | License | Attribution | Changes | Affected files | Original file sha256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Grass004 (grass) | https://ambientcg.com/view?id=Grass004 (download https://ambientcg.com/get?file=Grass004_1K-JPG.zip) | 2026-10-22, 1K-JPG | CC0 1.0 Universal | None required | Color, NormalGL and Roughness resized 1024 to 512 px (Lanczos); NormalGL X/Y and Roughness packed into one RGB PNG; AO, displacement, .blend/.usdc/.mtlx not used. Applied as colour-preserving detail on the Art Lock vertex colour. | `public/assets/world/terrain/grass_albedo.jpg`, `public/assets/world/terrain/grass_nr.png`; used by `src/components/world/WorldTerrain.tsx` | zip `4b63495f459db8481f4d5144e4e9069345c81cf898cc71f2216f5dd3bb344469`; Color `9e1c60da44b34a9738b1256ba827541f097dc583521b1d281e61b5f4b4217bc5`; NormalGL `8014a81d896a5c589b60612a769bc39eb1213e48d96f6146f485ea36e9e9610f`; Roughness `706580983860f942e141acdd68c4128dd683be50fcc5d85b7c67a9a3a8c7bac0` |
| Ground054 (sand) | https://ambientcg.com/view?id=Ground054 (download https://ambientcg.com/get?file=Ground054_1K-JPG.zip) | 2026-10-22, 1K-JPG | CC0 1.0 Universal | None required | Color, NormalGL and Roughness resized 1024 to 512 px (Lanczos); NormalGL X/Y and Roughness packed into one RGB PNG; AO, displacement, .blend/.usdc/.mtlx not used. Applied as colour-preserving detail on the Art Lock vertex colour. | `public/assets/world/terrain/sand_albedo.jpg`, `public/assets/world/terrain/sand_nr.png`; used by `src/components/world/WorldTerrain.tsx` | zip `b325ec2f167dce95a0fabc61a2104641288cf20915419578c3efdb46200c563e`; Color `77c0b5ac13eead1420887c608b2c28209a1ae5ba70761bf29953aa23cf3dc31b`; NormalGL `473474b0e0570cfa757e35c13f073e7ee49389fb3e35dad4d5f06e5ce9a59234`; Roughness `e19b6c7d4ee3d8a6b6ea4ecc525a1a4e32681be969af134a2ee5c6071b9dcec9` |
| Ground037 (dirt) | https://ambientcg.com/view?id=Ground037 (download https://ambientcg.com/get?file=Ground037_1K-JPG.zip) | 2026-10-22, 1K-JPG | CC0 1.0 Universal | None required | Color, NormalGL and Roughness resized 1024 to 512 px (Lanczos); NormalGL X/Y and Roughness packed into one RGB PNG; AO, displacement, .blend/.usdc/.mtlx not used. Applied as colour-preserving detail on the Art Lock vertex colour (luminance only). | `public/assets/world/terrain/dirt_albedo.jpg`, `public/assets/world/terrain/dirt_nr.png`; used by `src/components/world/WorldTerrain.tsx` | zip `4e69db2b7251b1736fa70fe6fe4ab80d64bd220117dd5dd4c7caaead51c2574e`; Color `d92bec8a35b9cb16ec79b421ca0f572a7400286eae109beafa266629ef49a6cf`; NormalGL `ea59dbdcfa5bf2f28bdd4aa896d4e5f96c4cce5939100dcc6db4bbbcdebfe38d`; Roughness `3786b088e981aae562f06b6477972d379cffd09a5cc542ab42f9ffd94f9bcb0e` |

License evidence: the ambientCG license page (https://docs.ambientcg.com/license/) reads "CC0 1.0 Universal License",
checked 2026-10-22. No credit line or in-world Credits entry is needed.
