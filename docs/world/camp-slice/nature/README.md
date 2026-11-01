> Integration update (2026-10-21): Fable has reviewed and passed all 16 final assets, including the final Draco GLB colour views. Group-local runtime/unreviewed statements below describe the production handoff; current integrated results are recorded in [the camp slice report](../README.md). Bobby has not accepted the sample yet.

# nature 组：G16–G23 营地 L1 样片

2026-10-21，group/opus55-fast 会话。范围仅 G16–G23。没有开 Hy3D，没有改冻结文档、运行时、物理或镜头，没有 commit。

## 产物

| 类型 | 路径 |
| --- | --- |
| GLB（Draco） | `public/assets/world/camp/G16.glb` … `G23.glb` |
| 可编辑源 | `tools/world/camp/nature/blend/G16.blend` … `G23.blend`（旧轮次残留的 `*.blend1` 已 gitignore，可删） |
| 脚本 | `tools/world/camp/nature/build_nature.py`（生成+导出）、`inspect_nature.py`（QA）、`render_views.py` + `compose_sheets.py`（六视图）、`vendor_inspect_connectivity.py`（原样拷自 skill） |
| 机器报告 | `docs/world/camp-slice/nature/qa_report.json`、`manifest.json` |
| 六视图 | `docs/world/camp-slice/nature/views/<ID>_sheet.png`（上排：EEVEE 中性光彩色；下排：Workbench clay），`nature_lineup_front_colour.png` |

复现命令（仓库根目录执行，B=Blender 4.2.23）：

    $B -b --factory-startup -P tools/world/camp/nature/build_nature.py
    $B -b --factory-startup -P tools/world/camp/nature/inspect_nature.py
    $B -b --factory-startup -P tools/world/camp/nature/render_views.py
    python3 tools/world/camp/nature/compose_sheets.py

构建结果是确定性的：连续两次重建得到的 GLB sha256 完全相同。

## 导出约定

米制，+Y 向上，+X 为正面。Blender 内用 Z-up，只由 exporter 转换一次。接地面 y=0，原点放在整体水平包围盒中心；树的干轴与该中心重合（偏差 <1 cm），沿用旧的 0.7×2.8 干碰撞即可。

压缩用 KHR_draco_mesh_compression（Blender 自带 libextern_draco），position 20 bit、normal 10 bit、level 6；所有 primitive 均已压缩，并列入 extensionsRequired。不导出 UV、贴图、顶点色、灯光、相机或动画。

材质名：foliage_dark/mid/light（#6F8A3A/#8AA24A/#A9B35A）、wood_trunk（#5A4634）、stone_base/top（#8C8276/#B4A896）。basecolor 已转为 linear 写入；roughness 0.90–0.96，metallic 0，无发光。GLB 材质的 extras 中带有 materialRole 和 srgbHex。没有逐面随机明暗；石块用两种材质做明暗：法线 z>0.62 的受光顶面用 stone_top。

节点：树按 Fable 审阅意见保留 `G1x`（根）→ `crown` 和 `trunk` 两个语义节点。crown 内每阶颜色一个 primitive，共 3 个，trunk 1 个，所以每棵树 4 个 draw call。灌木和石块是单节点，每种材质一个 primitive。

## 最终实测（以 Draco GLB 的 fresh import 为准）

GLB 轴向 x 深 × y 高 × z 宽，单位米。

| ID | 尺寸 | 三角（评估 / GLB 回读） | 分节点 | prim | 字节 | 回读 bounds 最大差 | 声明预算 | 相对旧估 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G16 圆冠 4 团 | 3.80×5.40×3.40 | 532 / 532 | trunk 212, crown 320 | 4 | 16476 | 1.7e-6 | 900 | 0.59× |
| G17 横向宽冠 3 团 | 2.95×4.80×4.40 | 416 / 416 | trunk 176, crown 240 | 4 | 13800 | 7e-7 | 900 | 0.46× |
| G18 纵叠 5 团 | 2.85×6.30×3.00 | 684 / 684 | trunk 284, crown 400 | 4 | 19392 | 2e-7 | 900 | 0.76× |
| G19 单团灌木 | 1.42×1.00×1.30 | 96 / 96 | – | 1 | 3480 | 7e-7 | 300 | 0.32× |
| G20 双团灌木 | 1.42×1.04×2.00 | 170 / 170 | – | 2 | 6220 | 7e-7 | 300 | 0.57× |
| G21 大石 | 2.20×1.50×2.80 | 44 / 44 | – | 2 | 3308 | 1e-6 | 120 | 0.44× |
| G22 中石 | 1.30×0.85×1.60 | 46 / 46 | – | 2 | 3348 | 2e-7 | 120 | 0.46× |
| G23 小石 | 0.65×0.40×0.80 | 42 / 42 | – | 2 | 3308 | 2e-7 | 120 | 0.42× |

