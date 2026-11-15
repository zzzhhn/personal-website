# Mainland contact audit，2026-11-15

范围：营地、城镇／道路、Intent Coaster、SDIC IBD yard。仅审查当前源码，未改运行源码，未运行构建、测试、浏览器、Blender 或大型 mesh 生成。当前分支 `codex/world-alpha-batch2-20261115`，写报告前工作区干净。以下区分几何契约事实和仍需真实画面确认的视觉程度，不作为 Balanced 或 4341 的验收。

## 1．Intent 内场下切未同步切除共享岛屿地形

**确定的来源冲突，优先处理。** `attractions/coaster-terrain-relief.ts:136-145` 把内场地形压至步道下方 0.26 m，最低 local y=-0.45；同文件的步道起点为 local `[16,.11,36]`。因此该处解析高度被约束为 local y≤-.15，即 world y≤.85。世界坐标是 `[66,≤.85,-159]`，落在 attraction cape 内侧。共享 `WorldLandform.ts:319-336` 在此仍提供 world y=1 的平地，只有 Club pool 的专用下切，没有 Coaster 内场下切。两套 render 和碰撞因此保留两个相互遮盖的地面，内场的低凹部分被 y=1 的旧草地填回。

影响：`WorldIntentCoaster.tsx` 渲染 `structure.steel`，并单独挂 `structure.relief` collider；共享 `WorldTerrain` 的 render／Rapier 地面仍存在。低处的矿物／园地边缘可能被旧草地遮盖，且碰撞无法进入设计的浅切口。`[66,.85,-159]` 是解析契约定位点，实际分片在此插值的精确高度尚未运行查询。

最小修复：由主线程在共享地形中增加有界的 Coaster 底层上限，只在确实被对应 relief 顶面覆盖、且 relief 低于原生地面时把原生地形压到该顶面下方约 3.5 cm。使用与 render／collision 相同的分片高度查询及边界，避免另一套近似函数或扩大整区下切。保留现有 relief、步道、轨道、材质和布局。

验证：在 world x=63..70、z=-162..-156 取实际三角形向下 ray，同时记录岛屿／relief／步道来源，确认下层岛屿不再遮盖低凹面；以普通步行高度从南侧观察 `[66,1.1,-159]` 周围，日／夜同机位、默认 Balanced，检查地面边缘连续且无下落穿洞。安全余量应作用于真实 mesh，不只解析函数。

## 2．北岸道路与路肩是抬高的单层面，没有闭合侧边

**确定的几何缺口，视觉显著程度待实帧。** `attractions/WorldAttractionApproach.tsx:27-37` 的 `ribbon()` 只生成双边顶点和顶面三角形；`:55-59` 把沥青抬到实际地形之上 4.5 cm，路肩抬到 2.2 cm，没有底面、裙边或接地倒角。`groundPolygons()` 也只有单层顶面。两者接缝处的高度差约 2.3 cm；道路外侧有 2.2 cm 未闭合空隙。`polygonOffset`（`:71`）只影响深度，不填充几何。

定位：主路平段 world x≈-75、z≈-140；主路控制线由 `attraction-layout.ts` 的 `[-62,-140]`、`[-88,-140]` 定义，实际 Catmull-Rom 采样线可能轻微偏离 z=-140，应按 `ATTRACTION_ROAD_SAMPLES[0]` 最近切片定位外边。render 来源是 `north-attractions-approach`，沥青顶面原样供 `north-road` collider 使用，路肩无额外 collider。

最小修复：保留顶面与 collider，沿外露道路／路肩边界补窄裙边至对应实际 terrain triangle 高度，或同材质闭合倒角；paint 保留为装饰薄层。不能把所有 lift 直接清零，否则重新引入深度冲突。坡段还应在真实地形跨越处复核顶面内部，但本报告未把尚未量测的坡段穿地列为独立缺陷。

验证：沿实际采样路 x≈-75 的横截面，从近地侧视检查沥青／路肩／草地闭合；从城镇走向 IBD 的普通视角检查道路边缘是否仍形成明亮悬边。此处不是桥，没有保留空隙的设计理由。只补侧面无需新增 collider；若修改顶面，则必须同步碰撞。

## 3．IBD 卡车轮胎与新铺装基准不一致，六轮埋入 6.5 cm

