# DJC 池边灯笼精修

更新：r1 网页正常视距暴露了 AO 脏斑与木材额外 tint 过暗的问题。材质局部修正候选见 [r2](r2/README.md)，原 r1 文件及网页证据另存于 `r1-archive/`。r2 未改几何、UV、材质批次数或摆放，网页复核由主线进行。

本包沿用已批准的海岸 Club 和北吧台精修方向。只更换池边小灯笼的视觉资产，摆放和碰撞由原世界代码继续负责。

当前阶段：主线已确认日床材质昼夜对照并放行；原生制作、标准 glTF 导出、fresh import 几何检查与实际渲染已完成。制作端亲自读过 before、refined、fresh overview／close／clay，晚景经修正微量导出发光因子的检查逻辑后单独重渲。网页对照、性能和用户视觉接受仍由主线负责。

| 部分 | 构造 | 需要读出的特征 |
| --- | --- | --- |
| 木底座 | 底鞋、四角立梃、嵌入式双板、肩帽 | 真实板缝、软边、顺材木纹，原底座碰撞不改 |
| 灯罩框 | 四根实木柱、上下企口横框、黄铜套箍 | 接合、厚度与织物的支承关系 |
| 灯芯 | 四块封闭 3 mm 乳白织物夹层，1.8 mm 轻微鼓面 | 白天保留纤维和体积，夜间由 runtime 驱动 emissive |
| 顶盖 | 有厚度的雨檐、四坡实木帽、帽顶 | 斜面和倒角，避免简单浮置方片 |

本地原点是底座底面中心，映射至世界 Y=1.4。原实例无旋转。最大外包络维持 0.31×0.77×0.31 m，原底座碰撞是本地中心 Y=0.2、尺寸 0.3×0.4×0.3 m 的实心盒。

`baseline-captured.json` 来自冻结的实际 `WorldDjcClubGeometry.ts` 执行时截获，不是手工重建。捕获了第一盏真实灯笼的 7 个部件、164 个三角形。离线 before 图将是这些实际几何在统一检查灯架下的渲染，不冒充网页截图。

已冻结的循环实际生成 10 个实例。材质共 4 个：实木、乳白织物、黄铜、暗色内衬。runtime 输出使用合并网格的 4 个材质 primitive，可由多个实例共享几何、材质和贴图。无透射、无导出灯光。材质额外字段 `djcRole=emissive-diffuser` 标识可调光灯芯。

木纹只复用既有日床／吧台来源的本地 CC0 Poly Haven `wood_table_001` 色图和 OpenGL normal，派生为 1024 px；织物色图／normal 和木 roughness 为脚本原创 512 px，AO 为独立 UV1 的 512 px atlas。UV0 只承载标准色图、normal 和 roughness。

```sh
node tools/world/djc-pool-lantern-craft/capture-baseline.mjs
python3 tools/world/djc-pool-lantern-craft/run.py
python3 tools/world/djc-pool-lantern-craft/run.py --finish
```

`run.py` 每次先执行资源预检，原子申请 `/tmp/bobby-world-phase2-heavy.lock`，有锁即退出，不等待、不覆盖。仅运行 Blender 后台进程，3 个 CPU 线程，不创建浏览器或图片服务。

实际交付：`pool-lantern-editable.blend`、`pool-lantern-v1.glb`、独立 `lantern-ao-uv1.png`、同机位 before／after／fresh import、fresh close／clay／evening、尺寸／面数／贴图／许可／哈希 `manifest.json`。

原生包含 54 个独立可编辑部件、11,304 个三角形，均闭合、无退化三角形或非有限坐标。fresh glTF 导入面数和尺寸相同。GLB 包含 1 个 mesh、4 个材质 primitive，1,318,580 bytes；内嵌贴图总量 464,839 bytes。材质为 `DJC_Lantern_Timber_Runtime`、`DJC_Lantern_Diffuser_Runtime`、`DJC_Lantern_Brass_Runtime`、`DJC_Lantern_Inset_Runtime`。所有 primitive 有 UV0／UV1，所有 occlusion 指向 `texCoord=1`。

AO 从原生连续拓扑展开，在导出造成 UV／normal 拆点前完成。展开不设岛间边距，独立 pack 使用 3 px，bake margin 也是 3 px；512 px atlas 实际 UV 面积占比 51.72%，织物约 210 px/m。独立二进制合同检查见 `glb-contract-validation.json`，展开度量见 `ao-validation.json`。

制作端审图保留了深木、少量黄铜、浅织物的分离，检查过顶盖、横框与框柱接合；同机位原生与 fresh 图的木纹／纤维响应一致。晚景只使用导入后的灯芯 emissive，不添加局部灯光。它是离线材质应力检查，不能作为网页照明、FPS 或视觉接受的证据。

普通实例若逐材质绘制，10 盏会形成约 40 个主通道绘制批次和 113,040 个可见三角形；共享几何与贴图不等于自动硬件实例化，也不构成性能提升证明。候选 GLB 未在本工作中写入 public 或默认开启。
