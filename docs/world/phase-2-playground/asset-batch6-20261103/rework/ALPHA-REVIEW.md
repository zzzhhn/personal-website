# Alpha 线 15 族复核与首组安排

2026-11-03。当前 checkout：`personal-world-djc-release`，分支 `codex/world-craft-batch6-coordination`，实际 HEAD `cb82d7c7bff39411d176def22cbb4d67622673dc`。本报告仅作复核、路径核实和下一轮制作派工，不变更总账状态，不代表新资产制作或视觉通过。

## 范围与证据边界

覆盖 `REWORK-QUEUE.json` 的 alpha 线 15 个唯一 ID：矿场 8 族、现有交易所 7 族。矿场对应 WorldQuant BRAIN 经历；现有交易所对应 Alpha Agent 项目。交易所高山新岛方向本轮没有确定布局，本报告只提取可复用部件并安排现有资产质量复核，不能算新岛交付。

已读取当前源码、GLB 的 JSON 头、布局合同、生成脚本和指定历史交接。下文「已确认」指文件事实或注明出处的历史观察，「待确认」指需要当前实际画面验证的假设。本轮没有打开图片、浏览器、Blender、图像服务或 viewer，没有构建、运行玩法或重新测性能；旧图片只核实路径存在，未把旧作者的看图结论冒充本轮亲眼观察。

使用最新 `blender-material-craft` 及其 `forms-and-materials.md`、`review-and-runtime.md`，尤其 runtime material-path check；视觉判断沿用 `integrate-design`。保留切面风格、角色尺度和当前布局，只精修具体资产，不改游戏状态、请求、角色、全局灯光、地形或既有碰撞／动作合同。

历史依据：

- `docs/world/phase-2-playground/alpha-pilot/integration-status.md`：明确仍非最终视觉接受；记有阶梯侧壁轮廓待精修、回收缺完整返回动画。后者属于机制／动画范围，本轮不修。
- `docs/world/phase-2-playground/alpha-pilot/quarry-v4-layered.md`：首轮矿带过宽、断口及坡脚过整齐后继续修正；最终近景仅被主线接受为待浏览器验收候选。当前静态／矿脉 GLB 哈希与该文最终版一致，不能继续把已修的首轮问题判为现存缺陷。
- `tools/world/alpha-mine/props-evidence/README.md`：探测器／镐已有结构连接和独立导入的内部审图记录；不等于本轮用户接受。README 的单一矿石统计已旧，当前 `ore.glb` 是三个雕刻变体。
- `docs/world/phase-2-playground/alpha-exchange/implementation-20261027.md`：原文声明未浏览器验收，且描述过旧的多桌／28 CRT 方案。当前源码已经是环桌、两个操作 CRT、档案／清算／回廊分区，故旧数量和几何统计不再当当前事实。

## 当前资产与消费路径

下列源、脚本、GLB、文档均在当前 checkout 实际存在。本轮没有遇到需 `git show` 才能读到的 Alpha 路径。现有原生文件只核实存在，未启动 Blender 重开验证。

