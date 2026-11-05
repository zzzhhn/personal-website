# 意图过山车：真实 runtime 资产清单

2026-11-05，只读源码盘点。冻结仓库 `personal-world-coaster-car-pilot`，分支 `codex/coaster-car-astra-pilot`，HEAD `b75c474f73ffa186e7bbc5522e4656dcbbedf9c3`。本次只新增本文件，没有运行构建、测试、Blender、浏览器、截图或下载。本清单证明源码存在与调用关系，不声称已重验当前网页、性能或外观。

当前主 session 转达的用户决定：认可 `coaster-car-astra-pilot-20261104` 的车厢及 `coaster-chest-transfer-20261104` 的宝箱外观，要求整个过山车场景全部 assets 按此精修。宝箱 README 旧有“用户视觉验收未获取”已被本次明确认可更新；其历史性能不通过的事实仍保留。认可单件外观不自动构成其它资产、场景组合或性能通过。

## 范围、计数与实际接线

共 **43 个资产家族：41 个场内家族，2 个共享到达边界家族**。家族按可辨别的不同装置、构件系统或源模型划分，不按实例、材质数、螺栓、树的数量凑数。三节车厢算 1 族，六把锁和七盏任务灯归宝箱，两个镜像门扇算 1 族，六个不同用途的工位各算 1 族，ST1/ST2/G19 是三个真实不同源资产。嵌入某建筑的百叶、管线、小柜、扶手、内置座凳、灯条随所属系统覆盖。

本文件的源文件短名均相对 `src/components/world/attractions/`；工具路径相对仓库根。表中 owner 是可分配的职责建议，没有实际派出后续 agent。

正式运行链：`WorldAttractions` 按 `INTENT_COASTER.bounds` 外 24m 判断 active，lazy 挂载 `WorldIntentCoaster`。后者用 `active || riding` 控制近档与交互；`createCoasterStructure(detailed)` 默认 `scope='full'`，输出 `steel/glow/colliders/track/relief`。结构即使远离仍有远档渲染，装置、标识和场内结构物理在 enabled 时挂载。`WorldCoasterVegetation` 在 enabled 分支外独立存在，自行按距离和视锥选档。

材质及加载 consumer 约定：

- **S**：`createCoasterStructure → CoasterBatch.finish → structure.steel → WorldIntentReflectiveSurface(.82,.16)`；相应 `glow` 为顶点色 `meshBasicMaterial`。结构初始档同步生成，另一档经 `coaster-structure.worker.ts → pack/unpackCoasterStructure → CoasterStructureCache`。实际物理由 `CoasterCollisions` 的 box/hull、轨道样段 Trimesh 与 relief Trimesh 消费，不能把整个轨道都称为现有可踩碰撞面。
- **W**：`createWorkshopGeometry → WorldIntentWorkshop` 的 body 使用 `WorldIntentReflectiveSurface(.65,.2)`，glow 用 basic；台面静态装置另输出实际三角接触面，柜体、立柱和输送梁沿 `workshopColliders()`。动件分别见表。
- **D**：`WorldIntentDevices → IntentChest/IntentGate` 使用程序化几何与 `WorldIntentReflectiveSurface`，既有 `IntentInteraction/useInteractable` 与 `activateIntentTarget` 拥有交互。
- **PBR 候选**：`WorldCoasterTrainCraft`、`WorldCoasterCarPilot`、`WorldCoasterChestTransfer` 用 `useGLTF` 直接保留 UV、法线、独立 PBR 材质和贴图，借用 `useDjcFurnitureEnvironment` 的 PMREM；自有材质 clone 自行销毁，不释放 loader 共享资源。
- **V**：`WorldCoasterVegetation → GLTFLoader → mergeCoasterPlantGeometry → InstancedMesh`。实际重新使用顶点色 standard 材质，树草源贴图或源材质不会自动保留。

`CoasterBatch.add()` 删除 UV 并重写顶点色，`finish()` 落 `intentCraftSurface` 后合并；`WorldIntentSurface` 的 shader 消费该角色、夜间辐照与程序化表面。其反射路径只给一部分裸钢角色非零环境反射，其它涂装、橡胶等角色被置零。因此不能把新 PBR 文件放进目录，再经旧批次重烘成顶点色，称为已实现同等材质。改 consumer、增加属性、合批和 worker 协议由集成 owner 串行统合。

## 全量清单

状态缩写：**旧改已接**＝HEAD 已实际调用旧一轮程序化精修或已有源资产，但没有本轮标杆级逐族用户认可；**认可未接**＝新资产外观获认可，正式源码仍用旧版。优化方向写可制作的构造/材质工作，不对未打开的图作审美判断。

