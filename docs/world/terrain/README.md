# terrain 会话进度与实测

设计见 `DESIGN.md`。大证据在 `/Users/bobby/Desktop/3D-personal-world/evidence/terrain/`（仓库外）。

## 已完成（2026-10-24）

| 项 | 文件 | 提交 |
| --- | --- | --- |
| 铺装距离场（车行道并集 + R=6 m 闭运算）、边沟 / 斜面路缘 / 人行道 / 路肩 / 外缘倒角、冻结坡道与桥面、标线与斑马线、查询 `WALK_Y` `paveTopAt` `paveKindAt` `paveSample` | `WorldTerrainPaving.ts` | 975105c |
| 铺装渲染与碰撞（同源三角形，顶面 surface、外缘 solid），认领 `paved` | `WorldTerrainRoads.tsx`、`WorldDistricts.tsx` | 975105c |
| 北丘土路并入地形高度场（车辙土路着色），地形在铺装下封顶、在外缘填补 | `layout-v4.ts`、`WorldLandform.ts` | 975105c |
| 海岸：去掉 v3 停车湾窗口、南岸补一处小岬（湾岬间距最大 46.6 m）、海堤步道两端渐变 | `WorldLandform.ts`、`WorldTerrainPaving.ts` | f61a520 |
| 地形渲染 LOD（16 m 瓦片，28 m 内 0.5 m 网格，远处 2 m 块并与细瓦片缝合，0 裂缝）、铺装下不画地面、草与卵石上限 | `WorldTerrainLod.ts`、`WorldTerrain.tsx`、`WorldGrass.tsx` | 1272604 |
| 工具：`terrain-shots.mjs` `terrain-cost.mjs` `kerb-cross.mjs` `check-*.ts` | `tools/world/environment/` | 10ddd63 等 |

## 实测（4331，合并 integ `c6ee89c` 后）

- §12.6：`WORLD_V4_CASES=timeline,shore,furniture` 17/17；`ring,hill` 4/4。新岸 10 个落水点全部 dry-land，支撑 surface、不在水面上。家具四类撞前休眠、位移 1.3～4.0 m、抬车 ≤ 7.4 cm。
- map-graze 27 例：18 partial + 9 探针无效（G16 闭壳 trimesh 探针拿不到边界），与 `docs/world/quality-v3/playtest/map-graze/README.md` 记录的既有结果一致，目标在营地内，与本会话改动无关。修了脚本里一处等待竞态。
- 路缘跨越（`kerb-cross.mjs`）：人上、下路缘各 1.3 s，0 帧离地；三车以 7～10 m/s 压过路缘上人行道，车身抬升 ≤ 0.7 cm，无翻车。
- 接缝：铺装顶面 11.9 万采样点地形穿出 0；外缘倒角脚悬空 0、被埋 0；LOD 8 个视角裂缝边 0；草 18,922 / 卵石 740 候选落在铺装上 0。
- 预算（1920×1080，隐藏做差，含阴影 pass）：地形 + 铺装最坏（营地近景）8 call / 75.0k；草 + 卵石最坏（北丘）2 call / 37.5k。铺装全岛 17.1k 三角，距离场构建 0.43 s、网格 0.06 s（Node）。
- `npx astro check`：0 error。

## 给其他会话的接口

- 车行道顶面仍是 `ROAD_Y = 1.14`，人行道 / 路缘顶 / 楼前广场 `WALK_Y = 1.15`。**没有任何车行道物件需要改高度。**
- 边沟（路缘前 0.4 m）最低 1.04：不要把物件摆在车行道边缘 0.4 m 内；用 `paveSample(x, z)` 取真实顶面和类型。
- 楼前广场仍由 `pavedV4()` 的 forecourt 多边形定义；town 认领 `building-forecourt` 后本会话不再画也不碰撞它。
- 桥面、坡道、园区引桥、沙滩栈道、风车平台的几何与高度未变。
- 北丘土路不再是棱镜，路面就是地形（顶面 = `HILL_DRIVE_V4` 高度 − 0.14）。

## 未做 / 已知问题

- 地面质感第 3 项（沙纹、湿沙细节、坡面岩层、草扰动扩展到全岛）这轮没动；草扰动系统本来就是全岛候选、随焦点填充，但密度上限为预算下调到 2450 簇。
- 土路与环岛路交口的土 / 沥青过渡只靠路肩收边，近看是直线。
- J4、J5、J6、J7、J8 是停车牌路口，没有做斑马线；只有信号灯路口 J1、J2、J3 有。
- 大道港湾与停车场还没有车位线。
