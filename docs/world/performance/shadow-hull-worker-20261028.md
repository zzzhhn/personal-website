# 静态阴影冷凸包移出主线程

基线 `9e20d73`，分支 `codex/perf-shadow-hull-worker`。主线集成版本 `54bf06e` 与该基线的相关阴影源码相同。本轮只修改 WorldShadows、shadow-chunk 模块/专属测试和此交接；没有改 Runtime、QA UI、角色、轨道、音频、integration 或 4341，没有推送。

## 证据与实际修正

主线 v21 DEV 固定正午、balanced 的 35.75 秒记录中，首批 184 caster / 540 chunks 经 438 slices 完成，累计 CPU 859.5 ms、墙钟 7582.5 ms、最大 slice 211.1 ms。sceneWork 前 64 条封顶，无法证明最大 slice 所属阶段。本轮没有把 `farHull` 写成已证实的 211 ms 根因。

已确认的源码大单元是：chunk 来源准备调用 `farHull(g)` 时，未缓存几何的全部点去重、`ConvexGeometry`/QuickHull 和法线生成在一个 generator `next()` 中同步完成，没有工作量上限。这个路径现在改为：

- 一个 chunk 事务惰性创建至多一个临时 `shadow-hull` module worker，逐来源复用，只有一个请求在途。完成、失败或取消后终止；不按 mesh 并发创建 worker。
- 主线程每 1024 点复制一次并让出。复制到自有 Float64 数组，以保留原始属性精度；只 transfer 这些自有数组，不转移来源 buffer。若源 bounds 尚未存在，其球体计算也分段完成。
- worker 使用原来的四位小数去重规则、点顺序、同版本 Three ConvexGeometry 与法线算法。返回 position/normal/wind 的 typed arrays 也 transfer；主线程直接包为属性，不再复制一份。
- `hull-submit` / `hull-wait` 会结束当前帧的推进，不在一帧反复检查 32 次。同一帧其余工作预算仍为 32 单元、软目标 3 ms，没有提高预算或减少阴影。
- 原有原始 caster 回退、完整事务发布、实时来源校验、退出/替换/隐藏取消保持。旧 worker 回复通过关闭状态和实例身份隔离，不能写入缓存。
- worker 启动/运行/通信/计算失败后，取消事务并保留原始 caster 阴影，不在渲染线程重跑 QuickHull，也不在每次 rescan 重试。QA `error` 字段说明失败；新控制灯或场景会解除该错误状态。每个在途请求只有一个 15 秒 watchdog，超时立即终止 worker；无新增 RAF 或常驻轮询。

## 有界阶段摘要

原有显式 DEV `shadowRebuildProbe` 窗口内，新事务会记录每阶段 `count / totalMs / maxMs / maxFrame / source`。每阶段仅一行、来源名称最多 120 字符，最多 11 行；超过前 64 个 unit 后出现的大值仍会保留。没有原始逐帧日志或来源历史列表。

沿原采样流程读取 `shadowRebuilds` 即可取得：

```text
shadowRebuilds[i].phases       // main-thread per-unit maxima
shadowRebuilds[i].hullWorker   // requests, workerMs, maxWorkerMs, maxSource, maxInputVertices
```

阶段包括 `validate`、`source`、`hull-copy`、`hull-submit`、`hull-wait`、`hull-hydrate`、`transform`、`bin`、`buffer`、`bounds`、`publish`。`publish` 包含最终来源校验和原子缓存/mesh 切换，`validate` 是每帧推进前的独立校验。`hull-wait` 数值是主线程检查耗时，不是等待墙钟；worker CPU 另列，不计入主线程 `durationMs`。最终发布现在先完成计时，再写 rebuild sample，避免漏掉最后一片。

`?qa=1` 下 `__worldDebug.shadowChunkWork()` 额外提供 `phases / hullWorker / error`。pending 时返回本事务摘要，无 pending 时保留最近一份已完成/取消的摘要；未开启 DEV probe 的事务不生成阶段明细。请在首批资格成立前启动现有 probe，QA UI 无需修改。

## 验证

主线暂停地图页并释放锁后，preflight 为 memory pressure 1、swap 10.35 GiB、磁盘空闲 10.39 GiB，仍按 constrained 串行处理。原子取得并释放自己的 `/tmp/bobby-world-phase2-heavy.lock`；未启动浏览器、开发服务、完整构建、下载或子代理。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/shadow-chunk-builder.test.mjs \
  src/components/world/shadow-chunk-cache.test.mjs \
  src/components/world/shadow-chunk-scheduling.test.mjs \
  src/components/world/shadow-chunk-hull.test.mjs \
  src/components/world/shadow-chunk-integration.test.mjs

node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 \
  --module ESNext --moduleResolution Bundler --jsx react-jsx \
  --allowImportingTsExtensions --types vite/client \
  src/components/world/WorldShadows.ts src/components/world/shadow-chunk-hull.worker.ts
```

25/25 测试通过，0 跳过，最终全套约 2.33 秒。严格 TS 和 diff 检查通过。

- 真实 Node worker 运行同一个生产 worker 入口，Float64 输入、position/normal/wind 与冻结的旧算法逐值相等，源 buffer 保持存活，复制 buffer 确认 detach，两个顺序请求复用同一实例。
- 复制单元最多读取 1024 个点；包含独立源 bounds 对照。
- 覆盖启动、运行、消息解析、计算错误、超时、取消和晚到回复，终止不重复。
- 实际 WorldShadows 接线测试中，取消回复不填充 hull 缓存、不发布旧几何；替换事务发布正确的新几何，失败后仍保留原始 castShadow 且无重复重试。
- 原有几何精确对照、稳定资格、raw shadow pass、增量与首次事务、后到来源不饥饿、退出重入等全部保留。
- 阶段汇总经过 10000 个早期 unit 后，仍保留后来出现的最大值及其帧号，元数据容量不增长。

## 剩余局限与主线验收

这是对已确认同步凸包大单元的实质移除，不是浏览器改善证明。需要主线在同等入口/质量/固定正午重新采样，确认 module worker 打包与加载、最终 caster/chunk/triangle 数、`error === ''`、pending 结束、maxSlice、阶段最大值、墙钟完成时间与昼夜/画质视觉一致；还需在请求进行中隐藏/退出/重入一次，检查 worker 不留存。

3 ms 仍是软目标。TypedArray 分配、来源有效性检查、最终 mesh 发布、JS 数组扩容/GC 不可抢占，阶段摘要用于决定是否还需定向修复。原有 instanced proxy rescan、动画组和独立 far shadow 路径仍使用原同步 `farHull`，不属于本次已测 `shadow-chunks` unit 的改造范围，没有顺带重构整套阴影。

worker 增加一份当前来源的 Float64 传输缓冲以及独立执行环境，峰值内存需要实测；没有并行请求或永久来源缓存。普通暂停可能保留一个待完成事务及其已完成回复/临时 worker，恢复后继续，隐藏或退出会取消并终止；本轮没有修改 Runtime 的暂停接口。若 worker 超时/失败，回退状态的 draw calls 可能较高，但不关闭阴影或降低几何质量。