| ID / family | 源文件 / 生成函数 | 真实 runtime consumer 与放置 | 现状 / 已审批证据 | 优化方向 | 固定约束 | 可独立 owner |
| --- | --- | --- | --- | --- | --- | --- |
| 01 接件台、滚筒与机架 | `intent-workshop-geometry.ts`：`createWorkshopGeometry`、`addIntakeBench`、`addIntakeRollerSupports`、`workshopArt('intake')` | W；`WORKSHOP_INTAKE=[-16,0,73]` 经 `coasterWorld`；九滚筒、折边台面、通道支座 | 旧改已接；旧 COVERAGE 记载过滚筒/轴承验收，仅为早期局部 | 台面卷边、板厚、滚筒轴承端部、机架装配、涂装与加工钢分材质 | 柜体 box、滚筒与轨道接触 proxy、台面 `contactSurface`；不改变请求接件点与滚动区 | 工坊接件资产 owner；只交资产/命名，接线归主 |
| 02 空位探照仪 | 同文件：`workshopArt('lookup')`、`createWorkshopMoving('lookup')` | W 静态，`WorkshopMotion` 动态 torus 扫描环用 `WorldIntentSurface(.55)`；`[-24,0,65]` | 旧改已接；没有本轮逐族认可 | 三座模型、软垫、扫描镜头与环的真实厚度、轴座、软硬材料 | 扫描环运动中心、座位台面开口、原 `contactSurface` 与工具状态 | 工坊六工位 owner |
| 03 路线编排台 | 同文件：`workshopArt('plan')`、`createWorkshopMoving('plan')` | W + `WorkshopMotion`；`[-20,0,60]`；节点、轨槽与活动小车 | 旧改已接 | 路线槽与节点壳体、活动小车底盘/轮轴、导轨承托及材料分层 | 活动小车 x/z 路线与既有轨槽、操作目标和静态三角接触不变 | 工坊六工位 owner |
| 04 循环检修机 | 同文件：`workshopArt('debug')`、`createWorkshopMoving('debug')` | W + `WorkshopMotion`；`[-15,0,59]`；铜环、检修外壳与滑动件 | 旧改已接 | 开放环路接头、维修机构分件、滑座与手可触范围、金属/涂装区分 | 运动 x 轴通道、铜环开口和静态碰撞面不填死 | 工坊六工位 owner |
| 05 告示改写辊 | 同文件：`workshopArt('rewrite')`、`createWorkshopMoving('rewrite')` | W + `WorkshopMotion`；`[-10,0,62]`；两辊、纸路、纸片输出 | 旧改已接 | 辊筒包胶/金属轴、轴座、纸张厚度及进出纸口、柜架 | 纸沿 z 移动、辊跨 x，净空与输出状态固定 | 工坊六工位 owner |
| 06 字段分离器 | 同文件：`workshopArt('extract')`、`createWorkshopMoving('extract')` | W + `WorkshopMotion`；`[-8,0,67]`；三路槽、三枚活动输出 | 旧改已接 | 刀架/分流器、槽壁卷边、接收口、模块端面与涂层 | 三路输出位置、伸缩/移动比例、槽口和三角接触保持 | 工坊六工位 owner |
| 07 预订执行杆工位 | 同文件：`workshopArt('act')`、`createWorkshopMoving('act')` | W + `WorkshopMotion`；`[-9,0,73]`；三座、执行小柜与状态标记 | 旧改已接 | 座位、出票/执行模块、纸票与锁定机构、可读状态材料 | 不把 lookup 的只读席位状态混成 act 预订；执行动件和提示坐标不变 | 工坊六工位 owner |
| 08 澄清铃及立座 | `intent-workshop-geometry.ts`：`createWorkshopGeometry` 中 intake 左侧 bell 段；`intent-workshop-layout.ts`：`workshopLocal('bell')` | W；`[-18.5,0,73]`；独立 `WorkshopInteraction('bell')` | 旧改已接；现为柱座加铜色圆柱形铃体，无独立 GLB | 铃罩/铃舌/按动或悬挂构造、安装座、金属表面；以现有交互为准 | 原铃目标半径、底座 box，澄清 T7 的状态语义不变；没有授权增设新动作 | 工坊接件资产 owner |
| 09 架空输送轨、中枢、吊挂及支柱 | `intent-workshop-geometry.ts`：`createWorkshopGeometry` 分支梁、hub、吊杆；`intent-workshop-layout.ts` | W；中枢 `[-16,3.65,67]`，七条工位分支与立柱 | 旧改已接；已有 steel/coat 角色，不是新标杆级 PBR | 主节点轴承、梁截面、分支接口、吊挂节点与电缆固定，保留普通距离可读构造 | `WORKSHOP_RAIL_Y=3.65`、post top 4.45；载体路径与全高步行通路；梁/柜/sign collider | 工坊输送 owner |
| 10 请求载体胶囊 | `intent-workshop-geometry.ts`：`createWorkshopCapsule`；`WorldIntentWorkshop.tsx` | 动态 group；`WorldIntentSurface(.5, craft)`；接件点 `[-16,1.66,73]` 沿预设 paths 到各工位 | 旧改已接 | 壳、内件、扣件及抓取/吊装接口；可区分承载物与固定轨道 | ready/processing/returning 显隐、carrier y=3.15、原运动路径、暂停/退件逻辑；无新增物理 | 工坊输送 owner |
| 11 通用操作拉杆 | `intent-workshop-geometry.ts`：`createWorkshopLever`；`WorldIntentWorkshop.tsx` | 七实例 `InstancedMesh`，顶点色 standard(.55,.25)；工位 `[x+.96,1.3,z+.75]` | 旧改已接；七实例不是七族 | 弯杆截面、握把包胶、铰轴和底座；保留共享实例化 | 绕本地 X 的 processing/intake 角度、更新签名、七实例容量固定 | 工坊输送 owner |
| 12 六锁宝箱总成 | `coaster-device-geometry.ts`：`createIntentChestBody/Lid`；候选 `WorldCoasterChestTransfer.tsx` 与 chest GLB | 正式 D：`<IntentChest/>`；`[-8,0,59.5]`。review 才切 `ChestTransferChoice → WorldCoasterChestTransfer` | **认可未接**；当前用户认可候选外观。首版 17,940 面、7 材质、28 图元，历史性能未通过 | 保留认可壳形/锁轨/内衬；静态体与盖体按材质合批，独立六锁动件和七信号，简化投影后重验 | lid 根 `[0,1.23,-1]`、X=-1.3；六锁按 passed 数，七信号按 T1～T7；chest box `[1.9,.65,1.05]` 与拿钥匙位置；不可把 7 题错做 7 锁 | 宝箱 owner；共享加载/材质统合归主 |
| 13 实体钥匙 | `coaster-device-geometry.ts`：`createIntentKey` | D；开盖未取时箱内 `[-.2,1.4,.25]`，开门后在 `[5.3,1.65,COASTER_GATE_Z+.5]`，候选宝箱仍复用它 | 旧改已接；宝箱认可不能自动给这把旧钥匙单独认可 | 钥匙环/齿、倒角和金属响应；现有尺寸下增强真实形体 | 现有显隐与解锁逻辑、拾取点、门侧复用点不变；无新 key collider | 门锁小件 owner |
| 14 双开门扇与铰链 | `coaster-device-geometry.ts`：`createIntentGateLeaf`；`coaster-access.ts` | D：`IntentGate`；左右镜像，hinge `[±5,0,COASTER_GATE_Z]`；kinematic rigid bodies | 旧改已接；当前几何有门框/竖栏/斜撑/铰链，没有独立可见锁芯模型，不虚列成已存在资产 | 门框真实型材、焊接/接头、铰轴壳、闭门处装配和钥匙操作焦点 | 每叶 collider half `[2.5,1.6,.18]`、hinge、开角参数 -1.45、向外前场开；物理逐步旋转与视觉同轴 | 门锁小件 owner |
| 15 入口门柱及门楣 | `coaster-geometry.ts`：`addArchitecture` gate 段 | S；门柱 `[±5.8,3.3,COASTER_GATE_Z]`，顶部 fascia `[0,6.4,COASTER_GATE_Z]` | 旧改已接；矿物板、底座、上盖和 recess 已在当前源码，不是新 PBR | 板边/压顶厚度、柱基/门铰连接、面板凹缝与嵌灯壳 | 原完整 collider 外壳及顺序、10m 通道、atlas 位置与宽高、门扇旋转空间固定 | 入口建筑 owner |
| 16 候车厅及屋顶梁柱总成 | `coaster-geometry.ts`：`addCoasterStationRoof`、`addCoasterBuildingArt`、`addArchitecture`；`coaster-detailing.ts`：`addStationStructureDetail` | S；厅心 `[-2,*,41.5]`，柱线 x=-10/6，屋顶 z=30～53；含檐梁、柱脚、屋面设备、檐灯/候车侧板 | 旧改已接；旧 final-review 的主审交付，用户随后要求提升，不能据此结项 | 原有屋面截面/承托上做可读包边、立柱节点、屋底与檐口分材质；控制亭小件随厅覆盖 | 原站厅开口/中央通道、屋顶 collider、`stationStructureMembers` 实体接触、灯面和站名牌位置 | 站房建筑 owner |
| 17 站台东附楼及西服务小屋 | `coaster-geometry.ts`：`addCoasterBuildingArt` east annex/west service；`addArchitecture` | S；东 `[10,3.1,43]`、西 `[-14.5,2.7,35]`；两种体量算同服务建筑套件的变体 | 旧改已接；板件、服务门/把手、窗/百叶、屋面小件已有 | 墙壳厚度、门窗收口、百叶深度、门把与服务设施外壳材质 | 两个封闭 building core 的原碰撞；装饰服务门没有现成可开交互，不新增通路 | 站房建筑 owner |
| 18 登车阶梯和门槛桥 | `coaster-transition.ts`：`COASTER_BOARDING`；`coaster-geometry.ts`：`addArchitecture` stairs | S；六级实际 box 加 threshold，直接使用 `COASTER_BOARDING` 的世界位置/yaw | 旧改已接；有矿物踏面与金属 lip，非独立新资产 | 面层接缝、可见板厚、踏步前缘与侧面收口，细节保持在原包络 | 同一 tread 同时用于模型/collider/脚路/ground probe；不得改楼梯顶面或堵负 Z 登车侧 | 站台构件 owner |
| 19 三节列车完整单车资产 | `coaster-geometry.ts`：`createCoasterCar → addCoasterTrainCraft`（`coaster-train-craft.ts`）；候选 `WorldCoasterTrainCraft.tsx` | 正式 `CoasterTrain` 仍 merged 单车 mesh ×3；review 用新近/远 GLB，8 材质各三实例及统一投影 carrier | **认可未接**；用户认可近景 GLB；候选近 21,772 面、远 5,221 面，局部性能记录在 `PERFORMANCE.md` | 直接正式接入已认可 `WorldCoasterTrainCraft`；保留近景模型、44/50m LOD、实例化和简化投影；无需再从旧低模重做 | 三个运动根、3.55m 间距、六个 `COASTER_CAR_PANELS`、座高 .72/背高 1.475、负 Z 开口；停靠物理只在 active&&!riding；首人称与暂停/完整行程 | 列车接入 owner；主保有运动/接触接线 |
| 20 双钢轨和轨道 spine | `coaster-rail-section.ts`：`coasterRailRings`、`sweepCoasterSection`、`addCoasterRailSections` | S；`coasterFrame/thrillFrame` 全圈；运行钢与 spine coat 角色由 `COASTER_TRACK_CRAFT` 落批 | 旧改已接，默认 full 已覆盖整圈；不是独立高质 GLB 被消费 | 在原截面/采样上做好连续表面、型材边缘和金属/涂装响应；不得用断续装饰破坏曲线 | 轨道 frame/拓扑/速度/翻滚固定；现有物理 `TrackContact` 主要是 structure sample section；新细节不入骑乘净空 | 轨道设施 owner |
| 21 轨枕、鞍座、轨底连件 | `coaster-structure-craft.ts`：`addCoasterCraftTie`；`coaster-rail-section.ts` | S；全圈现有 tie cadence，near/far 有不同简化；sample 内另有物理 brace | 旧改已接；near rail seats、far 三角截面有真实 consumer | 承托板/型钢截面、接头压边/紧固层次，普通距离看得出的部件先做 | 轨枕站位、tightRun `.75～.81` 弦宽、既有 contact 与 LOD 节奏固定，不无限加螺栓 | 轨道设施 owner |
| 22 支架、柱头节点与基础 | `coaster-thrill-supports.ts`；`coaster-detailing.ts`：`createSupportMemberDetail`；`coaster-structure-craft.ts`：`addCoasterCraftSupportNode` | S；两套 `coasterSupports(detailed)`，基础由 `coasterSupportBase` 取地；near 节点，far 减件 | 旧改已接；full 标记/节点实际调用，旧技术记录不等于新外观验收 | 型材涂装、柱头承压/连接板、柱脚灌浆与混凝土分层；每种重复件只做一套可复用资产 | 两套支架 station/半径/长/transform/collider 全固定，地形基础净空；near/far 必须都保留材质/接地 | 轨道设施 owner |
| 23 提升主塔及检修设施 | `coaster-thrill-tower.ts`：`addThrillTower` | S；local x≈-44、z≈-150；四腿、84m 柱、87m 顶标、封闭检修平台/柜/梯 | 旧改已接；与后面的服务塔是两套真实不同体量 | 四腿节点、平台底构、机械 spine、梯架、柜体/基础/信号灯分件 | 原塔 legs、平台和柜 collider、全圈骑乘净空；staff-only 不包装成新客用通道 | 高塔设备 owner |
| 24 中后场服务塔 | `coaster-landscape.ts`：`addEquipment` 第一个 tower 块 | S；局部变换 `[x,y*54/44,z-48]`，主体近 `[-41.5,*,-80]`；多层服务平台、冠部、铜管 | 旧改已接；不和主塔合并漏算 | 服务立面、平台/冠部连接、管夹、护栏端点和矿物/涂装表面 | 原 transform 与 housing/平台 colliders，轨道及相机包络；staff-only | 高塔设备 owner |
| 25 螺旋内部设备楼 | `coaster-geometry.ts`：equipment(-36,0,13,...)；`coaster-landscape.ts`：`addEquipment` helix 段 | S；`[-36,*,13]`；多层外圈、百叶、门、屋顶设备、外接柜与管线 | 旧改已接；两文件共同组成，不能只改 building core | 建筑外壳/屋面压边、百叶/门收口、设备罩、管道与支架材料层次 | 原 building collider、外接 cabinet/环带 collider 和螺旋列车空间；外观与碰撞不可脱节 | 设备楼 owner |
| 26 后侧电力设备楼与平台 | 同两文件：equipment(24,5,-92,...) + power move `[x+21,y+5,z-49]` | S；`[24,*,-92]`；楼壳、15×13 基座、顶柜、护栏和导管 | 旧改已接；当前模型不等于新标杆认可 | 柜体板件/电气通风、平台收口、管线挂接、金属与矿物分材质 | 地形已为基座预留精确平台，原碰撞/顶柜/轨道净空固定 | 设备楼 owner |
| 27 员工检修桥、梯架与管线 | `coaster-geometry.ts`：`addArchitecture` deck/staff stair/ladder；`coaster-landscape.ts`：catwalk cable runs | S；x≈-51、y=15.5 三段桥，x≈-38.5 斜梯，-51.5 封闭入口；既有电缆附着其下 | 旧改已接 | 桥板/纵梁/节点、梯踏与护栏连接、管线束托架；保留员工通路辨识 | 原 deck surface collider、柱/封闭入口 collider；没有客用解锁，不新开门或堵列车/镜头 | 检修结构 owner |
| 28 灯廊钢架、墙板、顶棚与灯槽 | `coaster-geometry.ts`：`addTunnel` | S；`COASTER_TUNNEL.start/end` 上 18/9 跨，frame 配合轨道 rotation；有墙/屋顶/节点角色及青暖灯 | 旧改已接；无新 PBR 资产接入 | 构架接头、墙板/檐口厚度、灯槽扩散面、服务跨面板，保留节奏 | 原中心线、±3m 侧界、up4.25～4.5 顶界与骑乘/第一人称视线；当前函数不新增独立 tunnel colliders | 灯廊 owner |
| 29 海岸周界围栏 | `coaster-geometry.ts`：`addArchitecture` boundary 段 | S；由 `INTENT_COASTER_FOOTPRINT` 生成，南 z=56 留门，近海断口按 cape distance 排除 | 旧改已接；开放栏杆而非全高隐形墙 | 栏杆型材、连接/立柱帽、柱脚、防腐材质；保留海岸缺口 | 两根横栏 y=1/2.7 及立柱真实 colliders；原间距、开放相机/步行绕行不得改成整墙 | 围护/灯具 owner |
| 30 前场、站台、工坊地坪及平面步道 | `coaster-geometry.ts`：`addArchitecture` 三块铺装；`coaster-landscape-cliffs.ts` apron；`coaster-landscape.ts` 四条 paving | S；南前场 `[0,.04,60.5]`，站台 `[-2,.04,41.5]`，连接 `[0,.04,55]`，工坊不规则 apron 与四条 promenade | 旧改已接；已有 paving/coping 材质和路缘，不应当成待生成空白 | 路面板缝、边缘倒角/压边、表面粗糙变化、与柱脚/花槽接地；按真实连续区域制作 | 原 .08/.12m 顶面高差、工坊 4cm 防共面 lip、三块 surface box、apron proxy 和步行路径固定 | 场地铺装 owner |
| 31 观景坡道、平台、护栏及内置座凳 | `coaster-landscape-cliffs.ts`：`COASTER_CLIFF_WALK`、`addCoasterCliffs`；`coaster-lookout-sample.ts`：非 rock solids | S；从 `[16,.08,54]` 经 `[60,5,32]` 到 8.08m lookout；平台 `[55,7.88,14]`，三侧护栏与两内置座凳 | 旧改已接；有真实 surface/collision 和铺装角色，非只有视觉线框 | 坡道侧梁/桥墩、平台压顶、栏杆节点、座面厚度与矿物/金属分材质 | public ramp 全宽5.2，南侧接入保持开放；guard 高/栏间隙、共享 box/hull transform、seat collider 不动 | 观景结构 owner |
| 32 观景台下岩岸基座 | `coaster-lookout-sample.ts`：`coasterLookoutSolids` rock、`lookoutRockSurfaceParts` | S；lookout 下三层岩床、fracture/toe hull，位置近 `[55,*,14]` | 旧改已接；canonical convex hull 同时用于外观和碰撞，已有 bedrock 标记 | 岩床连续性、折面/矿脉/风化粗糙度、与基础接触；不靠全局加细分 | canonical hull、deck foundation/U形开口、现有接触与坡道净空冻结；若改形需主批准物理变更 | 岩岸材质 owner |
| 33 内场及首降连续地形、岩脊和花园环路 | `coaster-terrain-relief.ts`：`createCoasterTerrainRelief/addCoasterTerrainRelief`；`coaster-drop-landscape.ts`：`createDropRock`；`coaster-landscape-finish.ts` | S；同一 relief 渲染与 Trimesh；三旧 formations、THRILL relief、north drop rocks、`COASTER_INFIELD_WALK` 及地被组成 | 旧改已接；`coasterGroundColours` 已真实 import，不把 nature worktree 的存在误判为未接 | 连续岩/土/草材质、岩脚接地、环路边肩、可读大尺度层次；先保留现有表面再做材质 | relief position/index/height sampling、foundation/ride ceiling、轨道与相机裁切、环路连通、植被根面固定；不是可随意替换的装饰 GLB | 连续地形材质 owner |
| 34 离散岩岛及卵石群 | `coaster-landscape-rocks.ts`：`landscapeRocks`、`landscapeRockSurfaceParts`、`addLandscapeRocks` | S；七 authored sites 经 `clear()` 过滤实际保留组，不把七候选锚点全称已出现；bed/shoulder/spur/cobble 为同一岩石群落族 | 旧改已接；每个 actual hull 成为 convex collider；已有 bedrock 角色 | 延续岩层、断裂端面、相邻岩肩过渡及地表材料；不随机撒小石替代群落 | 固定 clear 检查、海岸/内场通路、原 rock hull/transform/碰撞；实际实例以生成过滤结果为准 | 岩岸材质 owner |
| 35 入口花槽 | `coaster-landscape.ts`：`addCoasterLandscape` housing；`coaster-vegetation-layout.ts` planter sites | S 槽体 + V 中 G19 填植；x=-48/-38/-18/17/29/45，z=55，绕开 cliff walk | 旧改已接；槽体与植被来自不同 consumer，不能只换槽而漏植栽根位 | 槽沿、壁厚、内凹土层/排水和矿物材质，灌木继续独立实例化 | 槽体 box collider、植栽 ground=1 及根面，通路排除逻辑不变 | 场地铺装 owner |
| 36 场内独立灯具套件 | `coaster-geometry.ts`：`INTENT_LAMP_POINTS`；`coaster-landscape.ts`：promenade/infield lamps；`coaster-landscape-cliffs.ts`：cliff lamps | S；高柱灯、入口短灯、内场灯笼、观景灯四变体；embedded 灯条随各建筑族 | 旧改已接；glow 只自发光，baked spill 由 `intent-lighting.ts/coaster-landscape-lighting.ts` 实际照面 | 灯罩/扩散面、灯架/基脚、线路/装配；四变体统一工艺而保留尺寸 | 原位置/有效灯面、lamp collider、烘焙点与角色夜间可读；不逐灯加实时投影，不改全局曝光 | 围护/灯具 owner |
| 37 ST1 树 | `WorldCoasterVegetation.tsx`；`coaster-vegetation-layout.ts`；`/assets/world/street/ST1.glb` | V；ST1 两冠 LOD+L0 trunk 合成，实例取 `kind=0` 布局 | 已复用共享原生资产；没有本轮逐树外观认可；源不是本场新制作 | 先评估真实 consumer 后做冠形/叶团/树皮材质；保留共享源，候选独立导出 | 两 LOD 包络、根位/matrix、风动、trunk Trimesh、总树48/近树8预算及共享 loader key | 植被资产 owner |
| 38 ST2 树 | 同文件；`/assets/world/street/ST2.glb` | V；ST2 两冠 LOD+L0 trunk，`kind=1` | 已复用共享资产；两种树模型是真实两族，实例不另计 | 同上，但保留 ST2 独特树冠/高度，不把两个文件统一成一个重复剪影 | ST2 包络高度6.46、原矩阵/根面/树干接触与双LOD/风动；不可覆盖其它场景共享文件 | 植被资产 owner |
| 39 G19 灌木、花槽填植与坡脚植被 | 同文件；`/assets/world/camp/G19.glb` | V；只合 `crown`，`kind=2`；花槽、grove、drop sites 共用 | 已复用共享资产；没有新材质直接消费 | 叶团/茎叶软硬层次与接地；普通距离先检视真实轮廓，再决定需要的新材质批 | bush36/visible24、65m距离、现有根位/包络/风动；没有 trunk collider，不增加看不见的阻挡 | 植被资产 owner |
| 40 门头、宝箱与车站实体标识 | `intent-sign-layout.ts`：`INTENT_SIGN_PANELS/createIntentSignGeometry`；`WorldIntentSigns.tsx` | 三块 plane 合并、一个 1024×384 CanvasTexture/basic；位置分别门楣、宝箱上方、车站 fascia | 旧改已接；真实双语和 passed 计数，当前非 GLB 字牌 | 标牌厚度/边框/安装件随所属建筑做；保留文字显示路径、宽高比及状态可读性 | atlas UV/语言/进度/文案、plate 面和主通道遮挡；不把说明文字烘进固定语言模型 | 标识 owner；框架接线与建筑 owner 协调 |
| 41 工坊请求牌及六工位结果牌 | `WorldWorkshopSigns.tsx`；`WORKSHOP_INTAKE_PANELS`；`createWorkshopGeometry` sign housings | 八块 plane、1024²八行动态 atlas/basic；intake 两面、六 tool panels | 旧改已接；随 phase/task/clarification/output/notice 更新 | 实体框、护边/装配和牌面材质；避免另加重复说明与副标签 | 八 row 的 UV、两块 canopy 高度、六工具牌位置，动态文字/结果状态与 sign colliders 原样 | 标识 owner |
| 42 共享到达道路、路肩与标线 | `WorldAttractionApproach.tsx`：`ribbon`；`attraction-layout.ts`：`ATTRACTION_ROADS` | `WorldAttractions` 直接挂载，普通 standard 三组道路 mesh；高度取 `meshHeight/terrainHeight`；north-road Trimesh | 共享边界，已接；不能把整条国投支路算成过山车独占制作 | 仅过山车到达段路面/路肩/标线与前场交接，保留共享布局 | 6.4m asphalt、原起伏贴地/Trimesh；跨国投路段共用资产由主统合，禁止单线覆盖 | 共享到达 owner（主协调） |
| 43 共享北岸导向路牌及立杆 | `WorldAttractionApproach.tsx`：sign canvas/最后两组 mesh | 道路端 world `[.8,height,-59]`、`[-19,height,-117]`；4.2×1.75 plane、box 立杆，basic atlas | 共享边界，已接；不是工坊或车站牌族 | 路牌壳厚、背面/支架连接、立杆/基脚、双语牌面；复用真实方向内容 | 原位置/尺寸/文字方向及语言；现无专用立杆 collider，不自行追加；不得改国投导向 | 共享到达 owner（主协调） |

