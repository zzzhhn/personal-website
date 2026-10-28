# 首次静态阴影构建分帧交接

分支：`codex/perf-shadow-sliced`。基线：主线已集成的 `be933cd`。保留先前 `codex/perf-shadow-incremental` / `3a8a0ff`。本轮只改 WorldShadows、shadow-chunk 模块及专属测试；没有修改 Runtime、角色、轨道、IBD、音频或 integration，没有推送或操作 4341。

## 问题与改动

主线 v20 DEV 定位记录中，首次 129 个稳定投影物构建 532 块耗时约 531 ms，最慢帧约 604.6 ms。后续 55 / 13 个新增来源已走 append。这是不同加载窗口的定位证据，不是受控 A/B。

现在首次构建和追加均由 `fitSunShadow` 的现有渲染帧推进，每帧至多 32 个生成器工作单元、软目标 3 ms。顶点变换每 1024 点、分桶每 512 三角形、缓冲复制每 4096 数值、球体及光空间边界每 1024 点让出执行。沿用原三层 cell、稳定两次扫描资格、远层尺寸阈值和凸包、浮点运算与三角形顺序；同步接口仍可供短测试使用。

构建按事务发布，未完成首批不设置 `merged`，原始 caster 继续按现有独立阴影路径投影；追加时旧块仍可使用，新增来源继续独立投影。全部新缓冲完成且来源校验通过后，同步交换缓存和 Mesh。后到的稳定来源不会使首批重启，随后按原扫描节奏追加。

每片执行前以及提交前核验当前场景归属、caster 身份、资格、变换校验和、几何/属性身份及 position/index 上传版本。变化取消旧事务；源几何 dispose、来源或其祖先移除、控制灯移除、场景或控制灯更换、隐藏页面/pagehide 均有清理路径。取消会关闭生成器，释放暂存块、脱离监听器，并清除无效发布块以恢复原始投影。源几何不由缓存释放。

仅保留一个待完成事务。已整理块的 JS 数值数组立即清空；不新增持久的来源三角形或变换缓存。追加阶段被触及的旧/新块缓冲会短暂共存，以支持原子切换。

## 已完成验证

2026-10-28，最终短验证前 preflight：memory pressure 1，swap 9.33 GiB，空闲磁盘 12.33 GiB，仍按低磁盘资源约束串行运行。原子取得 `/tmp/bobby-world-phase2-heavy.lock`，写明本 session 用途，验证后仅移除自己持有的锁。没有启动浏览器、服务、完整构建、下载或子代理。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/shadow-chunk-builder.test.mjs \
  src/components/world/shadow-chunk-cache.test.mjs \
  src/components/world/shadow-chunk-scheduling.test.mjs \
  src/components/world/shadow-chunk-integration.test.mjs

node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 \
  --module ESNext --moduleResolution Bundler --jsx react-jsx \
  --allowImportingTsExtensions --types vite/client src/components/world/WorldShadows.ts

git diff --check
```

17/17 通过，0 跳过，约 1.75 秒；严格 TS 和 diff 检查通过。覆盖：

- 旧算法逐桶精确对照，索引/非索引、负坐标、镜像、边界、区域归因和三角形绕序不变；分片与同步输出相同。
- 大来源的读取工作量有界，分片球体与 Three 原生 `computeBoundingSphere()` 相同。
- 原 184→197 追加、替换/移除全量回退、16 位索引边界、源资源所有权回归保留。
- 事务未完成不发布；中途取消只释放暂存块且不重复 dispose；失效快照与旧缓存版本不能提交。
- 无 WebGL 的实际 `WorldShadows` 包装阴影渲染路径：80 个原始 caster 在 pending 阶段均投影，完成后改由块投影，pass 后恢复原始 castShadow 标志。
- 600 个小型合成 caster 和后到来源验证首批不饥饿，最终顶点数完整；替换、移动、子树移除、源 dispose、控制灯退出和重入走实际接线。

这些是源码、数值和无 WebGL 生命周期证据，不等于浏览器视觉或 GPU 性能验收。仅出现已存在的 Three CJS deprecation 提示。

## 代价、边界与主线待验收

1. **3 ms 是软目标。** 原有 `farHull`/ConvexGeometry、TypedArray 分配、来源有效性检查、最终块发布与释放不是可抢占操作，仍可能越过目标；不能承诺消灭所有尖峰。每片校验增加少量 CPU，完成前原始 caster 的 draw calls 更高。
2. 没有新 RAF、timer 或 worker。没有 `fitSunShadow` 调用就不推进。普通暂停会保留一个尚未完成的事务等待恢复；隐藏或退出会取消。90 帧固定截图窗口可能先结束于原始 caster 回退状态，需主线记录 `shadowChunkWork().pending` 后解释 draw calls；本轮没有改 Runtime 的帧数或暂停语义。
3. 沿用来源的 Three 更新契约，原地修改顶点需标记 `needsUpdate` 并维护其几何 bounds。原有 convex hull 缓存和其它静态阴影分组未重构；这里没有扩张为所有来源热变更支持。
4. QA `shadowRebuildProbe` 的 `durationMs` 现在表示累计 CPU 分片时间，另有 `wallMs`、`slices`、`maxSliceMs`。不得再把 `durationMs` 当作单帧长任务。每片仍写有界 `sceneWorkProbe` 的 `shadow-chunks`；通过 `?qa=1` 的 `__worldDebug.shadowChunkWork()` 可查看 pending/取消计数。停止或重开 probe 后旧事务不混入新窗口。
5. 主线持有浏览器重验证窗口。建议在相同版本、入口、质量、冷/热加载条件及固定光照下捕获首批窗口，核对最大 slice、帧尾延迟、首批完成墙钟时间、最终 caster/chunk/triangle 数；对照昼夜画面和菜单画质切换，再测加载中退出、隐藏、重入。这里未报告任何实测浏览器改善。
