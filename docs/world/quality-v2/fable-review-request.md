# Fable 最终复核交接

当前状态：73aa0bb6角色与QA动作候选已形成统一证据；尚未取得A–D通过。旧17:00设计通过仍作废。此前d3缺陷纠错已通过CUA实际收发；本更新验收包尚未送达，最近系统再次锁屏。不要把文件存在当作Fable已读。

已核实新预览：https://2150a1ce.personal-website-aew.pages.dev/world/ （e1e546f，资产73aa）。17个发布GLB哈希一致、0页面/HTTP错误。动作审阅入口：https://2150a1ce.personal-website-aew.pages.dev/world/?qa=1&qaPhase=1&qaStop=1 。已实测普通入口两项候选开关为false、审阅入口为true。旧75d2f9c/d3仅作失败历史。

仓库 `/Users/bobby/WorkBuddy/personal-website/personal-website`，分支 `codex/world-greybox`，PR #1。先看 `docs/world/quality-v2/review.html`（可用本地文件浏览器打开），再按下列证据逐项判定。冻结文档仍由 Fable 维护；主线程不改 PRD/Art Lock/制作管线。

## A 角色

- `guide/manifest.json`、`guide/README.md`、`guide/final/G24_sixview_final.png`、`G24_poses_final.png`、最终 Draco 回读视频。
- `playtest/transitions-73aa-prototype/`：两档20项过渡数值通过，完整2秒松键窗口收脚归off，0相位超时、0错误。稳定走/跑≤0.98cm，停步≤1.09cm，走跑切换≤1.02cm。脚弧长按20:45决定仍记录。
- `playtest/interruptions-73aa-prototype/`：收脚中真实反向180°、重新起步、Space跳落、Esc暂停恢复，10项操作通过。另`integration-73aa-prototype/`实测收脚中E上下车3项通过。三组共2,134个实际混合/IK后的采样姿态，同壳与非预期跨壳交叉0，未归类0，11条连接全部达到声明值。原始矩阵已无损归档；有限采样/浮点/最近法线局限见`runtime-relations-method.md`。
- `guide/final/a6/`：native、未压缩、Draco各522个姿态的闭壳与跨部件专项；最终GLB SHA-256为73aa0bb63b2e7ba5dfea4237bcfa361343fc2028626a65265d1d1eec10162bf7。
- 自制L1、18骨、5 clips，不是Mixamo。A2并排图仍显示夹克宽度、面罩厚度和肩部细节差异，请直接判读；不以几何通过替代形象对齐。

需要先明确一个行为例外：纯速度/相位修正仍不能消除跨步姿态回Idle造成的脚位差。已做成可审阅QA候选：接触相距离时钟，最多0.4s等待安全混合；短时两骨IK配合抬脚收步，骨盆降低最多5cm、腿不拉长，物理刹停不变；快速转身时脚目标随根同转。普通入口尚未启用。请结合两档正常速度视频，决定是否接受此前“不做Stop/IK”的最小例外。详见`fable-stop-request.md`，不用转问Bobby技术细节。

保留失败与限制：原生Jump局部接触滑移35.85mm仍为failed；73aa运行Jump/Land已采集且关系通过，但需分别看真实离地轨迹与原地片段，不能拿d3旧20帧解释当新证据。斜坡收脚、Run中跳跃等未测范围保持标明。

## B 自然资产

- `nature/README.md`、`manifest.json`、`qa_report.json`，8件最终GLB回读六视图、灰模/风动/游戏机位。
- G16/G17/G18 三种树形，4288/3190/3860 triangles，391/275/235片可辨折面叶；最大基干径/冠宽0.124/0.133/0.127。G19/G20多层灌木990/1744，G21–23切面岩244/222/162。预算按skills角色定额，未套旧900/100上限。
- 树枝为连续闭合硬结构；叶片根部嵌入核。几何QA保留未穷尽自交的限制，不把最近距离诊断当完整自交证明。

另补 `static-assembly/README.md`、report和两份剖面拼图：C03–C10最终GLB全部三角重心内部表面诊断，两档epsilon，不是精确自交证明。旧家具预算前置声明缺失作为历史流程缺口保留，未补写成当时做过。

## C/D 运行与bot

- 简表 `runtime/acceptance-summary.json`，原始 `playtest/acceptance-r3/report.json`：16类首实例四方向64/64复合案例，14/14运行检查，11路点连续真实按键0恢复，0 JS/console/HTTP错误。原始失败 `playtest/final` 和定向修复 `repair-r2` 保留。
- C08 始终是书堆；上次“笔电/屏幕”是旧变量命名误导造成的交接错误，资产内容没有变化。真实地面四向受 C07 桌面正确阻挡，按 C1-a 在书堆上半部高度作5cm球四向隔离查询，误差<0.004mm。查询不算真实步行。
- G23 四向真实接触，已存轨迹派生检查 `acceptance-r3/step-over-derived.json`：可见高0.24m，抬升0.123–0.220m，均≥50%，是solid可跨，不是trigger-only。
- C03/C04真实门洞、进出证据；硬件凹处不再由整体凸包填死。树干/家具/岩来自最终GLB，灌木分簇闭核+6cm软叶边缘。最大采样视觉边差约7.03cm。
- `motion-r2/tree-full.webm`、`tent-front.webm` 正常速度5.5秒完整物件视图，黄昏/夜档风视频同目录；固定全景截图不冒充动态。根固定、枝叶上界<13cm、旗7.45°；帆布固定边，中部厘米级位移。详见 `motion-audit.md`。
- 原锁定灯光方向、强度、色板保留；`review.html` 旧r4/返工同固定机位双档并排。地面仅材质层和必要轮廓密度，物理高度没改。
- 实际buffer1080p/1440p，DPR2与4xMSAA实测；`playtest/README.md` 可自行运行/改路径。已有connection三条回归通过，仅运行一次。

请按既定A–D逐项写过/不过，指出证据不足或实际缺陷；全部通过才恢复营地样片通过。Bobby未接受，不因机器检查通过代签。未认证范围：M1 Air性能、每个实例所有角度、高速驾驶、轮胎侧碰架构、复杂斜坡脚IK、近处树冠/帐篷任意遮挡、其他区域正式资产。
