# Bobby世界资产族总账（暂定口径）

2026-11-03；release `codex/world-craft-batch5-integration@7702c3d`。只读检查HEAD源码、旧注册表和batch/pilot文档，未起浏览器、Blender、构建、服务或网络。当前4341冻结包为 `/tmp/bobby-world-batch5-r10-fourteen-01a19a62`，交付依据为 [batch5协调接受](../asset-batch5-20261102/coordinator/ACCEPTANCE.md)。本次没有新做逐资产运行时加载验收。

**按可独立替换、独立验收的视觉模型/装配单元，工作账暂列136族：14族有专项精修及4341交付链路，57族制作过但仍需视觉复核/返修，65族未找到本轮专项精修证据。剩余质量闭环为122族，适合对用户表述为“约120族”，而不是只剩下一批十几件。** 人物与三款可驾驶车辆占4族，单列排除时剩118族。

这是第一次从当前入口向下核对的**全项目粗粒度总账**，不是已存在的正式全项目资产注册。这里136是明确清单在下述口径内的精确合计；建筑/工具/植栽套件的合理合并拆分可使规划总量约为120～150族，此范围是计数口径弹性，不是统计置信区间。更细的验收拆分可能改变分母，不能把136当永久硬指标。

## 怎么数与怎么判

- 能独立替换和验收的完整视觉模型/装配为一族。树种、大小、颜色、状态、规格、LOD及摆放实例不重复计数。壳/盖、桌/凳、机器内部可动件在固定装配内不拆分。
- 人物与三款独立车身单列，动作/门/座位修复不自动算整套模型精修。
- 纯shader、海水/风/光/粒子、碰撞代理、运行机制不计入建模分母。地表材质与ground-shoulder另记，未新增一个“模型完成件”。草丛有实际叶面几何，仍作为模型族计数。
- 状态1仅表示专项工艺和接入链路有证据，**不代表14族全部获用户最终审美接受**。Club7、Camp3、IBD4共14；用户明确接受的5族可追到吧台、日床、池灯、伞、运输箱；batch3九族没有在本次审计中找到单独的用户最终接受凭据。
- 状态2刻意保留“已做但未闭合”的工作，不能说成完全未做。也不能把所有旧程序化模型算精修：存在模型却缺本轮专项工艺证据的一律状态3。
- **用户最新反馈batch5效果不够明显，因此8街道＋5营地＋G17这十四项全部归复核。** G17仅是代表树样板，不能代表G16/G18与全部街树质量闭合。batch4主协调明确只接受有限增量，树、岩、草、奖杯架同样保留复核。

## 数字核对

旧 [assets-v1.json](/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/assets-v1.json) 有80 ID。本账完整映射至66个归并条目，62族进入当前建模分母、4条排除；再补充15个batch/pilot扩展模型族及59个当前源码装配族，得到 **62＋15＋59＝136**。排除项共4条，不混在136中。旧注册生产字段是早期快照，`integrated-candidate` 不用作本轮高质验收。

| 场景 | 在册族 | 已专项精修/接入 | 复核/返修 | 未见本轮精修 |
| --- | ---: | ---: | ---: | ---: |
| 全局与地形 | 7 | 0 | 0 | 7 |
| 街道 | 18 | 0 | 8 | 10 |
| 自然模型 | 4 | 0 | 3 | 1 |
| 人物与车辆 | 4 | 0 | 0 | 4 |
| 营地 | 15 | 3 | 6 | 6 |
| 城区 | 12 | 0 | 0 | 12 |
| 旧园区 | 13 | 0 | 0 | 13 |
| DJC Club | 12 | 7 | 4 | 1 |
| IBD工场 | 15 | 4 | 6 | 5 |
| Alpha矿场 | 8 | 0 | 8 | 0 |
| Alpha交易所 | 7 | 0 | 7 | 0 |
| 过山车 | 12 | 0 | 7 | 5 |
| Intent车间 | 9 | 0 | 8 | 1 |
| **合计** | **136** | **14** | **57** | **65** |

## 逐族清单

