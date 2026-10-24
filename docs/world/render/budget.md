# /world 同屏预算：工具与实测（render 会话）

## 1. 工具用法（所有会话、主线程通用）

```sh
/Users/bobby/Desktop/3D-personal-world/tools/bot-run.sh <worktree> <端口> tools/world/playtest/budget-peak.mjs [输出目录]
# 可选环境变量：BUDGET_VIEWS=spawn,camp  BUDGET_QUALITY=high|balanced|both  BUDGET_SIZE=2560x1440  BUDGET_HIDE=1  BUDGET_SHOTS=0
# BUDGET_TOP=400 列出更多对象。其他工具：budget-shots.mjs（普通入口 + QA 近景截图；SHOTS_SIZES / SHOTS_ONLY / SHOTS_QUALITY / SHOTS_QUERY）、
# budget-sea-motion.mjs（海面动感像素差，规格 §2）、budget-load.mjs（首包；LOAD_DIST=<astro build 输出目录> 测生产构建）
```

- 需要该 worktree 含 `WorldQuality.createBudgetProbe`（本分支提交；合并到集成版后各区自动可用）。页面里是 `__worldDebug.budget`（仅 `?qa=1`）。
- 视角：出生点、营地（黄昏/夜晚）、大道、环岛西段、北丘、南滩、园区、城区俯瞰、驾驶追尾镜头；另加 integration.mjs 的 QA 固定机位（`shot-*`，阴影窗口为全岛，是 QA 上限，不是游戏镜头）。传送全部记为 fixture，镜头用真实鼠标拖拽与滚轮。
- 每个视角只量**一帧真实渲染**：包住 `renderBufferDirect` 恰好一次 `render()`，按 pass（main / sun / fire）、按区、按对象记 draw call 与三角；总数与 `gl.info` 对账（报告里 `gl.info check` 列）。`BUDGET_HIDE=1` 再逐区隐藏做差，作为独立第二估计。
- 区的归属：`WorldQuality.ts` 的 `budgetZoneOf`（按挂载组名：`world-town`、`world-park`、`world-street`、`world-camp-content`、`world-guide-*`、车辆 userData 等）。挂在自己挂载组下的新资产不用打标签；挂在别处的设 `userData.budgetZone = '<区>'`。阴影代理和合并块会回指来源区，所以阴影开销也能按投影区拆开。
- 输出：`budget-report.json`、`budget-report.md`（总表、各区主 pass 表、各区阴影表）、每个视角一张小 JPEG。

## 2. 基线实测（2026-10-24 15:22，4338，codex/world-render @ 8ac1a76 + 本工具，1920×1080，高档）

证据：`/Users/bobby/Desktop/3D-personal-world/evidence/render/budget-baseline/`。

| 视角 | calls | 三角 | 其中阴影 |
| --- | ---: | ---: | --- |
| spawn | 218 | 556.3k ✖ | 121 / 118.5k |
| camp | 297 | 585.6k ✖ | 152 / 133.3k |
| camp-night | 269 | 585.2k ✖ | 147 / 139.8k |
| avenue | 198 | 392.0k | 100 / 30.6k |
| ring-west | 261 | 499.6k | 83 / 47.1k |
| south-beach | 263 | 463.1k | 81 / 33.0k |
| town-overview | 163 | 444.8k | 103 / 73.8k |
| drive | 170 | 306.7k | 91 / 16.0k |
| shot-overview（QA） | 398 ✖ | 522.3k ✖ | 216 / 97.4k |

公共开销（每个视角都在）：海+天 3 calls / **153k** 三角（限 40k）；地形 8 calls / **171k**（限 80k，terrain 会话负责）；阴影 **最多 152 calls / 140k**（限 85 / 68k），其中营地投影约 100 calls / 125k。城区、园区、街道、车辆目前仍是灰盒，所以各区数值还很小——正式资产进场后必须靠这里压出的余量。

## 3. 优化后实测（2026-10-24 17:05，提交 1b44e85 + 6746d06，同口径）

证据：`/Users/bobby/Desktop/3D-personal-world/evidence/render/budget-after-shadow/`。

| 视角 | 之前 calls / 三角 | 之后 calls / 三角 | 其中阴影（之后） |
| --- | --- | --- | --- |
| spawn | 218 / 556.3k | 166 / 414.8k | 69 / 128.3k |
| camp | 297 / 585.6k | 231 / 441.5k | 86 / 137.1k |
| camp-night | 269 / 585.2k | 206 / 454.6k | 84 / 148.7k |
| avenue | 198 / 392.0k | 154 / 268.9k | 56 / 42.3k |
| ring-west | 261 / 499.6k | 222 / 371.2k | 44 / 60.5k |
| south-beach | 276 / 473.8k | 227 / 341.3k | 45 / 42.9k |
| town-overview | 163 / 444.8k | 115 / 314.8k | 55 / 95.6k |
| drive | 170 / 306.7k | 129 / 182.4k | 50 / 24.1k |
| shot-overview（QA） | 398 / 522.3k | 267 / 399.5k | 85 / 118.1k |

