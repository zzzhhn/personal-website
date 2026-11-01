# 暂停后的渲染休眠交接

2026-10-25。代码提交 `0ac1342`，基于 `f4e4f40`，隔离分支 `codex/world-phase2-performance`。工作目录：`personal-world-phase2-performance`。未合并、推送或部署，由主协调 session 集成。

主线审阅补记：候选代码已 cherry-pick 为 `8379c9e`，文档为 `dfd0c15`。集成目录与 `574147f` 的 `src`、`package.json`、`package-lock.json` 差异为零，复用下述正式构建验证；主线已检查最终短记录、截图和日志，未在资源压力下重复跑同一验证。用户保留的 4341 服务仍为 `f4e4f40`，未操作或更新。上段的未推送状态为性能线交接时状态。

精简原始读数与来源哈希已保留为 [JSON 证据](evidence/pause-render-sleep-20261025.json)，并附 [最终暂停夜景截图](evidence/pause-render-sleep-20261025.jpg)。此截图来自性能线最终验证，主线已读图；不是主线另一次运行采样。

## 改动

- `src/components/world/WorldRuntime.tsx`：可见运行时保持 always，前台暂停改为 demand，页面隐藏改为 never；隐藏时同时暂停物理。新增可见性监听有卸载清理。菜单修改／尺寸变化时重置帧时钟并请求必要重绘，保留初始化前三帧的 ready 信号。
- `WorldNight.ts`、`WorldEnvironment.tsx`：各自只在现有昼夜渐变尚未结束时 invalidate，完成后停止补帧。保留两套既有光照效果，没有常驻补帧定时器。
- `WorldQuality.ts`：原像素预算 effect 在 frameloop 改变后重新生效。运行验证发现 Canvas 重新配置会把 Balanced 的实际 DPR 重设为 2，因此增加这一依赖；预算、档位、模型和材质公式未更改。
- `?qa=1` 增加只读 `__worldDebug.renderLoop()`，返回模式、渲染提交计数、最后一帧 delta、night 和 windTime。复用现有帧回调，没有另加采样循环或长期日志。

## 验证结果

正式构建用独立的 `http://127.0.0.1:4345/world/` 验证。先检查普通入口加载与菜单，再在同一任务标签页用 `?qa=1` 定向读数。计数测试由有界的控制台脚本完成，不能冒充普通入口的 CPU／GPU 基准。测试期间其他用户程序和 4341 页面仍保留。

本次实际读取的环境：Apple M3，Chrome 155.0.8059.86；视口与 DPR 随下述场景分别记录。

| 项目 | 最终代码结果 |
| --- | --- |
| 类型检查 | `npm run check`：267 files，0 errors、0 warnings、135 hints。 |
| 正式构建 | `npm run build` 通过，2 个页面；`git diff --check` 通过。 |
| 前台暂停 | 60.002 秒内 render frame 为 9323 → 9323，物理步数增量 0，windTime 增量 0，模式 demand。 |
| 暂停中切到夜景 | night 采到 0.0008、0.1631、0.5805、0.9438、1；完成后 frame 保持 9323。 |
| Balanced 与恢复 | CSS 1155×931 时，DPR 1.388662、buffer 1603×1292，恢复到 always 后仍保持同一预算；阴影尺寸更新为 1254。 |
| 长暂停后恢复 | 首个观察到的帧 delta 83.8 ms，物理推进 5 步，后续三帧 delta 17.5／14.8／16.2 ms。没有把整段暂停补算；83.8 ms 本身不代表达到 60 fps。 |
| 恢复后键盘移动 | W 短按后角色从约 [-41.994,5.619,34.995] 移到 [-43.061,5.624,33.586]，随后可再次暂停。 |
| 实际后台 | 切到任务自有 about:blank，记录到 hidden=true、模式 never；两次采样之间设定等待 3 秒，render frame 为 9323 → 9323，物理步数增量 0，未单独记录实际墙钟间隔。 |
| 返回前台 | hidden=false、paused=true，模式 demand，night 保持 1，windTime 保持 273.1533；仅发生必要的有限重绘。 |
| 窗口重绘 | 关闭任务自有开发者面板后 CSS 1710×875，buffer 更新为 2013×1030，Balanced 与 Night 仍选中，菜单及背景实际截图正常。 |

浏览器曾发生自动化调试连接超时，后续改用同一窗口的原生控件完成操作。不能把调试通道超时当作网站帧时间。控制台可见缺省 favicon.ico 的本地 404，以及既有 Clock／Rapier 初始化弃用提示；未为此更改站点资源。

## 范围与资源

验证前多次执行指定资源预检，并原子取得 `/tmp/bobby-world-phase2-heavy.lock`；类型检查、构建和实际渲染串行执行，复用已有 Chrome 与 node_modules。内存多次为 warning，空闲磁盘约 2.8 至 5.5 GiB 波动；整机负载不归因于本网站。没有安装依赖，没有操作 4341 页面。

完成后已关闭两个任务自有标签页、4345 预览服务并释放自己持有的锁；4341 原服务仍运行。隔离 worktree 与本地提交保留供集成。

原始短记录与截图保留在 `/tmp/bobby-world-performance-runtime/`，检查和构建日志为 `/tmp/bobby-world-performance-check.log`、`/tmp/bobby-world-performance-build.log`。首版候选记录与 final-* 最终代码记录分开，整合时优先使用 final-*。临时证据归本性能任务，主协调 session 完成集成审阅后可清理。

本次只关闭渲染调度缺口。音频生命周期、两条 UI 手柄轮询和全量 store 订阅仍是独立后续项；没有宣称整个页面零负载。未测 CPU／GPU／能耗降低百分比、长时间内存趋势、Safari、手柄、BFCache 或车辆／音频完整回归。

集成时保留其他线的共享文件改动；人物与车辆控制器未改。之后若新增菜单内动画，需由其自身在未完成时请求帧，并验证完成后再次停帧，避免恢复为常驻渲染。