## 可执行分组和优先顺序

1. **P0，先把认可资产接到真实消费链**：12 宝箱、19 列车。车厢使用现成实例化/LOD 组件；宝箱先做不改变认可外观的合批/投影优化，处理历史 28 批与长尾问题。二者进入正式 `WorldIntentDevices/WorldIntentCoaster` 后，才可在 coverage 记“已接”；保留原可回退路径。当前正式树两件仍是旧几何，这不是重新创作问题。
2. **P1，入口实际可触片区**：01～11、13～18、30、40～41。先以完整接件台/一台机器与门锁/站房的普通操作距离建立同工艺代表，然后批量完成六台不同工位；同一片同时完成牌框、拉杆、输送接点和地面收口，不能只修改台面材质。
3. **P2，设施和骑乘中景**：20～29、36。先相同工艺完成一段钢轨/轨枕/柱头/基础及灯廊跨，再沿真实 full scope 和两 LOD 传播。主塔、服务塔、螺旋设备楼和后电力楼各有不同源构造，四者不能以单塔样板一并结项。
4. **P3，场地与共享边界**：31～35、37～39、42～43。保留地形和植被 layout/碰撞，把表面与独立装配资产分开精修。共享树源和北岸道路牵涉其它场景，主协调持有接入权。P1/P2 交付前不能拿全景看不清的远处资产预先标完成。