**确定的数值交叠，低优先级接地修整。** `attractions/ibd-yard-site.ts:47` 铺装顶面 local y=.085；`ibd-yard-layout.ts:66-69` 轮轴中心 local y=.6、半径 .58；`ibd-truck-geometry.ts:28-35` 按这些数值创建真实 24 边轮胎。因此胎底 local y=.02，比铺装顶低 .065。不是依赖阴影的推测。

定位：六轮 world x=-73.73／-70.27，z=-167.5／-162.5／-157.5；胎底 world y=1.02，铺装 y=1.085。视觉为 `buildIbdTruck`，铺装三角形同时供地面碰撞；现有车体／货物的 collider 和装卸目标有独立固定高度，不能只移动一个轮胎节点后宣称整车契约已修复。`ibd-ground-contact.ts` 的暗影补丁只是 shading，也不改变交叠。

最小修复候选：先把 IBD 铺装顶定义为共享 survey datum，再统一求静态卡车的支撑偏移 .065，应用于整车可见几何、相应固体和车厢货物／装卸目标。这样保留轮胎形状与车身比例。若主线程判断当前轻微埋胎是有意接地处理，可以记录为已知小交叠，不必为此扩大本轮范围；不要把暗影变浓当作修复。

验证：选 world `[-73.73,1.085,-162.5]` 左中轮，从普通站立高度近看；比较修前／后胎面接地点、轮拱、车厢货物、卸货终点和交互接近范围。整车偏移后必须核对既有固定车厢高度的使用处。

## 覆盖与明确排除

- 营地：审查 `WorldEnvironment` 的 8 个 pad、3 个 tent、4 个 bench、exit lamp，`WorldCamp` 的摆放矩阵及倾斜岩石 grounding，`WorldCampPhysics` 的同矩阵 collider，`WorldCampSiteCraft` 和 `WorldCampContentLayout`。pad 顶 4.9、tent 区禁用 relief、render／collider 同矩阵有一致来源；本轮没有获得足够证据可独立确认营地悬浮缺陷。岩石 AABB grounding 和坡面多脚接触仍需实际几何采样，未凭 AABB 把有意半埋石头列为错误。
- 城镇／道路：审查六栋 building、forecourt、T09 board、MoE palm、T07 lowrise、beach kiosk／lifeguard 的摆放和 fitted hull，`WorldTerrainPaving` 的道路 cap／fill、frozen deck 及 forecourt 高度。除北岸 approach 另列问题外，没有将未量测的海滩脚底状态冒充确定缺陷。
- Intent：审查 cape／survey、arrival 路接合、infield／thrill relief、support 基准、foundation ceiling、结构 render／collider。轨道高架、跨海 support、站台／高廊的空腔是有意结构，不要求下方实心填土；未按单一包围盒给这些区域统一落地。
- IBD：审查凹形 footprint、闭合 paving、east drainage notch、gallery／ramp welded shell、shed 柱脚、固定 truck／轮胎和地面 AO。高廊由立柱承载，桥式吊架和棚顶是有意架空，不属于悬浮 prop。paving 自带闭合边，不与北岸单层 ribbon 混为一谈。

本报告不宣称全世界已通过接地检查。没有浏览器实帧、真实 Rapier ray 记录或默认 Balanced 验收；主线程应在修复后取得对应真实画面再决定是否进入 4341。

## 第 3 项跟进：共享卡车接地基准已修复

已在授权范围内修复，未改变地形、卡车比例、材质、物资尺寸或玩法。共享基准位于 `src/components/world/attractions/ibd-truck-datum.ts`：铺装 local y=.085，原模型轮轴 .6、半径 .58，故唯一车体安装偏移为 `.085-(.6-.58)=.065`。实际胎底改为 .085，与现有铺装顶一致；实际车厢 floor 改为 1.265。

高度来源已逐一追踪：

