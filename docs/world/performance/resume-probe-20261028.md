# 有限恢复诊断交接

分支 `codex/perf-resume-probe`，基线 `9e514e0`。保留上一轮 `073eefc` 及 `codex/perf-shadow-hull-worker`。本轮仅 WorldRuntime、WorldPlaytestReadout、独立 world-resume-probe helper/tests 与此记录；不修改 WorldActors、第三方依赖、生产物理步长或阴影算法。

## 操作入口

DEV QA 页面普通暂停菜单中，展开 **QA · 恢复诊断**，点击 **QA · 恢复并采集 5 帧**。这个按钮明确恢复探索，只修改 `paused:false`，不改变昼夜、画质、相机、位置或其它玩法状态。固定 shot、泳池检查或未暂停时按钮禁用，隐藏页面也拒绝启动。

采集满 5 个实际帧入口后自动结束，不自动暂停或继续追加样本。点击 **QA · 读取恢复诊断** 读取 `resumeProbe`，应为 `status:complete`。读取不会停止或重新启动采样；过早读取会看到 `armed`。基线只是触发时的暂停状态与上一轮 render counters，没有伪造触发前的 CPU 帧记录。

没有定时器、独立 RAF、轮询、全世界 compile 或生产采样。DEV bridge 使用 priority -1000 的 useFrame 在默认优先级 physics/scene callbacks 之前记录入口，不改变 Physics 的 updatePriority、步长、delta 或暂停逻辑；未显式启动时不读取性能时钟、不安装 renderer/world 包装。生产 JSX 不挂载该 bridge。

## 指标边界

所有时间戳与区间均使用同一 `performance.now()`，原始 `rawDeltaMs` 来自 R3F 回调，不裁剪或丢弃。

| 字段 | 确切含义 |
| --- | --- |
| `triggerAtMs` / `baseline` | 用户按钮触发时刻和暂停状态；GL counter 来自上一轮 render |
| `clockResetAtMs` / `clockResets` | 现有 SceneLifecycle layout effect 调用 clock.getDelta 后的时间戳；不是 React CPU 耗时 |
| `entryAtMs` | DEV priority -1000 useFrame 入口，晚于 R3F 读取 delta；不是浏览器 RAF 入口 |
| `worldStepCalls` | 实际观察到的 world.step 调用次数，即固定模拟 tick；不是推算次数或 Rapier 内部 CCD/solver 迭代数 |
| `worldStepCpuMs` | world.step 的累计同步墙钟 span，包含 Rapier 和它内部调用的 hooks；不包含 React-Rapier 外层 before/after-step 回调、插值、外部事件处理 |
| `firstWorldStepAtMs` / `lastWorldStepEndAtMs` | 该帧首个 step 起点及最后一个 step 终点；二者相减不能代替累计 step CPU |
| `entryToFirstRenderMs` | 入口到首次 renderer.render 开始的墙钟差，可包含物理及其他 useFrame 工作；不作细分归因 |
| `rendererCpuMs` | 该帧最外层 renderer.render 调用累计墙钟 span，包含 shadow、JS 提交和可能的 driver stall；非 GPU 执行时间 |
| `shadowCpuMs` | 最外层 shadowMap.render 调用累计 span，通常是 rendererCpuMs 的子集，不能相加 |
| `programNetGrowth` | 帧末减帧初的 program counter；不是独立测量的 shader 编译次数 |
| `drawGrowthEvents` / `drawProgramsAdded` | draw 调用前后 program counter 正增长事件与增长量之和；可能遗漏没有净增长的替换编译 |
| `largestGrowthDraws` | 每帧最多 3 条耗时最大的正增长 draw 摘要：对象名、材质类型/ID、pass、整个 draw 的 CPU span，均非 shader-only CPU；名称最多 120 字符 |

完整 physics、actor before/after callback、React commit 和 GPU 时间在 `unavailable` 中明确为 null。无法安装的 world.step/shadow/draw 计时点在 `coverage` 标 false，其关键值为 null；不能把不可用读成零耗时。`unattributedWorldStepCalls` 计数只在已启动但不处于帧内时观察到的调用，不强行塞进某一帧。

最多保留 5 帧、每帧 3 条 program 增长摘要，无逐 draw 日志。5 帧结束、显式重新启动、页面隐藏、pagehide 或 bridge 卸载会撤销包装。若主场景渲染未到达，则该帧注明 `render-not-reached`；完全没有 renderer.render 调用时 renderer CPU 为 null，若仅有离屏 render 则保留已测 span。原函数 this/参数/返回值/异常保持；嵌套 render/shadow 只按最外层计时，防止双计。

## 局限

- 诊断会在这 5 帧对 draw 做时钟与 program-count 读取，存在测量扰动；不宣称获得零开销或 GPU 级精确剖析。
- 不补录触发前帧的 CPU，不将 `trigger → clock reset → entry` 间隔称为 React 提交 CPU。
- 若其它诊断在窗口中再次替换同一方法，清理不会覆盖较新的包装；报告 `restorationConflicts`。被其它包装保留的旧探针只转发、不再计时，即使重新启动也不会复活旧采样。出现冲突的窗口应重新验证，不与其它逐 draw 诊断同时开。
- shader 创建也可能发生在 draw 包装范围之外，program 增长只给线索，不能把 draw 全耗时算作编译。物理完整外层成本仍需独立测量后才能决定修复。
- 本轮没有浏览器实测，也没有更改物理行为。主线后续读数决定是否修复恢复追帧或具体 shader variant。

## 验证命令

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/world-resume-probe.test.mjs

node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 \
  --module ESNext --moduleResolution Bundler --jsx react-jsx \
  --allowImportingTsExtensions --resolveJsonModule --types vite/client \
  src/components/world/WorldApp.tsx src/components/world/WorldPlaytestReadout.tsx
```

## 验证结果

- 专属回归 7/7 通过，0 skipped，约 0.34 秒。确定性假时钟覆盖 5 帧上限、真实调用计数、原始 delta、嵌套 render、异常透传、缺失计时点、Proxy、外部包装共存与重新启动。它们验证计量逻辑，不是浏览器性能数据。
- WorldApp 与 WorldPlaytestReadout 完整入口严格 TypeScript 检查通过，exit 0，约 3.93 秒。首次检查发现 sparse worktree 缺少基线已跟踪的 `tools/world/vehicles/door-contract.json`；仅补齐该基线文件，并使用 `--resolveJsonModule` 重跑，未修改车辆代码或 JSON。
- `git diff --check` 通过。
- 验证前资源检查：memory pressure level 2，swap 10.48 GiB，可用磁盘 10.11 GiB。按 constrained 策略串行运行；原子获取共享 heavy.lock 后才启动测试和类型检查，完成后释放自己的锁。
- 未打开浏览器、构建或下载，未操作 4341，未运行真实恢复性能采样。
