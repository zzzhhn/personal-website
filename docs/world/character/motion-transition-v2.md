# 起步／切换最小修复 — 2026-10-24

基线 b052396。最终仅保留两项明确的 Turn/IdleLook → gait 语义修复：进入步态使用 gait 惯性参数（原来因来源在 EXTRAS，被误分为 interaction，且 interaction 没有 planted 脚快速衰减）；TurnL/TurnR 出口复用既有实际支撑脚、原 contact/soleMin 的相位筛选。所有半衰期数值、接触 mask、阈值不变。WorldGuidePhase、Stop/Slope、物理、GLB 未改。

**A3 仍未收口。** 本提交不能作为完整动作通过；不影响 4322 已发布可玩版。

## 根因证据

旧同向起步最大滑移来自左脚点 1517，而非选中的右支撑脚：5.6322–6.4654 区间包含站立与起步，起步后约50 ms 根仅前移约50 mm，左脚在原6 mm支撑带内后扫181.9 mm；inert角残差1.0891→0.7065 rad、骨盆15.9→11.5 mm，目标contact=[0,1]后变[0,0]。目标的左腿已经摆动，但残差把实际脚留在地面上再后扫；这不是删掉Idle前缀或换标记就能消除的视觉滑移。原始点/根/相位均在上一轮 frames-aligned-candidate.json 中，本轮新基线也复现。

Turn→Run 另有独立分类错误：EXTRAS 包含 TurnL/TurnR/IdleLook，使进入步态仍取 interaction 的腿75 ms/骨盆90 ms，而非既有 gait 腿50 ms/骨盆60 ms/planted12 ms。此次只修调用分类，不改衰减参数。

## 已尝试并退回的方案

- 给所有源贴地脚快速释放：完整同向滑移68.9 mm，但 switch pose second-difference跳到266.8 mm（新基线35.9 mm），不能用数字通过换跳姿；已完全撤回。
- 保原半衰期，按实际惯性曲线预测择相：一轮134.1 mm、switch39.0 mm；再容纳双支撑候选后188.4 mm、switch39.5 mm，16候选里所选预测残差仍119.1 mm。未稳定关闭滑移，新增预测器全部撤回；外部 rejected-predictor.patch 保留实验代码，不进入运行时。
- 上述是有限模型/样本证据，不证明现有动作在数学上无解，也不能把预测值当最终蒙皮验收。

## 最终固定验证

沿用原 motion-bot 的 idle800 ms + start-run1400 ms 完整段；同向补充仍通过原真实按键预对齐、站稳、fixture仅复位位置。没有裁掉Idle>Run／Idle>TurnL>Run区间。含Turn基线以 qa=1&guideTransitionLegacy=1 复现b052396两个分支；G24_TRANSITION_LEGACY=1驱动该开关。

| 段 | 基线最大滑移 | 最终最大滑移 | switch姿态二阶差分 基线→最终 |
|---|---:|---:|---:|
| 原含Turn段 |333.1 mm|237.9 mm|27.6→39.1 mm|
| 同向补充 |本轮263.0 mm，上一轮181.9 mm|181.9 mm|35.9→38.2 mm|

同向分支逻辑本轮未改，不能把263→181.9归为本补丁收益：两次键盘/物理采样有不同起步航向瞬态，本轮基线起步yaw1.429→1.629→1.829，最终更接近原同向样本。最终Run-only6.4 mm，但完整同向起步仍>80 mm；含Turn完整段同样失败。每段一次，不宣称稳定或显著改善。final stance最高35.9 mm同样保留，不将A6通过当作贴地通过。

A6检查最终skin矩阵：含Turn16帧、同向17帧，从首Run前一帧到首Run+250 ms逐帧，every=1、完整同壳/跨壳relation table，均通过。覆盖有限时间窗，不能替代整套动作或艺术接受。所有bot errors=[]；目标WorldGuide TypeScript诊断=[]，motion-bot node语法及diff检查通过。

## 下一步边界

本轮最终3条短bot与2条A6全部完成，不再有后台动作试验。主线接手已有100STYLE Neutral_TR1的真实idle→move窗口只读检查，再由证据决定是否单独加入StartRun；这里没有扩大asset范围。

仅只读核过缓存35_01与09_01：开头0.5秒根平面速度中位分别1.206与3.628 m/s，已在移动，不可直接冠名StartWalk/StartRun。prepare_clips目前把35/09提为平均循环，仅jump/runjump有one-shot。下一步需要实际从静止加速的来源段，保冻结骨架/形象、原许可/全contact mask；如主线据此采用，仅做该起步段与Run衔接的native、Draco、最终A3/A6定向验证。不会通过缩半衰期或改阈值强行闭环。

证据根：/Users/bobby/Desktop/3D-personal-world/evidence/motion-transition-v2；逐项指标、GLB及报告SHA256见同名JSON。原始帧、skin、A6、退回补丁均在外部证据根，不提交大文件。
