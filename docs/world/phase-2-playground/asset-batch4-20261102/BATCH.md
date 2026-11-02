# 第四批候选：自然表面与营地展示架

起点 `362e68d9e1d8badb2500b617039e4476b913b973`；执行分支 `codex/world-craft-batch4`。维持切面海湾、原调色、地图、物理和既有互动。六个家族按用途计数，树种、石头尺寸和摆放实例不另计。

| 家族 | 实际路径与构造目标 | 所有权 |
| --- | --- | --- |
| 层理石群 | Camp G21/G22/G23 复用于营地外圈、岩台和海墙端点；保留原闭合断面与碰撞，补层理和矿物响应 | 主执行：`tools/world/nature-craft/`、`public/assets/world/nature-craft/`、Camp 路由 |
| 草泥沙地表 | `WorldTerrain.tsx`，现有 PBR 采样方向和覆盖交界 | ground_water，仅地表材质段 |
| 草丛 | `WorldGrass.tsx`，保留 45 顶点／quarry flora ABI，改善叶面扭曲与根尖结构 | 主执行 |
| 树冠 | Camp G16/G17/G18 与 Street ST1/ST2；保留原树干、风权重、LOD、物理与落点，改善叶层和材质 | 主执行：native/export、`WorldStreetTrees.tsx` 与 Camp 路由 |
| 海水与岸泡 | `WorldWater.ts`，多尺度表面与岸边泡沫形态；保留 CDLOD、Gerstner、均水位和互动 | ground_water，仅材质 shader |
| 营地奖杯展示架 | C09，木构连接、板厚与奖杯的杯壁／底座响应；维持原放置、包络和碰撞 | 主执行：native/export 与 Camp 路由 |

新 native 与 GLB 在新目录；原资产原位保留。`?natureCraft=legacy` 为同包旧／新对照。shader 家族以可编辑 TypeScript 为原生源，不伪称 Blender 能代表网页材质。

资源：初检 pressure2、swap11.16GiB、disk4.03GiB。两条轻量协作lane分别处理地表／水和树脚本，仅代码与小检查，不起服务／Blender／浏览器。重型作业持有 `/tmp/bobby-world-phase2-heavy.lock`，顺序为原生制作和渲染、构建、复用已有浏览器实拍与性能。无共享集成树修改、4341切换、push或公开部署。

验收：同灯架原生／fresh GLB，网页同相机日夜，草木触碰与恢复、水面连续运动，同包正常视角性能，分别记录。视觉候选由主协调审阅，不自报用户接受。

资源盘点保护：原始 `tools/world/camp/nature-v4/blend/`、`tools/world/street/blend/`、`tools/world/camp/props/blend/C09.blend`、全部原位 public Camp／Street GLB 均为本批生成和A/B输入，不可清理。`tools/world/nature-craft/`、`public/assets/world/nature-craft/`、本目录为任务产出，保留供主协调审阅与集成；本批临时 Blender 日志位于 `/tmp/batch4-*`，收尾删除无用日志但保留交接指定候选。现有 node_modules 仅复用，不复制。本批不拥有 `resource-audit-20261102/`，不会批量提交它。

R1 网页拒收：新地表 coverage 的 fractional pow 收到 derivative helper 外推负权重，NaN 经 sandWeight／groundBump 的导数传播为黑缝。同包旧材质无缝，不能归因于旧地形。已对新分支权重非负化并安全归一化，新增252个实际边界外推样本，7项定向测试通过。R1候选图、互动与性能保留于 `runtime/r1-rejected/`，不得当最终候选外观或性能。原生、GLB和水材质未改；R2只修地表数值域。

冻结路径保护：`/tmp/bobby-world-batch4-01a19a62` 为R1拒收包，保留到R2／基线审计与主协调审阅完成；`/tmp/bobby-world-batch4-r2-01a19a62` 为待验R2候选。4341原稳定包不属于本任务清理范围。
