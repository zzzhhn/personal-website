# 暂停与隐藏后的模拟时间边界

分支 `codex/perf-resume-time-boundary`，基线 `d6c6a83`。保留 `ab0c850` 和 `codex/perf-resume-probe`。只修改 WorldRuntime、独立 world-resume-time helper/tests 与本交接；不改变 Physics 参数、角色、车辆、画质、shader 或第三方依赖。

## 证据与原因

读取主线尚未提交的 `docs/world/phase-2-playground/visual-calibration-20261027/runtime/world-v22-resume-{cold,warm}.json`。冷恢复首帧 rawDelta 243.8 ms、14 次 world.step、38.3 ms step CPU、36.6 ms render、4 个新增 program；热恢复首帧 223.9 ms、仍为 14 次 step、5.1 ms render、0 program 增长。重复补步不能仅归因于首次 shader 编译。

本地安装的 R3F 9.8.2 顺序：`flushGlobalEffects('before') → clock.getDelta() → useFrame subscribers → gl.render()`。React-Rapier 2.2.0 的默认 follow callback 将 dt 传给 step；step 保持原有 0～0.5 秒 clamp，然后以固定 1/60 秒从 accumulator 逐步扣除，before/after-step callbacks 随每个实际 tick 执行。暂停时 follow callback 不调用 step。

现有 SceneLifecycle 在 React layout effect 内消费旧 clock delta，但到首个实际帧之间还有 224～244 ms 准备/等待。这一段仍被 R3F 当作首帧 delta 交给 Rapier。负优先级 useFrame 也已经晚于 delta 读取，不能在那时补一次 clock reset 来修正当前帧。

## 实现与计时语义

- Canvas 内、Suspense 外挂一个 ResumeTimeBoundary。同步订阅暂停/泳池检查/shot 状态和 visibilitychange；进入非活动状态时登记一次临时 `addEffect`。短暂暂停又恢复、隐藏又显示即使没有中间 React commit，也保留待恢复边界。
- 待本 Canvas active、frameloop 为 always、页面可见且普通玩法恢复后，在 R3F before-frame 阶段消费一次旧 clock delta，然后立即注销该回调。不新建 RAF、timer、轮询或生产方法 wrapper；正常持续运行不读额外时钟。
- 首帧 delta 从这个新边界计算，通常接近零。所有 useFrame 订阅者，包括 Rapier 和玩法动画，仍收到同一个 R3F delta。保留 Rapier 原本不足 1/60 秒的 accumulator 余量；不会清空物理状态、插值状态或改步长。
- 从第二帧起完整保留真实帧间隔，包括首个活动帧本身的模拟、渲染耗时。正常低帧率或运行中卡顿仍按原有固定步长补步，保留 Rapier 原有 0.5 秒上限。没有全局截短 delta、丢弃连续慢帧或改变玩法时钟速率。
- 暂停菜单、shot 的 demand 帧不消费待恢复边界，原有昼夜/天气/画质过渡与静态收敛仍走原逻辑。组件卸载会撤销尚未执行的回调。
- 使用 clock.getDelta 而非 clock.start，不另行重置 elapsedTime；这次修复定义传给模拟的时间边界，不新增累计模拟时钟。

## 诊断与局限

五帧 DEV 探针保留。新边界通过现有 clockReset() 记录，因此 clockResets 可能同时包含既有 layout reset 与新的 before-frame reset；clockResetAtMs 是最后一次。rawDeltaMs 仍是原样记录的 R3F callback delta，现在反映新时间边界，不能把它解释成点击恢复以来的全部墙钟等待。triggerAtMs 到 entryAtMs 仍可用于观察等待。

这不是零成本首帧或无卡顿保证：首帧 React 准备、shader variant、shadow 和 render 成本未被解决，后续真实慢帧仍可能有多个 step。R3F before effects 是全局调度接口，但只消费本 Canvas 时钟，且检查本 root 状态；没有修改其他 root。若以后增加重型 before effect 或多个同时渲染的 root，在 reset 与本 root 读 delta 之间仍可能产生额外耗时，应重新测量。当前 world 未发现其它自有 before effects，XR 不属于此页支持的验证范围。

测试执行安装版 R3F 的 advance/global effects 和从安装版 React-Rapier AST 取得的实际 step 闭包，场景 maps 为空，world 为计数模型。它们验证 delta 传递、固定 tick、回调次数和边界行为；不是完整碰撞、玩法视觉或浏览器性能验收。

## 验证

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/world-resume-time.test.mjs \
  src/components/world/performance-render-policy.test.mjs \
  src/components/world/world-resume-probe.test.mjs

node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 \
  --module ESNext --moduleResolution Bundler --jsx react-jsx \
  --allowImportingTsExtensions --resolveJsonModule --types vite/client \
  src/components/world/WorldApp.tsx src/components/world/WorldPlaytestReadout.tsx
```

18/18 回归通过，0 skipped，约 1.16 秒：恢复边界 6 项、render policy 5 项、probe 7 项。完整 WorldApp + Readout 入口严格 TypeScript 检查 exit 0，`git diff --check` 通过。

恢复测试复现冷态 243.8 ms 对应 14 ticks，并检查边界后为零；warm 223.9 ms 从空 accumulator 只能得到 13 ticks，因此 warm fixture 显式添加 10 ms 暂停前余量，复现 14 ticks，同时验证重置后余量仍保留。这 10 ms 是测试输入，不是对实测缺失数据的估计。首轮 17/18 通过后只纠正了这个测试前提，生产实现未改动。

连续运行回归对比 60/30/10 Hz、不规则帧和 800 ms 停顿的完整 delta、固定 ticks、before/after callbacks 与模型位移，全部与未安装边界的基准一致。连续慢帧没有被截短；800 ms 仍交给 Rapier 自己处理原有 0.5 秒上限。模型位移不等于完整车辆/角色实玩验收。

主线释放锁后每次运行均先 preflight、原子取得共享 heavy.lock，再串行测试和类型检查，结束后只释放自己的锁。最终检查 memory pressure 2、swap 10.86 GiB、可用磁盘 8.50 GiB，按 constrained 策略执行。测试有已安装依赖的 THREE CJS deprecation warning，无测试或类型错误。

未启动浏览器、完整构建、安装或下载；未操作 4341。主线集成后应用同一暂停位置分别测冷/热恢复、隐藏返回与连续低帧率，区分模拟补步改善与独立的 shader/render 成本。