每行的源码与文档都已用 `git cat-file` 对HEAD存在性检查。源码是模型存在/路由证据；历史场景文档仅提供上下文时，不将其当作该族当前最终视觉接受。部分路径因sparse checkout未落盘，可用 `git show HEAD:路径` 读取。所有行的完整绝对语义、旧ID映射与证据限制见同目录 `inventory.json`。

### 全局与地形

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| G-landform | 岛体/崖壁 | G01 | 未见本轮精修 | `src/components/world/WorldLandform.ts`<br>`src/components/world/WorldTerrain.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| G-beach | 沙滩/浅滩实体岸线 | G02 | 未见本轮精修 | `src/components/world/WorldLandform.ts`<br>`src/components/world/WorldTerrain.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch4-20261102/coordinator/REVIEW.md`<br>地表shader有增量，岸线/沙滩模型结构未有本轮独立高质升级验收。 |
| G-road | 主路/支路/下降坡道路 | G04、G05 | 未见本轮精修 | `src/components/world/WorldTerrainRoads.tsx`<br>`src/components/world/WorldTerrainPaving.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 道路分支和坡段归同族。 |
| G-bridge | 连接桥实体 | G06 | 未见本轮精修 | `src/components/world/WorldLandform.ts`<br>`src/components/world/WorldTerrain.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| G-curb | 路缘石模块 | G07 | 未见本轮精修 | `src/components/world/WorldTerrainPaving.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| G-seawalk | 海堤/滨海步道实体 | G08 | 未见本轮精修 | `src/components/world/WorldLandform.ts`<br>`src/components/world/WorldTerrain.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| G-entry | 入口传送门装配 | G28 | 未见本轮精修 | `src/components/world/WorldEntry.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |

### 街道

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| G-seawall-rail | 海堤金属栏杆 | G09 | 复核/返修 | `src/components/world/WorldStreetFacilityCraft.ts`<br>`src/components/world/WorldStreetRails.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5用户反馈效果不够明显，列复核。 |
| G-lamp | 街道路灯 | G10 | 复核/返修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5用户反馈效果不够明显，列复核。 |
| G-barrier | 施工路障 | G12 | 复核/返修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5用户反馈效果不够明显，列复核。 |
| G-bin | 街道垃圾箱 | G13 | 复核/返修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5用户反馈效果不够明显，列复核。 |
| G-bench | 街边长椅 | G14 | 复核/返修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5用户反馈效果不够明显，列复核。 |
| G-year | 年份灯柱 | G11 | 未见本轮精修 | `src/components/world/WorldStreetYears.tsx`<br>`src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| G-billboard | 广告牌 | G15 | 未见本轮精修 | `src/components/world/WorldStreetBillboards.tsx`<br>`src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| G-windmill | 远景风车装配 | G29 | 未见本轮精修 | `src/components/world/WorldStreetLandmarks.tsx`<br>`src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| S-shelter | 候车亭 | 旧表外 | 复核/返修 | `src/components/world/WorldStreetFixed.tsx`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5已接入4341。 |
| S-signal | 交通信号机 | 旧表外 | 复核/返修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5已接入4341。 |
| S-timber | 山路木栏 | 旧表外 | 复核/返修 | `src/components/world/WorldStreetRails.tsx`<br>`src/components/world/WorldStreetFacilityCraft.ts` | `docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5已接入4341。 |
| S-stop | 停车标志 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |
| S-direction | 道路方向牌 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |
| S-chevron | 转弯警示牌 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |
| S-delineator | 反光导向柱 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |
| S-bollard | 防撞柱 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetFixed.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |
| S-guardrail | 道路金属防护栏 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetRails.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |
| S-parapet | 桥侧实体护墙/桥墩装配 | 旧表外 | 未见本轮精修 | `src/components/world/WorldStreetAssets.ts`<br>`src/components/world/WorldStreetRails.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 新增于旧80 ID登记之外。 |