| 路径代号 | 当前 source → 实际绘制路径 | 材质边界与适配注意 |
| --- | --- | --- |
| M-static | `tools/world/alpha-mine/geometry.py`、`build.py`、`refine.py` → `batch1.blend` → `public/world/alpha-mine/quarry-static.glb` → `/world/alpha-mine/layout.json` 的 `staticAsset` → `WorldAlphaMine.tsx:MineAssets` 的 `GLTFLoader`／`withWorldAssetDecoder` → `cloneVisual` → `primitive` | 仅 `AM_ground/AM_stone/AM_wood` 被 `WorldMineMaterial.ts:mineSurfaceMaterial` 包装；其余 glTF 材质保留。包装经 `WorldCraftMaterials.ts:craftMaterial` 克隆并显式串接 shader hook，保留标准 PBR map，新增局部 grain／roughness／night 响应。静态按角色合并，工具架不是独立 runtime GLB。 |
| M-vein | `veins.py`、`refine.py` + 当前宿主 `batch1.blend` → `veins.blend` → `public/world/alpha-mine/veins.glb` → 同 loader → `MineVein` 各根 clone → `primitive` | `AM_vein_host` 经 `mineSurfaceMaterial(authored,m.socket)`；`AM_mineral_*` 为独立克隆的 glTF PBR 材质。未揭示时色彩向灰色混合 90%，三态按节点切换，不能为提升美感取消隐藏身份。 |
| M-prop | `tools/world/alpha-mine/props.py` → `props.blend` 的独立工具场景 → `detector.glb/pickaxe.glb` → 同 loader → `MineRack` 的 `cloneVisual`；手持／腰挂另经 `WorldGuideMine.ts:installAssets` 的 `object.clone(true)` | 工具保留 glTF 多材质，并未套 `mineSurfaceMaterial`。两 GLB 当前仅 POSITION／NORMAL，无 TEXCOORD、无图片。`props.py:export` 明确 `export_texcoords=False`。若引入木纹／粗糙度贴图，源、export、架上和手持消费都须一起验证；不能假设已有 UV。 |
| M-ore | `props.py` + `ore_variants.py` → `ore-variants.blend` → `ore.glb` → `factorOreSource` 选三个根 → `useOre` 克隆／着色；手持另走 `WorldGuideMine.installAssets` | `ore_mineral` 是身份色槽；拾取、携带、投掷必须同变体。当前无 UV／图片，5 个 PBR 色／粗糙度／metal 槽。`useOre` 对单材质 Mesh 克隆；不要顺手重排 mesh／材质数组，或把自定义 shader hook 的复制当作既定事实。 |
| M-foundation | `alpha-mine-foundation.ts:mineFoundationSurface` → `WorldAlphaMineFoundation.tsx` → `ParkGeo`／`mergeBatch` → `parkMaterial()` | 入口承托和接驳是独立运行几何，不走矿场 GLB 的材质适配。地形／地基不在首组修改范围。 |
| M-pool | 池体由 M-static；水面由 `WorldAlphaMine.tsx:MineWater` → `createPoolWaterMaterial`；回收架和 A/B 牌为该文件 JSX；结果由 `WorldMinePool.tsx` → CanvasTexture → MeshBasicMaterial | 实体石／木、局部 JSX MeshStandard、水 shader 和结果画布是四种消费，不能只修静态 GLB 就声称整个结果池已升级。结果／失败文案与请求属于冻结接口。 |
| M-sign | `WorldAlphaMine.tsx:MineSign` → JSX box＋CanvasTexture plane → MeshStandardMaterial | 信息牌不是旧 GLB 牌的替换文件；当前语言刷新、牌面和实体支撑均由 JSX 生成。保留卡片／互动位置。 |
| E-body | `WorldAlphaExchangeGeometry.ts:buildAlphaExchangeGeometry` + 对应 `alpha-exchange-*-craft.ts` → `add`／`toBatch` → 新增 `aExchangeSurface` → `mergeBatch(parts,false)` → `bakeExchangeWorklights` → `WorldAlphaExchange.tsx` 的 architecture mesh → `exchangeCraftMaterial()` | `WorldParkKit.ts:toBatch` 删除非 position／normal 输入属性，再生成 color／aEmit；UV／原材质组不会保存。`aExchangeSurface` 明确写回并驱动 roughness／metalness；共享 park hook 提供夜间 emission。**当前不是 GLB 加载路径**，新 native/GLB 若无窄适配器便不会进入画面。不得先铺整套贴图后才发现通路丢失。 |
| E-face | `WorldAlphaExchange.tsx:texturePlane`／CanvasTexture atlas → `mergeGeometries(planes)` → 独立 MeshStandardMaterial（map／emissiveMap） | 显示图集有独立 UV 路径，不经过 E-body 的 `toBatch`。保留文字、历史日期和按状态重绘，不能烘焙成假行情。 |
| E-moving | `WorldAlphaExchangePlay.tsx` 的独立几何 → `brass`／paper／ink／paperFace 材质 → 原 refs／动画 | 铜材质由 `WorldAlphaExchange.tsx` 创建（metalness .55／roughness .42）；压印、拉绳、铃身等独立动画不能合进静态 shell。 |

本轮 GLB 头读取确认：静态与矿脉均有 UV0、两张嵌入图片、法线贴图；没有 occlusionTexture。矿脉宿主与静态材质路径保留既有图像，不可笼统判成「纯顶点色」。工具与矿石没有图像不构成已见质量缺陷，只说明后续表面升级的接线成本。