游戏镜头峰值：**231 calls / 46.8 万三角**（camp / camp-night），在 300 / 50 万硬线内。**但这是灰盒版本**：城区、园区、街道、车辆还没进场，余量只有约 3 万三角，装满后必超，见 §5。

### 3.1 海 + 天空：达标

- CDLOD 海面（`WorldWater.ts` / `WorldSea.tsx`）：一个 8×8 格的实例化四边形 patch，每帧按主相机做四叉树选择（离相机 22 m 内 0.5 m 格，每翻倍距离格子翻倍），跳过全在陆地上或视锥外的块，环间 geomorph，无裂缝。仍是 1 个 draw call。
- 实测：海+天 **3 calls，最坏 25.3k 三角**（shore-sea 低仰角近岸），其余视角 1.4k–20.6k；之前恒定 153k。限额 3 / 40k：通过。
- 浪：按局部格子尺寸逐波长淡出（不欠采样），远处由按像素足迹淡出的波纹法线接着动；新增向岸推进的尖峰涌浪（波长 6 m，与拍岸周期同步，沿岸相位偏移，不等距）、碎裂软边浪花（逐像素 fbm 阈值，随浪相生灭，离岸越远越稀）、近岸破浪线距离与宽度沿岸变化、黄昏金色日光路（夜间消失）。
- 动感机器检查（规格 §2：≥3/255、≥10%）：沙滩近景 7.65 / 28.2%，远景 5.79 / 22.3%，通过（`evidence/render/sea-motion/`）。
- 主线程指出第一版浪尖「像一排排长方形白条」，已改（8da1d15）。前后对比：`img/shots-sea-shore-close.jpg` → `img/shots-foam2-shore-close.jpg`。

### 3.2 阴影与营火：draw call 基本达标，三角未达标

做法（`WorldShadows.ts`）：
- 树冠分组：同一资产的 3–4 个风动 InstancedMesh（冠壳 + 树干）共享实例矩阵和同一个风动深度着色器，合成每级联一个代理（每级联 5 组代替约 17 个）。c1 用叶簇凸包（0.6 m 分箱，大于该尺度的缝隙保留），c2 仍是部件凸包。风动权重逐顶点保留，影子与树一起摇。
- 静态合并：刚性、默认深度材质、变换连续两次扫描不变的投影体（含非实例化的普通 mesh，例如将来的楼、展位 GLB）按级联分格合并：c0 16 m、c1 40 m、c2 72 m（远版本去掉 <0.6 m 小件并用凸包）。资产可以用 `userData.shadowGeometry` 提供自己的简化投影体。
- 动态件永不烘焙：人物（蒙皮）、车辆、`userData.obstacle / knockable / pushable / shadowDynamic`、Rapier 实例化刚体（DynamicDrawUsage）、或曾经动过的物体。被撞倒的实例每帧刷新裁剪球。

实测（游戏镜头）：阴影最多 **86 calls**（限 85，差 1；之前 152），最多 **14.9 万三角**（限 6.8 万；之前 14.0 万，没降下来）。三角大头是 c0/c1 里的营地树冠全细节（camp-night：c0 5.2 万 + c1 6.5 万）和帐篷布（约 0.9 万，带风动布料深度材质）。

试过没用的（免得别人重复）：three 自带 meshoptimizer（边塌缩和 sloppy 聚类）在 1–5 cm 误差上限内只能去掉 <7% 的树冠三角，树冠是不相连的叶片，已接近最小。c0 用 0.15 m 叶簇凸包反而变多（几片叶子的凸包比叶子本身三角更多）。

结论：6.8 万的阴影三角分配与「树叶再翻一倍」的营地树互相矛盾，营地五树在 c0/c1 里就约 9 万。不动影子质量的前提下，我建议改预算，不砍树叶影子，见 §5 与 `review-request.md`。

阴影回归：
- `shadow-v41-contact.mjs`（改指 4338 的临时副本，脚本本体未改）：靴底接触缝 gapMax 2.3 / 2.5 / 1.5 mm，在 §4 的 2 cm 内；c0 地面纹素 0.72 / 1.53 cm 未变。
- `drive-route.mjs`：15/21。失败的 6 项（小货车 4 处与西岸步行落水回岸、delineator-0 被撞飞 34 m）在本分支基线（我的改动 stash 后）完全一致地复现，与渲染无关（`evidence/render/drive-route*`）。
- 未跑：`shadow-v41-normal-entry.mjs`（写死 4322 端口与仓库内输出目录，没有改它）。

### 3.3 清晰度：现状已符合，未改参数

- 高档：1920×1080 视口 → 绘制缓冲 1920×1080；2560×1440 → 2560×1440（像素预算 2560×1440，DPR 上限 2，小窗口超采样到 1080 行）。4× MSAA、ACES、sRGB。太阳级联 3×2508²，PCF 5 点 Vogel 半径 2 纹素 + 接收面深度偏移；近景地面纹素 0.72 × 1.53 cm。地形 PBR 纹理各向异性 4。
- 均衡档：像素预算 1920×1080、DPR 上限 1.5；级联 3×1254²（1.44 × 3.06 cm）。
- 同机位对比（`evidence/render/shots-clarity/`，高 / 均衡 × 1920 / 2560）：高档人物影子边缘干净无阶梯；均衡档稍软，无马赛克。这是看图判断，不是 Bobby 验收。
- 各向异性只在地形上设了 4（草纹理、各区 GLB 贴图没设），这些文件不归我。建议各区加载纹理时设 `anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())`。