### 自然模型

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| G-tree | 团簇阔叶树（全部尺寸/街树变体） | G16、G17、G18 | 复核/返修 | `src/components/world/WorldCamp.tsx`<br>`src/components/world/WorldStreetTrees.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch4-20261102/coordinator/REVIEW.md`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>G17完成batch5代表样板，G16/G18及街树仍是batch4树冠；不能把样板算全树族完成。 |
| G-bush | 团簇灌木 | G19、G20 | 未见本轮精修 | `src/components/world/WorldCamp.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 单/双团簇属变体。 |
| G-rock | 层理岩石（大小变体） | G21、G22、G23 | 复核/返修 | `src/components/world/WorldCamp.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch4-20261102/coordinator/REVIEW.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch4仅有限改善。 |
| N-grass | 草丛模型 | 旧表外 | 复核/返修 | `src/components/world/WorldGrass.tsx` | `docs/world/phase-2-playground/asset-batch4-20261102/coordinator/REVIEW.md`<br>batch4叶片形态增量；主协调指出仍偏硬偏宽，需视觉返修。纯风/踏压shader不另算族。 |

### 人物与车辆

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| G-guide | 向导B/角色骨骼 | G24 | 未见本轮精修 | `src/components/world/WorldGuide.tsx`<br>`src/components/world/WorldActors.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 角色动作修复不等于高质建模。 |
| G25 | 方正4×4 | G25 | 未见本轮精修 | `src/components/world/WorldVehicleAssets.ts`<br>`src/components/world/WorldVehicleVisual.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 车辆门/座椅/驾驶修复不等于整车高质建模。 |
| G26 | Fastback轿跑 | G26 | 未见本轮精修 | `src/components/world/WorldVehicleAssets.ts`<br>`src/components/world/WorldVehicleVisual.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 车辆门/座椅/驾驶修复不等于整车高质建模。 |
| G27 | 方盒厢式货车 | G27 | 未见本轮精修 | `src/components/world/WorldVehicleAssets.ts`<br>`src/components/world/WorldVehicleVisual.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 车辆门/座椅/驾驶修复不等于整车高质建模。 |