这些分组可独立制作资产，但不是同时改同一 TS 文件的授权。`coaster-geometry.ts`、`intent-workshop-geometry.ts`、`WorldIntentSurface.tsx`、worker/transfer/cache、runtime 挂载与共享路/植被源由主或单一集成 owner 持有；其它 owner 可在各自独立资产目录交付具名节点、尺寸/轴向、材质/贴图、近远档及运行 adapter，再串行接入。不能让多个 owner 并写同一总装函数。

每族关单至少要能回答：最终文件/哈希、哪个 runtime 实际消费、当前是否可见/正确选档、交互及碰撞是否保持、普通视距日夜是否被实际审阅、三角面/材质/纹理/绘制的新增成本。完整场景再做同源组合检查；本轮只做盘点，没有执行这些后续 gate。

## 已有历史产物及可复用指针

以下路径均经当前 Git 或 worktree 索引确认。稀疏工作树中部分文档在磁盘缺席，本次用 `git show HEAD:<path>` 只读其已跟踪版本，没有恢复或改写：

- `docs/world/phase-2-playground/coaster-scene-craft-20261104/COVERAGE.md`：旧清单明确“15 族是早期索引”，已经包含入口/工坊/结构返修建议；不能用其旧“可复用/已验收”跳过本轮用户标杆。
- `docs/world/phase-2-playground/coaster-craft-scene-20261104/README.md` 及 `final-review/README.md`：旧运行源码 `45ce8e4` 的十四大组、十组日夜对照、技术验证和旧4341交付记录。其原文明确仅主审，用户审美未自动通过。旧几何预算 near239,794/240,000、far139,906/140,000 余量很小；新 GLB 成本不能静默塞进此旧预算或冒称预算仍通过。
- `coaster-scene-craft-20261104/entrance-review/native/`：入口工坊及 short-bay 的 `.blend/.glb` 是早期原生归档；正式渲染仍由 TS 生成。`arrival-review/native/` 有 arrival assemblies 及 full-structure near/far GLB，但当前 `WorldIntentCoaster` 不加载它们。存在原生文件不证明已接入，也不证明含最后返修。
- `docs/world/phase-2-playground/coaster-car-astra-pilot-20261104/README.md`、`PERFORMANCE.md`：本轮认可列车、近/远 GLB、可编辑 blend、原始同机位材料和局部候选性能边界。`WorldCoasterTrainCraft` 有现成八材质三实例、44/50m 切换与投影 carrier，当前只由 review transform 注入。
- `docs/world/phase-2-playground/coaster-chest-transfer-20261104/README.md`：认可宝箱首版的几何/节点/PBR/运行候选证据。历史夜景采样 P95 32.4→44.4ms、绘制125→153，不能以外观认可覆盖性能未过。当前锁根、灯根和 lid 轴均可复用，不必重造已认可外壳。
- `tools/world/coaster-car-pilot/review.config.mjs`：唯一两件新资产的 review 注入位置；继承 `tools/world/coaster-craft-rework/full-scene-review.config.mjs`，改变 review 入口，不等于生产入口正式挂载。

