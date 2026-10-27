# 主塔结构美术样板

2026-10-28。仅主塔，主控负责同机位昼夜实机验收。实施参考为 `coaster-day-v3.png`、`coaster-night-v3.png`，旧实机基线为 `coaster-v3-overview-night-wall-lighting.png`；参考方向授权不等于本样板已获视觉验收。

## 保留与改动

- 保留 54 m 主体、西侧设备脊、基础位置和四个平台的原有占地与高度。轨道、车辆、乘坐节奏、TessellateModifier、地形 relief 接线均未修改。
- 将整面白色壳拆为深色内核、四角承重柱、分段侧壳、短窗带与三层正面设备舱。平台增加厚度、斜撑和实体扶手，顶部增加驱动头，底部增加检修柜及百叶。
- 主体靠轨道一侧维持原位置，少量灯具与紧固件向外伸出不到 0.5 m；顶部设备与信号杆达到局部 y=56.2 m，已通过下述数值净空检查，仍待实机观感校准。
- 原主体碰撞由 3 个粗盒细分为 78 个塔体碰撞体，覆盖主壳、平台与扶手。细小螺栓、灯面、支撑筋使用批次中的静态几何。
- 暖色顶点补光匹配平台灯具，并给东侧壳添加三处局部静态补光。没有新增实时灯、材质、纹理或静态绘制批次。

## 预算

| 项目 | 修改前 | 当前 | 增量 |
| --- | ---: | ---: | ---: |
| 主塔近景 | 972 | 5,600 | 4,628 |
| 主塔远景 | 828 | 4,760 | 3,932 |
| 全场近景，含三节车厢 | 89,724 | 94,352 | 4,628 |
| 全场远景，含三节车厢 | 43,364 | 47,296 | 3,932 |

本轮上限是主控明确授权的塔体增量 6,000 triangles。两处既有预算测试及静态预算检查按修改前基线加该固定额度更新，未删除安全测试或修改加速度阈值。全场依然两批静态几何，远景轨道仍为 256 步。

## 验证状态

三角形与碰撞体数量已在共享重任务锁内串行量测。以下四份测试文件以 `--test-concurrency=1` 运行，37 项全部通过，耗时约 42 秒：`coaster-tower.test.mjs`、`coaster-track.test.mjs`、`coaster-art-candidate/art.test.mjs`、`coaster-landscape-cliffs.test.mjs`。

- 新增塔体检查沿轨道均匀取 2,400 个样本，在靠塔范围对真实三角面检查列车与头部包络，最小额外余量 **0.373 m**。这是一项离散数值证据，不冒充连续物理证明。
- 三种乘坐视角分别在 2,400 个均匀弧长位置检查真实塔体视线。既有全结构视线、轨道间净空、1 m 乘员碰撞包络、70 秒节奏及加速度检查也通过，阈值未改。
- 自由相机使用实际 Rapier 碰撞体与现有 `sweepCamera`，以半径 0.22 m 测试两侧塔壳、四个平台及栏杆，共 22 条扫掠路径，全部正常截停。
- 正面及东侧的不透明几何均通过局部暖色顶点受光检查。两批合并几何属性有限且兼容，未增加实时灯。

`coaster-geometry.ts` 与 `coaster-landscape-lighting.ts` 的定向 TypeScript 检查通过。全部检查完成后已释放共享重任务锁。

没有启动浏览器、构建或新服务，没有提交或推送。仍需同机位昼夜视觉对照与实机移动体验，源代码和数值检查不能替代这两项。

## 文件

- `src/components/world/attractions/coaster-geometry.ts`：仅主塔函数与原调用位置。
- `src/components/world/attractions/coaster-landscape-lighting.ts`：仅塔体补光源。
- `src/components/world/attractions/coaster-tower.test.mjs`：新增定向验证。
- `src/components/world/attractions/coaster-track.test.mjs`、`coaster-art-candidate/art.test.mjs`：仅本轮预算断言。