### 营地

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| C-ground | 篝火广场/土路实体 | C01 | 未见本轮精修 | `src/components/world/WorldLandform.ts`<br>`src/components/world/WorldTerrain.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| C-pad | 物件石板模块 | C02 | 未见本轮精修 | `src/components/world/WorldCamp.tsx`<br>`src/components/world/WorldTerrain.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| C-tent | 帐篷（大/小变体） | C03、C04 | 未见本轮精修 | `src/components/world/WorldCamp.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| C-books | 书堆 | C08 | 未见本轮精修 | `src/components/world/WorldCampContent.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| C-flags | 旗杆/旗帜装配 | C10 | 未见本轮精修 | `src/components/world/WorldCamp.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| C-tools | 工具墙装配 | C11 | 未见本轮精修 | `src/components/world/WorldCampContent.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| C05 | 石火坑/柴 | C05 | 已专项精修/接入 | `src/components/world/WorldCamp.tsx`<br>`src/components/world/WorldCampCraftProps.tsx`<br>`src/components/world/camp-craft-visual.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 |
| C06 | 原木长凳 | C06 | 已专项精修/接入 | `src/components/world/WorldCamp.tsx`<br>`src/components/world/WorldCampCraftProps.tsx`<br>`src/components/world/camp-craft-visual.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 |
| C07 | 书桌/凳装配 | C07 | 已专项精修/接入 | `src/components/world/WorldCamp.tsx`<br>`src/components/world/WorldCampCraftProps.tsx`<br>`src/components/world/camp-craft-visual.ts` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 |
| C09 | 奖杯展示架/奖杯 | C09 | 复核/返修 | `src/components/world/WorldCamp.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch4-20261102/coordinator/REVIEW.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 |
| C12 | 吉他 | C12 | 复核/返修 | `src/components/world/WorldCampContent.tsx`<br>`src/components/world/WorldCampFacilityCraft.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5五件列复核；C13握把/C15接触修补不代表用户总体质量接受。 |
| C13 | 哑铃 | C13 | 复核/返修 | `src/components/world/WorldCampContent.tsx`<br>`src/components/world/WorldCampFacilityCraft.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5五件列复核；C13握把/C15接触修补不代表用户总体质量接受。 |
| C14 | 炉灶/炒锅装配 | C14 | 复核/返修 | `src/components/world/WorldCampContent.tsx`<br>`src/components/world/WorldCampFacilityCraft.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5五件列复核；C13握把/C15接触修补不代表用户总体质量接受。 |
| C15 | 行李箱 | C15 | 复核/返修 | `src/components/world/WorldCampContent.tsx`<br>`src/components/world/WorldCampFacilityCraft.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5五件列复核；C13握把/C15接触修补不代表用户总体质量接受。 |
| C16 | 桌上提灯 | C16 | 复核/返修 | `src/components/world/WorldCampContent.tsx`<br>`src/components/world/WorldCampFacilityCraft.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch5-20261102/coordinator/ACCEPTANCE.md`<br>有制作/历史美术或主协调审阅记录，仍需用户按本轮质量目标视觉复核。 batch5五件列复核；C13握把/C15接触修补不代表用户总体质量接受。 |

### 城区

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| T01 | 国投证券楼 | T01 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T02 | WorldQuant楼 | T02 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T03 | MoE Capital楼 | T03 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T04 | ByteDance楼 | T04 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T05 | Video Rebirth楼 | T05 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T06 | 腾讯混元楼 | T06 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T07 | 第二排低楼 | T07 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T09 | 楼前展板 | T09 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T10 | 楼顶/立面招牌 | T10 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T11 | 混元楼发光环实体 | T11 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T12 | 城区棕榈树 | T12 | 未见本轮精修 | `src/components/world/WorldTownAssets.tsx`<br>`src/components/world/WorldTownCanvas.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| T08 | 楼前广场铺装实体 | T08 | 未见本轮精修 | `src/components/world/WorldTerrain.tsx`<br>`src/components/world/WorldTerrainPaving.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |

### 旧园区

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| P01 | 桥头入口广场 | P01 | 未见本轮精修 | `src/components/world/WorldParkWalk.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P02 | 栈道面/支柱装配 | P02 | 未见本轮精修 | `src/components/world/WorldParkWalk.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P03 | 栈道矮栏 | P03 | 未见本轮精修 | `src/components/world/WorldParkWalk.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P04 | 栈道灯柱 | P04 | 未见本轮精修 | `src/components/world/WorldParkLamp.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P05 | 园区总牌 | P05 | 未见本轮精修 | `src/components/world/WorldParkSigns.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P-hut | 展位小屋（A/B及项目变体） | P06、P07、P08、P09、P10、P11 | 未见本轮精修 | `src/components/world/WorldPark.tsx`<br>`src/components/world/WorldParkLayout.ts` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 P06 Alpha小屋已移除，P07..P11仍用共享小屋族；P06不额外算待做。 |
| P13 | 评审亭双屏/按钮装配 | P13 | 未见本轮精修 | `src/components/world/WorldParkExhibits.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P14 | 旧展位双唱盘DJ台 | P14 | 未见本轮精修 | `src/components/world/WorldParkExhibits.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P15 | 九格唱片墙 | P15 | 未见本轮精修 | `src/components/world/WorldParkExhibits.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P16 | 露营椅 | P16 | 未见本轮精修 | `src/components/world/WorldParkExhibits.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P17 | 椅间桌/灯装配 | P17 | 未见本轮精修 | `src/components/world/WorldParkExhibits.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P18 | 黑板/讲台装配 | P18 | 未见本轮精修 | `src/components/world/WorldParkExhibits.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| P19 | 项目小牌 | P19 | 未见本轮精修 | `src/components/world/WorldParkSigns.tsx` | `docs/world/assets-v1.json`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |

### DJC Club

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| D-bar | 北侧吧台建筑/家具整套 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubBar.tsx` | `docs/world/phase-2-playground/djc-runtime-20261101/RELEASE.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-daybed | 圆形日床/边桌整套 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubDaybeds.tsx` | `docs/world/phase-2-playground/djc-render-parity-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-lantern | 池边编织灯 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubLanterns.tsx` | `docs/world/phase-2-playground/djc-render-parity-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-umbrella | 独立遮阳伞 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubUmbrellas.tsx` | `docs/world/phase-2-playground/asset-batch2-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-lounger | 平躺椅 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubFurniture.tsx`<br>`src/components/world/djc-furniture-visual.ts` | `docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-console | Club DJ台外壳 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubFurniture.tsx`<br>`src/components/world/djc-furniture-visual.ts` | `docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-speaker | 监听音箱 | 旧表外 | 已专项精修/接入 | `src/components/world/WorldDjcClubFurniture.tsx`<br>`src/components/world/djc-furniture-visual.ts` | `docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 吧台内凳/植栽/吊灯属于其可替换装配，不按小件重复累计。 |
| D-pavilion | 主舞台/竹拱茅草主亭装配 | 旧表外 | 复核/返修 | `src/components/world/WorldDjcClubGeometry.ts` | `docs/world/phase-2-playground/djc-beach-club/refinement-20261027.md`<br>历史场景构造pass，未见本轮专门模型替换验收。 |
| D-basin | 泳池实体盆体/池岸装配 | 旧表外 | 复核/返修 | `src/components/world/WorldDjcClubGeometry.ts` | `docs/world/phase-2-playground/djc-beach-club/refinement-20261027.md`<br>水shader另列范围外；实体部分仍需质量复核。 |
| D-palms | Club棕榈植栽模型 | 旧表外 | 复核/返修 | `src/components/world/WorldDjcClubGeometry.ts` | `docs/world/phase-2-playground/djc-beach-club/refinement-20261027.md`<br>与城区棕榈是不同几何实现；有羽状叶造型pass。 |
| D-planting | Club低矮热带植栽套件 | 旧表外 | 复核/返修 | `src/components/world/WorldDjcClubGeometry.ts` | `docs/world/phase-2-playground/djc-beach-club/refinement-20261027.md`<br>保留组合植栽为一可替换套件，不逐叶/逐岛算。 |
| D-mirror | 镜球/舞台吊挂灯装配 | 旧表外 | 未见本轮精修 | `src/components/world/WorldDjcClubGeometry.ts` | `docs/world/phase-2-playground/djc-beach-club/refinement-20261027.md`<br>旧几何存在，未见本轮专项建模。 |

### IBD工场

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| I-transport | 可开盖运输零件箱 | 旧表外 | 已专项精修/接入 | `src/components/world/attractions/WorldIbdCratePart.tsx`<br>`src/components/world/attractions/ibd-crate-visual.ts` | `docs/world/phase-2-playground/asset-batch2-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 高低变体、放置实例、壳盖不另计。 |
| I-inspect | 拆检台 | 旧表外 | 已专项精修/接入 | `src/components/world/attractions/WorldIbdStaticCraft.tsx`<br>`src/components/world/attractions/ibd-static-craft-visual.ts` | `docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 高低变体、放置实例、壳盖不另计。 |
| I-utility | 接收/工具工作桌 | 旧表外 | 已专项精修/接入 | `src/components/world/attractions/WorldIbdStaticCraft.tsx`<br>`src/components/world/attractions/ibd-static-craft-visual.ts` | `docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 高低变体、放置实例、壳盖不另计。 |
| I-control | 控制柜/控制台 | 旧表外 | 已专项精修/接入 | `src/components/world/attractions/WorldIbdStaticCraft.tsx`<br>`src/components/world/attractions/ibd-static-craft-visual.ts` | `docs/world/phase-2-playground/asset-batch3-20261101/README.md`<br>专项精修、网页审阅与本地4341交付链路已有记录；不是新增用户最终审美签字。 高低变体、放置实例、壳盖不另计。 |
| I-shed | 工场厂房装配（coil/parts/dispatch变体） | 旧表外 | 复核/返修 | `src/components/world/attractions/ibd-yard-architecture.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>三种厂房按共用钢构建造系统归一族；若日后独立建筑美术目标不同再拆。 |
| I-site | 工场场坪/沟槽/道路实体 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/ibd-yard-site.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| I-truck | 装卸货车（含驾驶室） | 旧表外 | 复核/返修 | `src/components/world/attractions/ibd-truck-geometry.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>驾驶室做过样板；交接明确运行日夜审阅待接，不能把整车视为完成。 |
| I-crane | 桥式起重机/吊具装配 | 旧表外 | 复核/返修 | `src/components/world/attractions/ibd-yard-geometry.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>几何有绞盘/齿轮箱/夹具深化；缺当前质量验收。 |
| I-coil | 钢卷/移动托架装配 | 旧表外 | 复核/返修 | `src/components/world/attractions/ibd-yard-geometry.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>完整/损坏卷不按状态重复算。 |
| I-rack | 后库开放钢货架 | 旧表外 | 复核/返修 | `src/components/world/attractions/ibd-stock-craft.ts` | `docs/world/phase-2-playground/ibd-stock-craft-20261029/handoff.md`<br>v42构造pass；原交接待网页日夜接受。 |
| I-stockcrate | 静态仓储木箱 | 旧表外 | 复核/返修 | `src/components/world/attractions/ibd-stock-craft.ts` | `docs/world/phase-2-playground/ibd-stock-craft-20261029/handoff.md`<br>不同于可取样运输箱装配；静态箱同尺寸/实例合并。 |
| I-tool | 手持量具/检验工具套件 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/ibd-pack-geometry.ts`<br>`src/components/world/attractions/ibd-yard-geometry.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 量具上下颚归完整工具，不拆零件。 |
| I-sample | 机械样品（M6/M8等规格） | 旧表外 | 未见本轮精修 | `src/components/world/attractions/ibd-pack-geometry.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 规格变体合并。 |
| I-shutter | 工场卷闸门 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/ibd-yard-geometry.ts` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| I-sign | 工场导向/工位牌套件 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/WorldIbdSigns.tsx` | `docs/world/phase-2-playground/ibd-art-20261028/cab-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |

### Alpha矿场

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| A-quarry | 采石场岩壁/平台/入口实体 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx`<br>`src/components/world/WorldAlphaMineFoundation.tsx` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-vein | 矿脉模型（完整/破损/打开状态） | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx`<br>`src/components/world/alpha-mine-assets.ts` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-ore | 可携带矿石（因子变体） | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx`<br>`src/components/world/alpha-mine-assets.ts` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-detector | 探测器 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx`<br>`src/components/world/alpha-mine-assets.ts` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-pickaxe | 镐 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx`<br>`src/components/world/alpha-mine-assets.ts` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-rack | 工具架 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-pool | 结果池实体/回收架/显示站装配 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx`<br>`src/components/world/WorldMinePool.tsx` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |
| A-sign | 矿场信息牌 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaMine.tsx` | `docs/world/phase-2-playground/alpha-pilot/integration-status.md`<br>已做pilot原生资产/多轮美术，现记录明确不代表最终视觉接受；本轮专项精修未闭合。 |

### Alpha交易所

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| E-building | 交易所建筑/楼廊/栏杆 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |
| E-desk | 环形交易桌/CRT/银行灯装配 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts`<br>`src/components/world/alpha-exchange-interior-craft.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |
| E-archive | 档案柜/业务台/文件槽装配 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts`<br>`src/components/world/alpha-exchange-interior-craft.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |
| E-press | 清算压机 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts`<br>`src/components/world/alpha-exchange-clearing-craft.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |
| E-gallery | 楼廊读图控制台 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts`<br>`src/components/world/alpha-exchange-gallery-craft.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |
| E-bell | 交易钟/敲锤装配 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |
| E-clock | 后墙时钟/行情板装配 | 旧表外 | 复核/返修 | `src/components/world/WorldAlphaExchangeGeometry.ts` | `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`<br>存在历史crafted几何与独立装配；未找到本轮高质模型/最终用户接受凭据。 |

### 过山车

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| R-track | 过山车轨道/支架/连接结构 | 旧表外 | 复核/返修 | `src/components/world/attractions/coaster-geometry.ts`<br>`src/components/world/attractions/coaster-detailing.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>历史结构与连接深化；未见本轮高质资产闭环。 |
| R-train | 过山车列车 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/coaster-geometry.ts`<br>`src/components/world/attractions/WorldIntentCoaster.tsx` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 车厢重复实例合并。 |
| R-station | 过山车站房/候车厅 | 旧表外 | 复核/返修 | `src/components/world/attractions/coaster-geometry.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>有站房构造pass；交接保留参考差距及待真实日夜验收。 |
| R-equipment | 设备楼套件 | 旧表外 | 复核/返修 | `src/components/world/attractions/coaster-geometry.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>东/西服务体及设备楼按同建造系统合并。 |
| R-tower | 过山车服务塔 | 旧表外 | 复核/返修 | `src/components/world/attractions/coaster-thrill-tower.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-tower-art-handoff.md`<br>历史美术样板，缺本轮用户质量确认。 |
| R-tunnel | 过山车隧道壳体 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/coaster-geometry.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| R-lookout | 观景台/步阶装配 | 旧表外 | 复核/返修 | `src/components/world/attractions/coaster-lookout-sample.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-lookout-sample-handoff.md`<br>历史代表样板，未当作用户最终接受。 |
| R-landscape | 过山车崖壁/内场岩景 | 旧表外 | 复核/返修 | `src/components/world/attractions/coaster-landscape.ts`<br>`src/components/world/attractions/coaster-landscape-cliffs.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-infield-terrain-handoff.md`<br>与全局散布石块不同，为场景地形装配；历史地形美术待复核。 |
| R-flora | 过山车植被套件 | 旧表外 | 复核/返修 | `src/components/world/attractions/WorldCoasterVegetation.tsx` | `docs/world/phase-2-playground/overhaul-20261028/coaster-vegetation-handoff.md`<br>场景独立植被，树种/摆放不重复算。 |
| R-fence | 过山车外围护栏 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/coaster-geometry.ts` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| R-gate | 入口双扇门 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/WorldIntentDevices.tsx` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |
| R-chest | 宝箱/锁/钥匙整套 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/WorldIntentDevices.tsx` | `docs/world/phase-2-playground/overhaul-20261028/coaster-building-art-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |

### Intent车间

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| W-intake | 入料滚筒台 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-lookup | lookup扫描工位 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-act | act执行工位 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-plan | plan规划工位 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-debug | debug维修工位 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-rewrite | rewrite滚压工位 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-extract | extract分拣工位 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-carrier | 架空分支输送轨/中枢 | 旧表外 | 复核/返修 | `src/components/world/attractions/intent-workshop-geometry.ts`<br>`src/components/world/attractions/WorldIntentWorkshop.tsx` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>存在独立形体/承重与构造深化；contact/玩法验收不证明本轮高质美术完成。可替换整工位为单位，操作杆/零件不拆新族。 |
| W-capsule | 运载胶囊 | 旧表外 | 未见本轮精修 | `src/components/world/attractions/intent-workshop-geometry.ts` | `docs/world/phase-2-playground/overhaul-20261028/intent-workshop-contact-handoff.md`<br>本轮未找到专项精修/审图证据；已有正式或程序化模型不自动算本轮精修。 |

### 范围外

| 族ID | 模型/装配 | 旧ID | 状态 | 当前源码 | 文档/验收上下文与缺口 |
| --- | --- | --- | --- | --- | --- |
| X-sea | 海面/浅水材质 | G03 | 不计入 | `src/components/world/WorldWater.ts`<br>`src/components/world/WorldSea.tsx` | `docs/world/assets-v1.json`<br>`docs/world/phase-2-playground/asset-batch4-20261102/coordinator/REVIEW.md`<br>纯shader/水面机制不纳入建模分母。 |
| X-P12 | 旧研究台 | P12 | 不计入 | `src/components/world/WorldParkLayout.ts` | `docs/world/assets-v1.json`<br>EXHIBITS不再放置P12；归档登记不算当前模型待做。 |
| X-foundations | 三处预留地基 | F01、F02、F03 | 不计入 | `src/components/world/WorldStreetLandmarks.tsx`<br>`src/components/world/WorldStreetAssets.ts` | `docs/world/assets-v1.json`<br>同族尺寸/位置变体；规划占位不计本轮高质资产完成率。 |
| X-construction | 建设中牌 | F04 | 不计入 | `src/components/world/WorldStreetConstructionSigns.tsx` | `docs/world/assets-v1.json`<br>规划占位，不计本轮建模分母。 |

## 下一轮高视觉收益候选（18个族，不实施）

优先正常镜头的大轮廓与中尺度连接，先做清楚可比的代表机位，再扩大重复资产。

| 候选族 | 先解决什么 |
| --- | --- |
| G-tree 团簇树 | 枝干层级、冠层空隙与主轮廓，先把G17样板修到用户可见差异，再扩到其余变体 |
| G-bush 灌木 | 叶簇层次与地面接合，减少规则团块感 |
| N-grass 草丛 | 叶簇宽窄、弯曲与边缘疏密，单列几何，不用地表shader冒充 |
| C-tent 帐篷 | 布面受力、边缘厚度、门洞、营绳与搭接 |
| C-tools 工具墙 | 墙/挂点/工具轮廓的中尺度层次 |
| C-books 书堆 | 书脊、书页厚度与堆叠接触 |
| P-hut 小屋族 | 屋檐、柱梁、入口与墙板构造 |
| P02 栈道 | 板端、边梁、支柱与真实接头 |
| P03 栈道栏 | 柱脚、端头、横栏连续性 |
| T01 国投楼 | 主入口、窗深与立面体块层次 |
| T02 WorldQuant楼 | 与国投不同的主轮廓、窗带及材料尺度 |
| T03 MoE楼 | 普通视角可辨的入口、檐口、墙面构造 |
| I-shed 工场厂房 | 门洞/钢构/屋面/围护的承重和遮阴关系 |
| I-truck 货车 | 先复核已做驾驶室，然后整合车身连接与轮胎接地 |
| R-station 站房 | 登乘视角的屋檐深度、承重与开口 |
| R-train 列车 | 车体接缝、底盘、座椅与护栏轮廓 |
| E-building 交易所 | 正常入口视角的墙厚、柱廊、楼廊层次 |
| A-quarry 矿场 | 大岩壁破面、平台边缘与工具尺度关系 |

## 覆盖缺口与后续使用

- 这个分母已经覆盖当前 `WorldRuntime` 入口的营地、城区、旧园区、Alpha矿场、交易所、DJC Club和北部IBD/过山车/Intent车间。入口证据为 `src/components/world/WorldRuntime.tsx`、`WorldPark.tsx`、`attractions/WorldAttractions.tsx`、`attractions/WorldIntentDevices.tsx`。
- 对复杂场景采用完整可替换装配：Club北吧台含内置桌凳/灯/植栽，IBD三种厂房归共用建造系统一族，车间七工位按功能形体独立算，输送轨为一族。它们是最可能需要拆分/合并的边界；未来变更应改映射和分母，不能偷偷增减“已完成数”。
- 待查的是逐资产“本轮高质接受”而非文件存在。历史pilot/native、源代码craft函数、主协调接入、正常网页加载、用户审美接受是五层证据，不互相代替。尤其57项的成熟度不相同。
- 避免沿用未核对的模糊总量：本清单固定为136计入族＋4排除条目。将来需要正式完成率时，先锁定本清单的装配边界，再给每族补当前普通视角日夜/必要交互及用户反馈；无需先按GLB、节点、零件统计。
- ground-shoulder独立分支仅正午方向接受，夜间/踏压/成本未闭合，R10不包含；它是独立材质工作，不拿来冲模型数量。

本次仅写本目录的两份盘点文件；未修改生产源码、资产、运行服务或其他协作者文件。