| 当前 GLB | SHA-256 | bytes |
| --- | --- | ---: |
| quarry-static.glb | `61b22e1fd5cc1572df088946dfbf366fe3ca14fc39166e4cf3e23858b0aea10d` | 2301720 |
| veins.glb | `ebcc25eb7bf2f1a32a22b359c4f341b191db09213963a2ff884df8fae5ce43b3` | 1077004 |
| ore.glb | `f07e36cb0e88e06c68aa2267e370d0211bcd1a69b5bb9bc3a15aaac25a7af94c` | 67084 |
| detector.glb | `486065b47765528a13456ba481b230f179dd9cf72074483f3375069eb8d2ed13` | 145956 |
| pickaxe.glb | `d503fae7675e0ec7f80613b130d83834b88de3c94fa640249d0589683aaf80c4` | 101388 |

## 逐族复核

分类不是互斥评分。「历史问题」只在有明确原文时使用；「证据缺口」均需当前实际画面，不能直接推断资产失败。目标列是下一轮候选改善目标，非本轮已见缺陷。

| ID／族 | 当前结论与可复用旧件 | source → runtime | 候选可见目标与最小范围 | 冻结合同／所需复核图 |
| --- | --- | --- | --- | --- |
| A-quarry／岩壁、平台、入口 | 有历史侧壁阶梯轮廓待修记录；v4 已修首轮矿带和断口，当前仍缺普通视距实机对照。复用分层岩体、桥梁、已有 UV 和两张石材图。 | M-static + M-foundation | 下一组先核查岩壁大轮廓及桥脚接触；仅在实机确有弱项时修对应岩体，不用微裂纹或提高曝光代替轮廓改善。地基、岛边和入口承托不动。 | 固定三层 y=0/3/6、坡道／两出口、桥净空和当前 colliders；入口眼高、岩壁斜侧、桥接触及相同日夜图。 |
| A-vein／完整、破损、打开 | v4 曾修矿带宽度与宿主衔接，当前哈希对应最终候选；没有本轮状态对照。复用宿主投射和三个状态根。 | M-vein；静态周边矿带属 M-static | 首组。让正常站位可见完整→裂开→凹入的中尺度形变，矿物脊／宿主边界有真实厚度与嵌入关系；不只增加碎粒。最小改 `veins.py` 的三态视觉及其导出，必要局部材质适配。 | 三层 socket／stand／oreRest、九个 stateImpactSockets、命中数与揭示逻辑不变；三态同机位＋宿主斜侧接缝＋夜景。 |
| A-ore／携带矿石 | 三雕刻变体实际存在；旧 props README 的单石数据不可复用。仅缺当前手持／落台视觉证据，未确诊缺陷。 | M-ore | 复用现有三型；后组核查普通手持距离的矿物体积和石／石英响应，如确弱再修相应壳体。避免把纯换色算新族。 | 三根、身份色槽、grip_R/L、release、catch／rest／carry／throw 一致；三型并列、手持、落台、飞行静帧。 |
| A-detector／探测器 | 有历史内部结构审图，当前无 UV 为已确认接线约束；没有当前用户视距证据。复用开环、指针、壳体、线缆和握点。 | M-prop，detector | 首组。普通取工具和手持视距分得出黄铜壳、铁环、皮握把，表盘边沿有厚度和可读明暗；保留现有轮廓，不靠新增小螺钉证明提升。局部 PBR／UV 与必要中尺度边缘调整。 | `grip_R=[0,0,0]`、`scan_origin=[.258,.235,0]`，根名／尺度／方向和扫描状态不变；架上＋手持扫描＋表盘斜侧＋日夜对照。 |
| A-pickaxe／镐 | 现源已做连续镐头、木柄入眼、包皮、铆钉。没有本轮表面／动作接触图；不能称目前头柄悬浮。 | M-prop，pickaxe | 首组。木柄纵向材质、包皮握段、锻铁头与工作刃反射宽度有区别；入眼和刀刃轮廓在站位可读。优先材质／少量断面改善，不改变镐长和刃尖。 | `grip_R=[0,0,0]`、`grip_L=[0,.17,0]`、`head_contact=[.32,.52,0]`，0.6106 m 右握点到尖端、挥动轨迹／时间不动；静置、举起、命中、回收四姿及侧面日夜图。 |
| A-rack／工具架 | 几何中确有双侧 A 形支撑、三横梁、五背条与两个短挂钩；尚未看当前工具实际挂接。复用架体和布局。 | `geometry.py:architecture` 的 `AM03_tool_rack/tool_hooks` → M-static；挂工具走 M-prop | 首组。正常靠近时能看清挂钩如何承工具、横梁如何落到支脚、木与金属不是同一响应。只修架体连接和表面，不另造工具。注意源部件最终按材质合并，不能用 runtime node 名假定能单独替换架体。 | center `[-8.8,0,-3.6]`、approach `[-8.8,0,-2.55]`，detector `[-9.35,1.05,-3.3]`／pickaxe `[-8.2,1.05,-3.3]` 不动；满架与取空同机位、挂点斜侧、脚地接触＋日夜。 |
| A-pool／池体、回收架、显示站 | 历史回收缺返回动画属已知机制限制，本轮冻结；池体和显示质量仅缺当前证据。复用池沿、水、三回收位和双结果位。 | M-pool | 后组核查石池沿厚度／回收台承托和显示框与水面的层次，按真正弱项局部返修。不得替换结果曲线或顺手修请求。 | basin 参数、投掷／impact、两 bay、三回收位、展示朝向与 unavailable/error/loading/ready 状态不变；空池、双位、回收台、夜景，结果数据图留私有。 |
| A-sign／信息牌 | 当前运行牌由 JSX 和画布生成，缺当前中英可读性／支撑图；未见明显缺陷。可直接复用两张牌的实体与文案。 | M-sign | 后组只在确有问题时补牌沿厚度、支柱接合或牌面尺寸内留白；不增副标题和装饰说明。 | 两牌位置、语言切换、WorldQuant 经历卡链接、box collider 不动；正面普通视距、倾斜侧边、日夜中英。 |
| E-building／建筑、楼廊、栏杆 | 历史已有入口共面和通道卡点修正；当前不能从旧图重新判失败。现几何与旧高厅文字方案不同，缺当前完整视觉证据。 | E-body + glass 独立材质 | 保留可复用柱、厚窗、栏杆和木梁；先当前日夜总览再修一个真实弱部件。暂不投入整栋表面装修，避免与新岛布局重复制作。 | 现原点、接驳、多层支持面、楼梯坡道、碰撞／相机、玻璃批次与灯光不动；入口／厅中／楼廊日夜同机位。 |
| E-desk／环桌、CRT、银行灯 | 当前为环桌及两个工作 CRT，厚台面、嵌板、灯具有现成细节；仅缺当前实机材质和手部净空图。复用为可移植整套。 | E-body；两屏 E-face；拨杆 E-moving | 下一组优先可复用桌单元，木面、铜轨与绿色灯罩的物理响应有区分，台沿／嵌板在站位读得出。现合批无 UV，新贴图需桌专用窄适配，不能只导出 GLB。 | 两站位、ticketSlot、slideStart/End、拨杆和手轨迹、bank lamp 锚点冻结；两站近景＋环桌普通视距＋夜间工作面。 |
| E-archive／档案柜、业务台、文件槽 | 源已有抽屉凹缝、拉手安装脚、后部档册和灯罩；无当前图，不能判为只有盒子。复用柜体／柜台单元。 | E-body + 柜台 E-face；票据 E-moving | 后组改善目标为前脸层次和拉手承托在领取票据站位可读，避免添随机文件。只动单柜／台视觉壳和材质，保留真实票喉。 | archive 抽屉索引／票据接口、柜台／站位、当前两侧净空和所有状态冻结；柜台操作位、抽屉斜侧、票口、日夜。 |
| E-press／清算压机 | 源有压机、后柜、台面及独立运动压印件；缺当前运动中接触与材质图。可复用为完整清算设备。 | E-body（`alpha-exchange-clearing-craft.ts` 为后柜）+ E-moving stamp/receipt | 后组让机架厚度、压印头导向／台面承托与纸槽有清楚层次；只修设备壳和局部材质，不把后柜精修等同压机本体返修。 | stampRest、receiptRest、运动行程／接触时刻、flywheel sweep、东梯／后走道冻结；中性、压下、回执推出、斜侧与日夜。 |
| E-gallery／读图控制台 | 源已有倾斜读图背板、铜边和邻近书柜／植栽，缺当前选择器与画面关系图。可复用独立台。 | E-body（控制台主几何 + gallery craft）+ E-face + 既有选择交互 | 后组仅修读图台壳与支撑，站位可分出铜边／木背／显示面，图表不被边框遮挡；书柜不是控制台返修替代品。 | review.display／displayPitch、selector 和相机净空、楼廊路线不变；普通操作视距、背板侧面、日夜及空／有回执状态。 |
| E-bell／交易钟、拉绳装配 | 当前实际互动件是拉绳／铃体摆动；队列「敲锤」是旧命名，不能擅自补一个新敲锤机制。仅缺当前摆动／拉绳图。 | 静态框 E-body；铃体／拉手／绳 E-moving | 复用铃框、铃壳与拉手；如需返修先做有真实内外轮廓和口沿的铃壳视觉、绳与支架接触，冻结摆动根。 | bell.pivot／clapperPivot／pullRest／pullTravel、提交时刻、暂停判断不变；静态、最大摆动／下拉、内部仰视、日夜。 |
| E-clock／后墙钟、行情板 | 当前深钟壳＋独立 atlas 钟面／历史板，缺当前大厅与楼廊可读性图。复用钟框与显示装配。 | E-body 的圆筒／torus；E-face 的钟面／板 | 后组只修壳厚度、钟缘及显示面嵌入关系；钟面 REPLAY 和已推进日期语义保留，不将刻度重画成实时行情。 | EXCHANGE_HALL.clock／board、atlas rect、事件刷新与历史范围冻结；厅中正常视距、楼廊反看、钟缘斜侧、日夜。 |

