# 国投玩法与首次引导：接续、取消与结果反馈

2026-10-28。工作区 `personal-world-phase2-playground`，分支 `codex/goal-ibd-play`，基线 `43f9507`。按 `goal-delegation-20261028.md` 的交互文件所有权实施；本轮不改变 IBD v1 的已批准方向。

## 本轮实现

1. **下一批直接接续。** 原来在发货闸选择“接下一批”后还要返回接货台领单、重新取同一套工具。现在这一操作直接接收新单，保留已取工具；新批次的货物、证据、退换记录和发货确认均清空。未取过工具的玩家仍须取工具。“重做本批”仍完整重置。
2. **检查可主动取消。** HUD 对取工具、检查、称重、开箱和核单提供一个次级取消按钮，调用既有取消入口。点击时再次检查当前动作，避免旧按钮误取消后续运输。吊运、转台、装卸、退换和升闸不增加取消入口，保留既有物理联锁。
3. **结果就地说明。** 领单后直接显示库存与发货目标；开箱核验显示实点件数和规格。少件、错规格和已照见的背面凹痕分别给出具体结果与下一步。反馈只来自完成动作及其已取得的证据，称重、开盖或取消均不会泄露未检查的差异。没有增加常驻说明面板。

`completedAction` 是最近一次已完成操作的反馈上下文，不是新的教程进度。引导继续由真实货物证据推导下一步；观察操作的可取消条件和离开检查位的完成条件共用同一集合。

## 自有改动

- `src/components/world/attractions/ibd-yard-game.ts`
- `src/components/world/attractions/ibd-yard-guide.ts`
- `src/components/world/attractions/WorldIbdHud.tsx`
- `src/components/world/attractions/ibd-yard-recovery.test.mjs`
- 本交接文件。

未改静态模型、材料、照明、站位、路径、机制刚体或全局交互。HUD 复用已有按钮样式，无新增 CSS。主线补入的 `src/components/world/AGENTS.md` 软链接留在工作区，不纳入本提交。

## 验证证据

```sh
node --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/ibd-yard-recovery.test.mjs src/components/world/attractions/ibd-yard-game.test.mjs src/components/world/attractions/ibd-yard-guide.test.mjs src/components/world/attractions/ibd-model.test.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler --allowImportingTsExtensions --jsx react-jsx --types @react-three/fiber src/components/world/attractions/WorldIbdHud.tsx src/components/world/attractions/WorldIbdGuide.tsx
```

30/30 定向测试通过；类型检查零诊断；`git diff --check` 通过。类型检查使用共享 heavy lock，完成后已释放。第一次单独检查 Guide 时未载入 Fiber JSX 类型而报错，补齐命令的 `--types @react-three/fiber` 后通过，未为检查改动组件源码。

新增测试逐一验证四种货单每个计时步骤的重复请求、暂停／隐藏／离场、取消、重入、旧回调、重新执行和最终放行；另验证连续四批接续、重复发货闸输入不跳批、没有工具不凭空获得工具、重做完整重置、高廊检查取消，以及中英文反馈不提前泄露差异。原有 19 步首次流程、异常退换后重检、错误装载后卸回修正、物资模型及地面引导净空回归仍通过。

## 主线接续与未验项

无需跨线源码接口。按用户资源限制未开浏览器、完整 build、Blender 或下载资产；未推送、合并或更新 4341。资源预检为 memory pressure 2、swap 10.89 GiB、可用磁盘约 2 GiB。

在主线下一次浏览器串行窗口检查：

- 首批领单后目标显示，以及 19 步正常流程。
- 检查中点击取消，确认无证据增加、重试成功；检查中走开后返回也可重试。
- 少件／错规格／后卷凹痕三类结果，退换后新货重新核验。
- 发货闸接下一批后直接指向钢卷，工具不重生，货物与证据重新开始；自由模式仍可操作。
- 中英文、日夜和窄屏下取消按钮与结果反馈的可读性。

上述浏览器操作、物理观感和视觉接受均未验，不能以本轮源测试代替。
