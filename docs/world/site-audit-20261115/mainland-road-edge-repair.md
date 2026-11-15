# 北岸道路侧缘闭合

已修 `mainland-findings.md` 第 2 项。只改 `WorldAttractionApproach.tsx`，新增纯数值 `attraction-approach-edges.ts` 和对应轻量测试。未改共享地形、卡车、道路顶面、paint、材质、布局或质量默认值，未提交。

实现从现有实际顶面三角形提取边界，分割部分共边后仅补露出的高面侧缘。相邻面同高时不建侧面，高沥青遇低路肩时只补其高度差；低路肩已被沥青覆盖的内边不建重复面。arrival walk 只参与邻接判定，保留开口。底缘继续调用 `approachHeight = meshHeight ?? terrainHeight`，在真实侧缘坐标取样，不引入固定 y=1 或另一套地形公式。

裙边合入原有 asphalt／shoulder render geometry，并复用原有材质，无新增 draw mesh、材质或 collider。原顶面 position／index 数组先保留，`north-road` collider 继续读取这些原数组，避免纯视觉裙边改变物理形状。paint 和 walk 原样保留。

验证：`node --test src/components/world/attractions/attraction-approach-edges.test.mjs`，6／6 通过。覆盖斜地精确接地、朝外法线、同高共边、部分分支开口、重叠高低肩部和真实 arrival survey 的主路接合。真实 arrival survey 小测试不导入 `WorldLandform`，所以没有生成大地形。

另外，用 HEAD 旧文件和当前文件的实际顶面生成函数，在同一个恒定地形回调下分别执行，检查原顶面 position／index、render 前缀及 walk 完全一致。证据如下；这里是有界离线几何证明，新增三角数不冒充实际地形上的运行时计数。

| 面 | 原顶面 position SHA-256 前 16 位 | 原顶面 index SHA-256 前 16 位 | 新增纯视觉侧面三角形 |
| --- | --- | --- | --- |
| asphalt | `3bceb485fc94853a` | `748a4efd8f65d97c` | 706 |
| shoulder | `55a89c3efd05aed4` | `3d4680bb75a19851` | 692 |
| paint | `c8c1828f7b3e2d86` | `92637cdcbc5a98fc` | 0 |

draw mesh 保持 3 个；walk position／index 不变。未运行浏览器、构建、Blender、全套测试或真实大地形检查。主线程仍需在共享地形集成后串行复核实际三角形接地，并在默认 Balanced 的普通视角检查北岸边缘及 arrival 接口，再决定进入 4341。