## 首组四族：可执行派工

顺序：A-vein → A-detector → A-pickaxe → A-rack。四族为一个负责人串行负责原生源与同场景 runtime 适配，主协调保留集成和审图；不拆给两个所有者分别做源／适配。当前先完成本报告，正式制作由主协调续派到隔离分支。

共同开工输入为当前 HEAD、上述 GLB 哈希、`layout.json` 和当前 `colliders.json` 哈希冻结副本／记录。先在既有服务补普通玩家视距基线，记录相机、FOV、画布、质量、天气、12:00／00:00、曝光与实际影子覆盖；当前没有这些数值，禁止发明。若画面证明某件已满足目标，记录复用，转向其真正弱项；排队不是预设每件必须重做。

### 1．A-vein

- 输入：`veins.py`、`veins.blend`、`refine.py`、当前 `batch1.blend` 和两个 GLB；宿主来自当前静态源，不能用首轮旧版替代。
- 输出边界：只改矿脉视觉源、`veins.blend`、`veins.glb`；必要局部材质适配只在矿脉消费处。第一步不重建整个矿场，不动 `geometry.py`、静态 GLB、layout 或 collider。
- 最小 construction map：宿主轮廓／裂口为几何；矿物脊与入岩边界为中尺度几何；细颗粒与粗糙度沿用可导出 PBR；不新增悬浮矿片掩盖接缝。先做 lower 一族三态，再按相同合同检查 middle／upper，不能把一层样板算全族完成。
- 交付：普通站位三态并排／同机位前后、宿主侧缝 clay、同机位夜景、fresh-import GLB 图；所有根、状态、九个 impact 点、尺寸及材质／图像清单差异收据。
- 验证：现有 `alpha-mine-physics.test.mjs`、`guide-mine.test.mjs` 与矿脉源 QA 中的实际接触点检查，选与改变相关的项目；只声明实际执行。没有改路径时不重跑整岛全套。若需动宿主或 contact，停止该扩大部分并回协调，不偷偷修改碰撞。

