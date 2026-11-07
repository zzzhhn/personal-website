# 营地长帧修复交接，2026-11-07

试玩基线及直接父提交为 `b495d7f923c3489169469ec6c0a596bfde68ca74`。实现提交 `b3c2b0bad1c3a8293e8a3a2dc5a95099542504b9` 位于隔离分支 `codex/perf-camp-longframes-20261107`。已有过山车基线报告与新分支中的 Git blob 内容相同，切换后再次核对一致。

现有 `evidence/performance-final.json` 在营地工具机位采集了 360 帧，P50 21.8 ms、P95 37.7 ms、最大 209.4 ms，339 次 draw、1,060,384 个三角面。该采样是暂停机位由 QA 请求连续渲染，在加载、光照和阴影队列收敛后取数。先前两个 360 帧窗口的资源驻留和机器状态不同，不能用来估算本修复收益。

**已修复。** `WorldShadows.ts` 的两个太阳级联实例路径先前每次对所有可见矩阵做复制，并在数量非零时标脏整个代理矩阵缓冲。现在仍按原顺序选择实例，精确比较紧凑缓冲中的值，只对不同矩阵写入并标脏。数量变化独立更新。动态包围球仍使用每帧变换，但数量相同时复用 Float32 缓冲，并避免逐实例创建临时数组。阴影级联、深度材质、选中实例、资源所有权及模型和画质参数沿用原路径。

**轻量验证。** `node --import tsx --test --test-concurrency=1 src/components/world/shadow-chunk-integration.test.mjs src/components/world/shadow-coverage.test.mjs src/components/world/performance-render-policy.test.mjs` 通过 13/13。新增用例执行实际太阳阴影 pass 选择路径，验证静止时版本不变、动态移动和裁剪重排时矩阵刷新，以及归零后恢复不重复标脏。没有创建 WebGL renderer。该验证直接证明 CPU 侧上传请求是否重复，实际驱动上传、帧时间和画面一致性由独立浏览器对照确认。

**仍需归因的两处。** 阴影每 30 渲染帧做整场矩阵更新和 caster 遍历，分组签名改变时还会同步生成合并或简化几何。若真实长帧与该周期或冷入场对应，再按具体栈缩小处理。普通行走会执行遮挡 corridor 的候选扫描与最多四次三角 raycast。固定 QA 镜头不代表正常 actor/physics 路径，因此只在行走窗口判断它是否值得动。两处均未在没有现场归因的情况下改动。

**主协调实测。** 同一浏览器串行使用独立构建，在工具机位匹配 camera、FOV、DPR、画质、时间、资源完成量和驻留区域。记录采样前后资源预检、shadow pending/cancelled、各级联 casters/proxies/instances、draw/triangles 和主线程长帧栈。优先对齐 `applySunPass`、`instanceSpheres`、矩阵上传、`rescan/rebuildGroups` 与 GC。单独记录近处行走以覆盖仍在变化的实例与遮挡，检查画面和地面阴影一致。数值只有在工作负载和机器状态足够一致时才作 A/B 判断。

主协调已完成带仪表的独立基线构建，随后报告空闲磁盘降至约 2.6 GiB、swap 约 21 GiB、内存警告。浏览器 A/B 暂缓，避免把系统换页误归到场景代码。4341 保持 `b495d7f`，候选尚未替换试玩。