相关现存 worktree 指针：`personal-world-craft-rework-coaster`（`codex/world-craft-intake-night-material`，451c61f）、`personal-world-ibd-shed-material-sample`（`codex/coaster-structure-craft-full`，ce62b5e）、`personal-world-coaster-nature-craft`（`codex/coaster-nature-craft`，eccd30c）、`personal-world-coaster-train-craft`（`codex/coaster-far-visual-budget`，6b55afa）。本次只读索引，没有检查它们的未提交修改，未把这些 HEAD 当作当前主分支验收或自动整合来源。

## 不应虚列或遗漏的边界

- `createIntentMicroBase('route'|'press'|'visitor')` 在当前源只见定义，没有当前 runtime caller；旧三台 micro 装置不加入清单。实际入口是 `WorldIntentWorkshop` 的接件台和六工位。
- 旧 `coaster-art-candidate/README.md` 的实例数字或早期“三个桌子”描述不构成当前实体数量。当前源没有独立售票亭、厕所、垃圾桶、可开服务门或新增车门模型，不能为了“全场资产”凭空造清单。
- 车厢轮组/软垫/压杆随 19 总成，六锁及七盏灯随 12 总成；仍须逐部件交付和保留动静语义，但不重复算家族。观景座凳及栏杆在 31，服务柜/管线在各塔楼/桥族，所有独立灯具四种变体在 36。
- 海水、全岛底形、天空/天气、角色与全局 HUD 不属于这次过山车建模资产制作；它们的光照、人物尺度、镜头/交互系统是固定环境约束。区域地形 relief 和到达边界实际归本清单，不可把它们与全世界地形混写成“已重做”。

## 本次静态核对结果

43 行均追到当前源生成或真实源模型、组件/material consumer 和场景放置；只有 12、19 有当前用户明确认可的新单件资产，正式 runtime 均尚未切换。其它 41 行含2个共享边界，保持“已有运行资产，等待本轮精修与实际验收”。没有因旧主审通过、构建通过、native 归档存在或来源 worktree 通过而删去待办。本轮不声称 current browser 已验证。