### 3.4 首包（生产构建，`budget-load.mjs` + LOAD_DIST）

普通入口 /world/ 加载到资源静止：共 **7.46 MB**（静态服务未开 gzip；JS 按 gzip 估 1.25 MB）。JS 3.66 MB（WorldRuntime 单块 2.7 MB，含 three/rapier）、地形纹理 1.96 MB、GLB 1.46 MB（已全是 Draco）、Draco 解码器 0.49 MB。在首包 ≤ 15 MB 硬线内。证据 `evidence/render/load/load-report.json`。

可做但不归我的文件：
- 地形三张 512² 法线粗糙度 PNG 共 1.66 MB，是最大单项；改 WebP 可省约 1 MB（terrain）。
- Draco 解码器 wasm 与 wrapper 各被请求两次：`WorldCamp.tsx` 与 `WorldGuide.tsx` 各自 new 了 DRACOLoader。共享一个实例可省 0.25 MB（集成时统一）。
- 各区 GLB 继续用挂载点的 Suspense + `useLoader` + 本地 Draco；贴图用 JPEG/WebP，不要 PNG。

### 3.5 夜间点光源与共享小工具

- 全岛点光源 **7 盏**（营火主灯（唯一投影）、园区 3 盏补光、营地蓝灰补光、营火暖反射、一盏 6.5 m 小灯），≤ 8。
- 新增 `src/components/world/WorldGlow.tsx`（7ebfd41）：
  - `glowMaterial(color, { dusk, night })`：发光材质跟随共享夜间时钟，同参数共享一个材质与着色器。
  - `<LightPools pools={[{ position, radius, color, strength, day }]} />`：地面光斑；一个区的全部光斑 = 1 draw call，每个 2 三角，加法混合、无深度写入、随夜间淡入。
  - 自检：`?qa=1&glowDemo=1` 在南滩栏道放 3 个光斑 + 1 个发光方块（`evidence/render/glow-demo/`）；普通入口不显示。

## 4. 各区在自己最坏视角的主 pass 开销（灰盒状态）

| 区 | 限额 | 实测峰值 | 备注 |
| --- | --- | --- | --- |
| 天空 + 海 | 3 / 40k | 3 / 25.3k | 通过 |
| 地形 | 8 / 80k | 8 / **171.1k** | terrain：远处地形仍全密度，单项最大超支 |
| 草与卵石 | 2 / 40k | 2 / 46.9k | north-hill 俯视略超 |
| 营地 | 40 / 60k | **80** / **86.9k** | camp：正式资产，小部件未合并 |
| 人物 | 6 / 12k | **8** / 3.1k | G24 是 8 个蒙皮子网格 |
| 车辆 | 18 / 30k | **36** / 0.9k | 灰盒车每辆 12 个小块；正式车请控制每辆 ≤ 6 calls |
| 灰盒（待替换） | 0 | 17 / 3.5k | 各区认领后消失 |

## 5. 预算建议（待审阅确认，见 review-request.md）

硬线 300 / 50 万不动。

| 归属 | 当前分配 | 建议 | 理由 |
| --- | ---: | ---: | --- |
| 天空 + 海 | 3 / 40k | **3 / 28k** | 实测最坏 25.3k |
| 太阳阴影与营火 | 85 / 68k | **85 / 110k** | 实测 14.9 万，营地五树约 9 万；我继续压到 11 万内 |
| 地形 | 8 / 80k | 不变 | 现在 171k，需 terrain 做远处 LOD |
| 草与卵石 | 2 / 40k | 不变 | |
| 营地 | 40 / 60k | **40 / 50k** | 营地树的三角已计入阴影；主 pass 需合并小件 |
| 城区 / 园区 / 街道 | 45/80k · 40/55k · 30/30k | **45/70k · 40/48k · 30/27k** | 为阴影腾 2.5 万；各区的阴影由合并块承担 |
| 三车 / 人物 | 18/30k · 6/12k | 不变 | |
| **合计** | 277 / 495k | **277 / 495k** | 余 5k（与现表同；只在区间重新分配） |

## 6. 最终整合同帧记账（2026-10-24）

前述各分区数值是历史规划，不再当作可同时用满的独立验收线。按规格§15.5，在同帧300calls/500k总线内共享额度；不把不同机位的区域峰值相加。最终22个玩法视角峰值235calls/453093tri，5组真实切换峰值240calls/492281tri，所有阴影提交计入，固定采样与gl.info逐项一致。6盏point light。近景叶片/太阳atlas保持，采用逐楼LOD、中远车影LOD与镜头外草裁剪。

最终归档见 [FINAL](../integration/FINAL.md) 和 [机器摘要](../integration/final-verification.json)，包含旧分项计划/实际观察值和未验证项，不将本机计数等同M1 60fps或用户接受。