- 冠宽：G16 和 G18 按冠最宽一轴对齐 3.8 和 3.0。G16 另一轴为 3.40，G18 为 2.85，都没有超出声明 footprint。G17 宽轴（GLB z）为 4.4，深 2.95。
- 面数：每个叶团是 80 三角的 icosphere，在 Art Lock 写的每球 60–120 面范围内。石块经凸包和共面合并后为 42–46 三角，超过 Art Lock 字面写的 8–14 面，但仍是宽块面；若 Fable 要更粗，可以再收。三种树都低于旧估。没有使用全局细分。
- 所有轮次的面数变化在 ±15% 以内，没有出现倍数级增长。

## 机器检查（`qa_report.json`，8 件全部 true）

- native 闭合流形：boundary/非流形边与顶点 0，winding 一致，无负体积分量，无零面积或重复三角，Mesh.validate 不需要修复，坐标均有限。
- GLB 原始回读会因 flat normal 和材质缝拆点，表现为 boundary>0，这在预期之内，原始数据保留。另在一次性副本上做 1e-4 m 焊接诊断：8 件的三角数和分量数都等于 native，boundary 和非流形边均为 0。交付物本身没有焊接。
- minZ=0、XY 居中、原点为 0；回读 bounds 差 ≤1.7e-6 m（Draco 量化误差）；回读三角数等于评估三角数。
- materialRole 写在 extras 中，无贴图、无金属、无发光、无展示对象。

分件关系：

| 关系 | 说明 |
| --- | --- |
| wood 连续面 | 干和枝通过 Exact Boolean Union 合成单一闭合壳 |
| 叶团埋入 | 各叶团是独立闭合壳，没有焊接，属于埋入式接触。干梢埋入主团，每根枝梢埋入对应叶团；BVH 重叠接触图连通，没有孤立分量（分量 0 是 wood） |
| G20 两团 | 两团互相埋入 |
| 石块 | 每块一个凸壳 |

## 看图修正（共三轮，现已停）

1. 第 1 轮：树冠所有面都落在同一个材质上。原因是 bm.to_mesh 前没有建材质槽，index 被截断。改为先建槽，并加 assert。
2. 第 2 轮：Fable 审阅要求三树不能只差高度。重做冠形：G16 圆冠 4 团，G17 横宽 3 团，G18 纵叠 5 团；拆分 crown 和 trunk 节点；改为导出 Draco。看图后发现 G17 的各向异性缩放把团压成了蛋形，改为 XY 等比缩放。G16 的分叉点下移，让枝在冠下可见。G20 两团只是相切，改为真实重叠。石块按大中小分别设截面配方，避免三件只是缩放副本。
3. 第 3 轮：G17 侧视只有 2.4 m，像一把扇子。把两侧团前后错开到 ±0.6 m，侧视加深到 2.95 m。主会话指出 clay 行有斜线残影，原因是 Workbench 正交阴影贴图打在 60 m 的地板上；关掉 shadow 和 cavity 后已消除。六视图标签改用 GLB 轴向。

## 未验证 / 留给主会话与 Fable

- three.js 的 Draco 解码、运行时黄昏和夜档外观、三档缩放、实例化后营地整段的同屏三角数，都没有在本组测。
- 石块的大中小组合摆放由运行时负责，素材本身没有带世界坐标。
- 叶团之间、枝与叶团之间是有意的互相穿插（埋入），没有做穷举自相交证明；也没有运行 winding probe。
- 美术验收：机器检查通过不等于美术通过，需要 Fable 看图和 Bobby 走一遍。已知可能的意见：(a) 石块是凸壳，没有凹口；(b) 灌木只用一阶色时较平，G19 只有 dark 一阶；(c) 枝在冠下可见的长度较短。
- 干碰撞继续用旧的 0.7×2.8；视觉干底径 0.74，向上收到 0.5 左右后进入冠。没有改物理。
