# C03–C10 对四个 skills 的只读评估（2026-10-21，G24 会话）

本页只读评估，没有改任何 C03–C10 产物。依据是各组已落盘的 README / manifest / QA JSON、`WorldCamp.tsx` 源码以及我在前一轮作为 shelters 组作者的了解。没有重新跑各组脚本，所以以下是「文件中有或没有的证据」判断，不是新的实测。

适用的 skill：
- `blender-low-poly-pipeline`：全部 8 件。
- `blender-connected-refinement`：全部 8 件（分件关系、内表面、预算倍率披露）。果实项目的 2–6k/8k 上限和通过状态不适用于本 world。
- `low-poly-furniture-design`：C06 长凳、C07 书桌/凳、C09 奖杯架。其 「-Y 为前」默认被本项目导出契约 +X 前覆盖，属于允许的管线覆盖。
- `blender-rig-animation-smoke`：不适用（C03–C10 无骨架）。C10 旗面风动是运行时节点旋转，不是 skin 动画。

## 已满足（有文件证据）

- 米制、+Y 上、底心原点、exporter 只转一次轴：各组 QA 报 min y=0、XZ 居中。
- 评估后三角数 = 最终 Draco GLB fresh import 三角数；包围盒误差在 20 bit 量化内；材质名和 materialRole 在 GLB extras 里。
- 原生闭合壳：0 boundary / 非流形 / 绕序不一致 / 负体积 / 零面积，`Mesh.validate` 不需修复。
- 彩色六视图来自最终 Draco GLB fresh import（shelters 在我补拍后满足）；各组都有「看图后修正」记录，且未把机器通过写成美术通过。
- 分件关系按角色说明：都声明为埋入/叠压的「合理分件」，并明确「不是焊接」。
- sRGB → linear 写入 BSDF，自然材质 metallic 0；C09/C10 的哑光黄铜 metallic 0.40/roughness 0.55，符合契约「少量哑光金属」。

## 不满足或未证明（按严重程度）

1. **分件埋入处的内表面/自交未检查（connected-refinement §4）。** 八件都没有跑 skill 自带的 `probe_internal_surfaces.py`，也没有切面图。各组 README 都如实写了「未证明」，但 skill 明说「每条边有两个面」不能当作无内表面的证据。帐篷墙顶埋入屋顶 3 cm、长凳座木埋入垫木约 10 cm、桌腿埋入桌面 1 cm，都会产生内部面；在不透明材质下通常不可见，但未实测。
2. **碰撞与视觉不对应（本轮用户直接拒绝的问题）。** 旧版 shelters C03/C04 的三角门和前门中央立杆不适合角色进入，当时也未定义碰撞体。主线程已在 `shelters-v2` 重做门洞并导出实际帆布壳 trimesh；C05–C10 仍由 `WorldCampPhysics` 处理，是否与各自视觉形体拟合不在本页范围。
3. **三角预算未按 skill 「先声明再实测」执行。** shelters 旧版和 props 都没有在建模前逐件声明预算上限；shelters 只报了相对 assets-v1 旧估算的倍率，props 以自己的 r1 为基线（1.00–1.03×）。shelters-v2 的 1,020（相对 792 为 1.288×）是实测且已披露。绝对量都不高，没有浪费面数的问题，但流程上不满足。
4. **旧 shelters 的材质审阅不完整（pipeline · material-review）。** 我当时加了两个色板外的派生色（包边 #B9602A、灰床 #5B5650），地布用木干色但 role=canvas。已在 README 披露，但未做同机位 before/after 材质对照。
5. **家具设计指南的视角/支撑审阅很薄（furniture-design）。** C06 长凳没有按设计指南写风格表（板厚、腿比例、边角处理）。C09 侧视是无特征平板，props README 自己记为未改。C07 桌面空，C16 桌灯不在范围。
6. **运行时信息不属于 skill 验收范围但仍缺。** 旧 shelters 交付时无黄昏/夜档、三档缩放证据；这些后来由主会话在 `camp-slice/runtime/` 补了。

## 建议（供主线程取舍，本会话未做）

- 对 C03–C10 各跑一次 `probe_internal_surfaces.py`，把结果写进各自 QA，这是最便宜的缺口。
- 在各组 manifest 里补一行「声明预算」，并把 C06/C07/C09 的家具风格表补齐。


主线程补充：本评估写于静态诊断前。最终 C03–C10 已在 `../static-assembly/` 留存全部三角重心、两档偏移诊断和临时剖面；家具比例表也已补齐。未逐一精确确认所有内部候选；旧资产缺少事前预算的历史缺口保留，不能追认成已执行。