### 2．A-detector

- 输入：当前 `props.py` detector 场景、`props.blend`、`detector.glb`。保留壳体、开放感应环、表盘、指针和线缆；现源已具备这些，不重复从零重建。
- 输出边界：只导出 detector，不使用现 `props.py` 的无选择全量运行覆盖 ore／pickaxe。可先给脚本加有界单资产输出入口，确保其它输出 byte hash 不变。原生场景保持可编辑命名。
- 最小 construction map：壳盖接合与表盘边沿厚度保留／必要修正；主改善放在铸铜、铁环与皮握把响应。若基线足以证明需要贴图，只给工具有用 UV，去掉该导出路径的 `export_texcoords=False`；保留颜色空间、法线和材质槽。无需强迫所有工具贴 4K 图。
- 适配边界：先确认原生 glTF 标准材质直通即可生效；若确需新 runtime hook，在装配源上一次适配，验证架上 clone 和 `WorldGuideMine.installAssets` 手持 clone，不改角色代码。新材质纹理的共享／释放由工具适配明确拥有，不能销毁 loader 缓存借用图。
- 交付与验证：架上取物视距＋扫描手持视距前后、表盘斜侧 fresh-import、日夜；握点／scan_origin 原矩阵和 0.311×0.443×0.206 m 当前历史尺寸对照（最终以当前 GLB 实测为准）。运行源几何／socket QA 和相关 GuideMine 接线测试；真扫描视觉留给既有运行服务，不重写扫描规则。