| 来源 | 原始契约 | 修复后的统一来源 |
| --- | --- | --- |
| 六轮、底盘、驾驶室、货厢、顶棚可见顶点 | `ibd-truck-geometry.ts` 的模型 local 坐标 | 模型保留原值；`groundIbdTruckBody` 只将当前追加的整车顶点加 .065 |
| floor、货厢墙／顶、驾驶室固体 | `buildIbdTruck` 直接 push 与调用方 cube 记录混合 | 同一函数将本次新增 solids 的中心同步加 .065，尺寸不变 |
| 铺装 render／碰撞顶 | `ibd-yard-site.ts` 直接 .085 | 改为同一个 `IBD_YARD_PAVING_Y`，数值与原铺装完全一致 |
| 已装车物资目标 | `IBD_TRUCK_FLOOR+1.1` → `IBD_TRUCK` | `IBD_TRUCK_FLOOR=MODEL_FLOOR+GROUND_LIFT`，两托目标均为 2.365 |
| 装卸路线、动态货物 mesh／collider、Guide 检查标识 | `ibdCargoRoutes`／`ibdCargoPose`／`ibdPhysicalCargoPose`／`WorldIbdGuide` 均消费 `IBD_TRUCK` | 自动使用新终点，地面路线与卸回原检验位不改 |
| 车厢内两盏灯壳、灯源、aim、静态照明 bake | `IBD_FIXTURES` 原固定 y=3.805／aim y=1.6 | 两组位置／aim 经 `ibdTruckMountedPoint` 同移 .065，保留相对车厢照明关系 |
| 路侧装卸杆、Dispatch 交互锚点 | 地面工作站 y=1.1 | 保持地面位置；它们是车外控制杆，实际货物目标已随共享 floor 更新 |
| 两条登车坡道 | 原下端中心线 y=0、上端 floor=1.2 | `ibdTruckLoadingRamp` 保留下端 y=0，仅将上端更新为 1.265；坡度约 22.86°，低于原 25° 步行契约。没有整体抬起坡道脚 |
| 地面 AO | 仅引用六轮的 XZ、半径和宽度 | 没有用变浓暗影掩盖埋胎；AO 结构不改 |

修改的运行源码为 `ibd-truck-datum.ts`、`ibd-yard-layout.ts`、`ibd-truck-geometry.ts`、`ibd-yard-site.ts`、`ibd-yard-lighting.ts`。新增 `ibd-truck-datum.test.mjs`，并更新 `ibd-truck-craft.test.mjs` 与 `ibd-roller-contact.test.mjs` 中受此次接地偏移影响的旧固定高度断言。

验证：独立数值测试 **4 passed / 0 failed**，总耗时约 **379 ms**。该测试未构造卡车／设施／全图几何，直接验证正式偏移函数对可见顶点与固体的同移、场地已有数据前缀不变、六轮旧 `-.065` 交叠与新接地点、两条坡道脚埋入现有铺装、共享新物资终点／装卸反向路线／实际 pose，以及车载灯和地面控制锚点。5 个改动 TypeScript 模块语法转译、两个调整过的既有测试语法检查与 `git diff --check` 通过。

未运行 `buildIbdStatic`、完整 Truck／场景几何、Rapier 步行／货物 swept-volume 检查、浏览器或 build。因此尚不宣称普通视角、实际车轮离散顶点或默认 Balanced 已验收。整车模型和物资相对关系同步保留，坡道倾角小幅增加，集成时应复核原有登车／装卸路径。未提交。

### IBD 定向集成检查与旧射线基准修正

主线程串行运行 datum／craft／layout／roller-contact 后，17 项中 16 项通过，唯一失败为 craft 的西侧开口射线。进一步保留断言复现，旧固定 y=1.3、z=10.5 首次命中 `[13.9028409,1.3,10.5]`，位于新 loading ramp 顶面，尚未进入货厢。新 floor=1.265 时，该射线只高于 floor 3.5 cm，低于坡道顶端约 1.3295；这是测试探针仍在旧坐标基准，不是新 framing 遮挡。主线程同批的实际胶囊上下坡、全尺寸货物装卸 sweep 和车厢 clearance 已通过。

修正仅涉及 `ibd-truck-craft.test.mjs`：开口射线保持原来相对车厢地板 `.1 / 1 / 2.1 m` 的高度，板面和板缝向下射线保持原 `.3 m` 起点距离。原来的 `opening.point.x > 17.85`、射程、两条 loading lane、板缝深度和所有材质断言均保留，增加失败命中点明细，没有删除或放松断言。

随后只重跑受影响 craft 文件，结果 **3 passed / 0 failed**，总耗时约 **486 ms**；`git diff --check` 通过。该次只构造现有测试中的单辆卡车，没有全场景、浏览器或 build。原始合并日志为 `/tmp/world-site-ibd-final-20261115.log`。
