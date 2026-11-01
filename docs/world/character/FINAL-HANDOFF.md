# 人物局部验证交接 · runtime 冻结后只补报告

主线程已冻结 runtime 于 `44a339e`，采用 `ef423e6` 的**方向优先**安全点搜索。本报告不更改 Guide、Actors 或方向算法，不要求主线再合入旧 Actors。

本隔离树 r15 使用的是**半径优先**：先 front 四个距离，再按 0.65/0.70/0.80/0.90 m 遍历其它方向。主线则每个方向依次尝试全部四距（front → +π/2 → −π/2 → …）。两者可选出不同位置。**本报告 r15 的背后 0.65 m 结果不是主线冻结版本的实测结果，主线该方向分支尚未单独复验。** 不 cherry-pick `882130f` 的旧 Actors 覆盖主线算法。

## 已有局部证据

坐姿/足锚 GLB SHA-256 `5fdb327f8851726a79dbe44029fcfdf411adc5b7594158bb03f57bbf349e54c0`。仅 SitDown/SitIdle/StandUp 采样变化，clip contact masks 逐项相同，其它 12 clips 采样字节相同，Draco 几何 primitive 字节与原锁定版相同；没有新动作、第三 IK、移动或镜头调整。native 与 fresh Draco 三段坐姿各 194 个整数/半帧样本，0 自交，11 项关系全部通过。

| 隔离树局部案例 | A3 固定窗口 | 最终 A6 | 家具靴表面相交 |
| --- | --- | --- | --- |
| C06 r14（front 四距） | 进椅 21.37 mm；StandUp→Idle 26.27 mm；≤40 mm | 该例全部帧通过，JSON 见下 | 既有 r13 稳坐 553 帧 0 相交，坐姿未改 |
| P16 r15（本树半径优先） | 进椅 21.42 mm；StandUp→Idle 24.33 mm；≤40 mm | 794 帧全部通过 | 519 稳坐帧 0 相交 |
| 上下车 r13 | 真实进入/退出成功；未以 clip 名推断 | 137 帧全部通过 | 全身对车体接触路径未专门检验 |

所有 A3 仍用原固定窗口，起停 ≤80 mm、其它切换 ≤40 mm、转身根水平位移 ≤100 mm；无接触的悬垂脚记不适用。原始旋转足弧完整保留，按实际 shownYaw/显示根速区分既有原地旋转口径，未把非旋转滑移删除。r9/r12/r13 的 140–700 mm 失败仍保留，不追溯改成通过。

P16 r15 的退出点距座心 0.65 m，但从坐前显示根到背后点仍移动约 1.1325 m；较 r14 约 1.95 m 缩短，不能据此称体验接受。完整 CPU 蒙皮复核根移动的 20 个相邻端点，最低靴底离地 51.56 mm，数值通过不等于全身对椅背/环境的扫掠通过。后者未测，普通入口/盲审由冻结主线完成。

证据均在 `/Users/bobby/Desktop/3D-personal-world/evidence/character-close/`：`safe-seat-C06-r14`、`safe-seat-P16-r15`、`a3-anchor-vehicle-r13`、`anchor-*-native.json` / `anchor-*-draco.json`、`clip-preservation-anchor.json`。每个目录保留实际 screenshot、原始 frames/skin、A3 窗口和 A6 JSON。Astro 最后检查 0 errors / 0 warnings / 135 hints。此前普通入口 1920×1080 默认/近景与动作 webm 在 `final-r9/`，新改坐姿不能借该未坐下普通入口录像冒充坐姿视觉验收。

## 保留的旧未关项

`slope-v3d.json`：fixture 后等 1.2 s 才开录，之后无传送/坐姿。342 个曲线站立相仍有 40 浮空、21 下陷，maxFloat 94.5 mm。35 个浮空为 stop-step swing，仅能另列；排除后仍有 5 浮空/20 下陷、最大 85.9 mm，不能一概解释成污染或被本次坐姿关闭。

`transition-ab.json`：fixture 后等 1.5 s 才开录，之后无传送/坐姿。Run 210.3 mm 不能归 fixture；`slipByAnim` 混入该 clip 的起步/过渡，最坏 83 ms 区间不足以单独称稳定窗口，但即按起步 80 mm 也超限，保留为旧未关。未为此扩大重跑 gait 全包。

机器局部通过、画面亲看、Bobby 体验接受三者仍分开。主线当前方向优先 P16 分支无专门实测，不能把本树的半径优先数据写成主线全部通过。