### 3．A-pickaxe

- 输入：同一 `props.blend` 的 pickaxe 场景与当前脚本／GLB；紧接 detector，复用已验证的导出入口和物理材质工具，不复制一套独立 loader。
- 输出边界：木柄、握皮、镐头和眼楔仍独立可编辑；只导出 `pickaxe.glb`。不覆盖 ore／detector，不缩放整根来增加视觉体量。
- 最小 construction map：锻铁头、工作刃、木柄与包皮的 roughness／色相／反射宽度分离；沿柄木纹只在可读尺度成立，不能用大噪声当木纹。既有弧形刃尖与头眼连接保留，任何几何改动都不得移动三个交互节点。
- 交付与验证：静置与真实四姿前后、刃尖／头眼侧面、fresh-import 日夜；节点完整矩阵和工具包围盒／扫掠壳差异。先用相关 socket／contact QA，随后既有服务验证击中仍落在矿面接触点；不改挥镐动画或命中宽容度。

### 4．A-rack

- 输入：`geometry.py:architecture()` 的 AM03 工具架部分、当前 `batch1.blend`、`build.py`、`quarry-static.glb`、两个工具 GLB 与 layout 挂点。
- 输出边界：优先在旧架体内做可见接合、挂钩承托和制作方向正确的木材响应。此族目前混在全静态材质批，禁止运行生成器后把全矿场变化一起提交。输出需按 family source 名追踪至 AM_wood／AM_metal，比较非 AM03 源部件和既有碰撞保持不变。
- 若为了架体独立材质必须拆出窄适配：只隔离架体视觉，保持原静态来源的其它部件与 collider。先回报协调选择一次最小接线，不能同时保留旧架体再叠新架体，也不能把 `MineRack` 中只负责工具的 JSX 当作架体本体修改。
- 最小 construction map：支脚落地、横梁端部承托、挂钩入梁和工具实际支撑是首要；木材沿每根构件方向，不能直接把当前共享 +Z 纹理公式无条件套所有斜梁。挂点固定时以现挂点约束钩形，不能挪工具去配新外观。
- 交付与验证：满架／取空前后、钩与两工具接触的斜侧近景、脚地 clay、日夜；当前静态 GLB 与 candidate 的非架体差异表，碰撞 hash 不变，工具 socket 不变。触及静态生成时运行相关布局／入口与通行回归，若只材质则用材质接线＋实机图验证。

## 下一组与停止条件

首组真实普通视距改善通过主协调审图后，再处理 A-ore／A-pool／A-sign；A-quarry 的轮廓需先有当前总览以确认旧问题是否仍在。交易所优先形成 E-desk／E-archive／E-press／E-gallery 四件可复用单元，先一件打通 E-body 材质消费，再推广；E-building／E-bell／E-clock 后续按图决定，只保留现有装配，不解释为高山新岛完成。

第一件的升级若只在放大裁图或新增零件清单里可辨，应停下调整主形／中尺度／材质分离，不批量复制。若出现新布局、碰撞、工具握点、角色动作、数据／请求或跨场景材质缓存需求，记录具体边界交主协调。未完成实际图像检查或实机操作的栏位保持 pending。

本轮完成的是 15／15 路径复核及四族可派工安排。没有新增艺术通过、浏览器通过、性能数字或发布声明。
