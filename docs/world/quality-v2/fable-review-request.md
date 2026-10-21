# Fable 最终复核交接

当前状态：返工实现与运行证据已整理，尚未取得 A–D 通过。旧 17:00 设计通过仍作废。Mac 锁屏时 CUA 不能发送，不把本地文件存在当成已送达。

仓库 `/Users/bobby/WorkBuddy/personal-website/personal-website`，分支 `codex/world-greybox`，PR #1。先看 `docs/world/quality-v2/review.html`（可用本地文件浏览器打开），再按下列证据逐项判定。冻结文档仍由 Fable 维护；主线程不改 PRD/Art Lock/制作管线。

## A 角色

- `guide/manifest.json`、`guide/README.md`、`guide/final/G24_sixview_final.png`、`G24_poses_final.png`、最终 Draco 回读视频。
- `playtest/motion-r4/` 为 d3ccc5919af1 最终候选的真实按键专项：Idle/Walk/Run/Jump/Land、实际位置/变形后鞋底、1080/1440 buffer，4/4，无错误，接地采样下沉0。腕部修复后的模型与这份专项hash一致，正常速度按键录像超过10秒。
- 自制 L1 骨架，不是 Mixamo。Walk/Run 实际速度1.8/4.2m/s。走跑混合短暂鞋底下沉用上限2.5cm视觉补偿，最终专项实测最大1.53cm，不改变刚体轨迹，也不是坡地IK。

补充必须判读：guide manifest 保留原生 Jump 的局部地面接触滑移诊断 failed（3.50cm），以及 body BVH 自交候选计数（非零、未穷尽判定）。主线程没有将它们抹成通过。`motion-r4/jump-contact-interpretation.json` 说明这次真实物理跳跃的20个Jump采样全部离地、最低靴底高于地面25.8cm，因此原地clip局部地面诊断不等于运行时真实滑脚；但不替代你对全部A项的判断。

## B 自然资产

- `nature/README.md`、`manifest.json`、`qa_report.json`，8件最终GLB回读六视图、灰模/风动/游戏机位。
- G16/G17/G18 三种树形，4288/3190/3860 triangles，391/275/235片可辨折面叶；最大基干径/冠宽0.124/0.133/0.127。G19/G20多层灌木990/1744，G21–23切面岩244/222/162。预算按skills角色定额，未套旧900/100上限。
- 树枝为连续闭合硬结构；叶片根部嵌入核。几何QA保留未穷尽自交的限制，不把最近距离诊断当完整自交证明。

## C/D 运行与bot

- 简表 `runtime/acceptance-summary.json`，原始 `playtest/acceptance-r3/report.json`：16类首实例四方向64/64复合案例，14/14运行检查，11路点连续真实按键0恢复，0 JS/console/HTTP错误。原始失败 `playtest/final` 和定向修复 `repair-r2` 保留。
- C08 始终是书堆；上次“笔电/屏幕”是旧变量命名误导造成的交接错误，资产内容没有变化。真实地面四向受 C07 桌面正确阻挡，按 C1-a 在书堆上半部高度作5cm球四向隔离查询，误差<0.004mm。查询不算真实步行。
- G23 四向真实接触，已存轨迹派生检查 `acceptance-r3/step-over-derived.json`：可见高0.24m，抬升0.123–0.220m，均≥50%，是solid可跨，不是trigger-only。
- C03/C04真实门洞、进出证据；硬件凹处不再由整体凸包填死。树干/家具/岩来自最终GLB，灌木分簇闭核+6cm软叶边缘。最大采样视觉边差约7.03cm。
- `motion-r2/tree-full.webm`、`tent-front.webm` 正常速度5.5秒完整物件视图，黄昏/夜档风视频同目录；固定全景截图不冒充动态。根固定、枝叶上界<13cm、旗7.45°；帆布固定边，中部厘米级位移。详见 `motion-audit.md`。
- 原锁定灯光方向、强度、色板保留；`review.html` 旧r4/返工同固定机位双档并排。地面仅材质层和必要轮廓密度，物理高度没改。
- 实际buffer1080p/1440p，DPR2与4xMSAA实测；`playtest/README.md` 可自行运行/改路径。已有connection三条回归通过，仅运行一次。

请按既定A–D逐项写过/不过，指出证据不足或实际缺陷；全部通过才恢复营地样片通过。Bobby未接受，不因机器检查通过代签。未认证范围：M1 Air性能、每个实例所有角度、高速驾驶、轮胎侧碰架构、复杂斜坡脚IK、近处树冠/帐篷任意遮挡、其他区域正式资产。
