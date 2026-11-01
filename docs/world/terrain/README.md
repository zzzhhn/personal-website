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

- 第 3 项已在下方续作完成；草密度上限仍为 2450 簇。
- 土路与环岛路交口的土 / 沥青过渡只靠路肩收边，近看是直线。
- J4、J5、J6、J7、J8 是停车牌路口，没有做斑马线；只有信号灯路口 J1、J2、J3 有。
- 大道港湾与停车场还没有车位线。


## 第 3 项交付（2026-10-24，基线 06b367e）

已合入 `codex/world-integ` 到 06b367e，保留其楼前广场表面/支撑修复。本次只动 `WorldTerrain.tsx`、`WorldLandform.ts`、`WorldGrass.tsx` 与本目录及 environment 工具。

### 结果

- 地面：默认 PBR 平滑法线、连续而克制的顶点明暗，远处粗网格不再被平直光照放大成折纸；干沙有扭曲沙纹、沙粒/矿物色差，近水有持续干燥渐变与随共享时钟往复的湿沙/回流线；现有岩坡有断续弯曲的岩层、颗粒和风化色。新增细节用颜色/粗糙度/法线，未加几何或贴图下载。
- 草：独立尺寸变化、叶脉与叶缘明暗、较克制的橄榄绿。踩踏贴图由 64 m 周期改成全岛有界 441×529、0.5 m/纹素，避免踩西岸却压到 64 m 外草地；人脚/轮胎须接近实际地面才扰动，跳跃/高架处不误压下方草。共享暂停时钟与自然恢复保留。
- 坚硬地形/支撑仍是既有 fixed trimesh，草和毫米级材质细节仍是非阻挡视觉；没有新增障碍、动态刚体、灯或实体。

### 实测通过

- 普通入口 `http://127.0.0.1:4331/world/`（无 query、`__worldDebug` 不存在）：从出生点以真实 WASD 走出营地到草坡、跨过环岛路和栈道到南岸，9/9 路点到达；1920×1080 默认/近景、黄昏/夜晚均拍摄。见 `detail-normal-final/normal-walk.json`。开发服务的 `/api/events` 记录接口 404 单列为 telemetryErrors；无页面/资源加载/着色器错误。
- 西部、南部草地实走：压草值 0.856/0.857，离开后约 4.5 s 恢复到 0；暂停 0.9 s 数值完全相同；64 m 外值为 0。越野车真实 W 开过草地 15.7 m，压草 0.923、5.3 s 后 0。空中 fixture 无压草。4/4 定向用例通过，见 `detail-trample-final/trample.json`。
- 与 06b367e 分别构建后比较 SHA256：terrain positions、indices、surface、solid 四个数组完全一致；道路文件没有改动。18,922 草候选与 740 卵石候选中，落在铺装上的为 0。
- 隐藏组做差，8 个采样视角：地形 + 铺装峰值 **8 call / 74,978 三角**（营地近景）；草 + 卵石峰值 **2 call / 37,530 三角**（北丘）。本次未增加 draw call/三角预算。整帧采样最高 216 call / 440,705 三角，仅代表这 8 个视角，不替代主线程最终预算。
- 踩踏纹理 GPU RGBA8 占用由 262,144 增至 933,156 字节（约 +655 KiB），CPU amount 同大小；只在有踩踏/恢复时上传。未测 M1、纯 GPU 时间或首屏网络时延；新增资源下载 0。
- 最终 `npx astro check`：207 files，0 error / 0 warning。未重复整套路线，由主线程在最终合并版本执行。

### 看图判断与自检

1. 已看普通入口 1080p 默认和近景；普通入口靠真实行走到草地/岸边，无传送。
2. 地面无新增灰盒原件；远处大三角光照明显缓和。画面仍能见到他人负责的灰盒树/街灯，未扩范围修改。
3. 沙地近景有毫米级纹理、草叶有明暗与大小变化；岩层由直线改为弯曲/断续，避免像整齐砖墙。
4. 黄昏、夜晚均看过，夜晚仍能读出沙纹，保持暗档。
5. 地形顶点与碰撞哈希一致；真人步行和车辆过草已验证，不增加空气墙。未重跑未改实体碰撞矩阵。
6. 人/车压草、恢复与暂停冻结都实测；湿沙使用同一时钟。
7. 未增加遮挡实体，人物/镜头无新增遮挡风险；未对未变树冠淡出重验。
8. 本区域预算按上述差分通过；整岛最终峰值/首屏/M1仍由主线程统筹。
9. Bobby 最可能说：“岩层像排齐的砖墙、草还是同一种。”本次已打断并弯曲层理，草加独立尺寸与叶面变化；整体美术最终仍需他试玩接受。
10. 此处按机器检查、看图判断和未验证项分开记录，不表示 Bobby 已接受。

大证据：`/Users/bobby/Desktop/3D-personal-world/evidence/terrain/{detail-normal-final,detail-trample-final,detail-rock-final,detail-rock-wet,detail-cost}/`。
小证据：`shots/detail-*.jpg`（全部原生 1920×1080、<400 KB）、`detail-checks.json`。

无需要审阅裁决的技术阻塞。保留已知的土路直线收边、停车位线未补；本批不扩展。
