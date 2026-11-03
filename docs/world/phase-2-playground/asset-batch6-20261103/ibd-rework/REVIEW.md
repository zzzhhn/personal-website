# 钢卷棚前部一跨

源基线为 `414e86cc1d874722081d2a54b8a6d396034038d8`，候选通过 `qa=1&ibdCoilBay=candidate` 开启。范围是 coil 棚中部门架至入口之间，西侧内墙、两坡屋面、前门架翼缘与两处檐口承托。参考为 `visual-calibration-20261027/ibd.json` 已批准的昼夜方向。

| 普通视角 | 原版 | 候选 |
| --- | --- | --- |
| 正午 | [原图](screenshots/baseline-day.jpg) | [原图](screenshots/candidate-day.jpg) |
| 午夜 | [原图](screenshots/baseline-night.jpg) | [原图](screenshots/candidate-night.jpg) |

普通机位的本地眼位为 [-6, 1.9, 13]，脚下铺装 y=.085 m，最近静态碰撞体距眼位 .88 m。实际游戏世界眼位 [-94, 2.9, -164]，目标 [-106, 8, -183]，FOV 50°，曝光 1，DPR 1，balanced。两版都等实际阴影分块结束后取图。

西内墙的 56 mm 压折属于几何，短折边、底口和檐口回边有真实截面。屋底采用浅色金属衬板，与外坡漆钢区分，两个檐口承托落在原前门架。屋面在中部门架处分割可见外壳，沿用原两坡碰撞盒。样板不改变钢卷、吊机、台柜、坡道、货架和玩法。

`buildIbdArchitecture` 写入角色和几何，`buildIbdStatic` 保留原 `aMat`、`aSuv` 与 `aIbdBake` 并增加 Uint8 标记。实际 `ibd-three-sheds-static` 绘制使用原 `createIbdMaterial` 叠加 `ibd-coil-bay-material.ts` 的米制压纹、颜色、粗糙度、金属度和法线响应，程序键为 `ibd-industrial-v4-static:coil-bay-v1`。角色 0 维持原响应，原地坪分支、夜间填光、动件和台柜回退材质照旧。候选复用合批，无新贴图、定时器或灯光，样板材质随本场景销毁。

碰撞盒、铺装和步行面的顶点／索引、站位与棚位置、分离台柜的全属性指纹与基线一致。原静态网格 45,469 三角面，候选 45,745，增加 276。源缓冲共增加 133,505 字节，其中 84,113 字节为角色属性。该数据是单一网格缓冲增量。

可编辑档案在 [native](native/) 下，来自游戏构造的同一批标记顶点、法线、线性色与索引。Blender 5.1.2 新场景导入 GLB 复核五个具名网格、660 三角面、包围盒偏差 0 米。Blender 和 GLB 使用基础 PBR 材质，米制压纹和原夜间填光在游戏着色器执行。

[檐口近景](screenshots/joint-day.jpg)可见回边、承托和门架顶部。普通机位昼夜均能分辨前跨竖折、屋底顺坡纹和门架。在原灯光下，夜间的浅色屋底与后跨形成明显反差。完整表面程序仍待主协调视觉复核；候选保持显式开启。

[实机配对记录](render-record.json)核对了两版独立构建的相机位置和四元数、FOV、曝光、DPR、时刻与阴影稳定。每对整场快照均为 72 次绘制调用、46 张纹理，提交三角面从 426868 到 427698。此处是渲染计数，未测帧耗时。控制台无 WebGL 错误。

复验使用 `tools/world/ibd-shed-material-sample/check.mjs` 和 `verify-review.mjs`。既有 `ibd-yard-art`、`ibd-yard-geometry`、`ibd-yard-safety`、`ibd-stock-craft` 共 21 项通过。源实现提交 `fb9a2d7`，本地 QA 配置 `astro.ibd-shed.local.config.mjs`，入口参数为 `start=ibd&craftReview=1&qa=1&quality=balanced&ibdCoilBay=candidate`。
