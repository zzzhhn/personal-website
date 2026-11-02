> 当前等待R7。R6入口图断裂，不可启动。禁止执行本文历史R5或R6命令；以PROTOCOL-R7.md为准。

# 第五批 ABA 接手步骤，等待 R6

**当前停止状态：不要执行下文历史 R5 启动命令或URL。主协调已要求等材质／投影优化和 C13／C15 修正合并为 R6 后，再由原标签持有方代跑。本协议与夹具已冻结；实际 R6 步骤以同目录 `PROTOCOL-R6.md` 为准。R5身份只保留作此前只读核验收据，不作为下一轮候选。**

独立判读负责人：性能 session `01a171f1-267a-7ef0-92e5-19a47dad0a4b`。执行者仅复用 Chrome2／tab1395914218，不开新标签。当前没有新的性能窗口或候车亭坐姿镜头。夹具已通过 `node --check`，尚未浏览器试运行；原标签控制权被 session `01a19a62-2107-73a3-b811-07f3c66a5a24` 持有，协调方自己的4359已停止、锁已释放。

## 文件与冻结身份

唯一写入目录：

`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/`

- 夹具绝对路径：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/qa.js`
- 启动脚本：同目录 `serve.py`，从执行者原脚本复制，仅在协调方目录写入runtime证据。
- 已核对冻结包：`/tmp/bobby-world-batch5-r5-fourteen-01a19a62`，源码 commit `cdb31de`，地表为批四基线。六十文件哈希核对见 `verified-build.json`。
- HTML SHA：`d160f7b159f81c89dea544d30807978d15526f680ad75829f6d9fcc94d725146`。
- Runtime `_astro/WorldRuntime.DmHrLCYj.js` SHA：`03aacf9d85f0772dff7c06787c870a8879209444ec517a48afe41e17486ad34f`。

若主协调指定新修订冻结包，先暂停本流程，由主协调提供新路径和身份，并另记版本。不得把新修订结果标为上述R5。

## 启动与资源

先执行 `/usr/bin/python3 /Users/a22309/.local/bin/codex-resource-preflight.py`，检查当前 tabs 和4359 listener。当前近期状态 pressure2、swap12.53GiB、free30.63GiB、外部npm busy与3个DevTools进程；不终止他人进程，不用第三方DevTools MCP。只运行这一项重作业。

以 O_CREAT|O_EXCL 创建 `/tmp/bobby-world-phase2-heavy.lock`，写明自有唯一token及PID；如果已存在则等待，不覆盖。确认4359空闲后运行：

```sh
/usr/bin/python3 /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/serve.py /tmp/bobby-world-batch5-r5-fourteen-01a19a62 4359
```

读取4359 listener PID，核对为该脚本，再将自有锁中的PID更新为它。保留进程会话，完成后只停这个服务。4341正式服务绝不停止或切换。

通过浏览器 viewport capability 将临时CSS设为1710×931，实际buffer和DPR由采样夹具校验。不另改系统分辨率。最终必须reset。

## 固定顺序与停止条件

总共最多六窗。每个URL独立完整载入同一包，facilityCraft=legacy仅作为对照。两点固定使用执行者最后的平面支撑坐标，不换点。

1. 旧A：`http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=old-a`。等待世界及 Coordinator R5 控件出现；如菜单仍打开，只通过“继续探索”恢复。
2. 点击 `Normal camp`，待显示ready和stage normal。相机目标yaw0.9272952180016123、pitch0.7853981633974483、distance12、FOV50，原始加载通常已经匹配。若偏离，按readout给出的nativeDrag dx/dy，以原生鼠标拖动调整；不要使用艺术摄影机位。点击一次 `Bounded sample`。等待结果显示saved或Error，期间不截图、输入或切换tab。
3. 同页点击 `Normal street`，按同一相机条件，点击一次 `Bounded sample`。
4. 新：`http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&run=new`。依次做一次camp、street，步骤相同。之后可执行下述一次候车亭坐下／起身。
5. 旧B：`http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=old-b`。依次各一次camp、street。

每个按钮只采一次。任何window显示失败、无法在限定时间稳定、宿主资源严重恶化或页面被打断，停止后续性能采样，不补跑、不换点，不用最好一次替代。保留夹具的failed JSON并通知独立判读方；候车亭的有界可用性取证可单独完成。若需要改变协议或修夹具，先报告，不把调试后的新窗口混入这组六窗。

### 夹具的稳定／有效门槛

- 正常可见、always帧、角色grounded，paused=false、shot/seat/card/clubMode为空；Balanced/Clear、正午720、timeRunning=false、night误差≤0.001。
- CSS和真实buffer均1710×931，DPR1，相机符合上述普通跟随参数。
- 点击后至少等待十秒，最多二十秒。calls／triangles／geometries／textures／programs连续至少60个不同render frame不变，且shadowChunkWork.pending=false，才开始90个不同frame预热＋300个不同frame测量。
- 测量限三十秒；每帧仅读渲染统计、renderLoop、store位置及影子pending标量，不在采样期间跑sceneObjects/renderInfo或完整snapshot遍历。完整读回仅在边界保留。
- 300帧必须唯一，五项统计全窗恒定，shadow pending始终false。相机每帧与测量前偏差≤0.0001m；store角色位置及末端真实物理位置也须符合该界限。超界保留失败原始流。
- 成功记录arrival、settled、before/after、资源根节点有无、300帧及summary。GPU时间为空。该门槛不能排除温度、宿主任务、动画相位、操作系统调度变化或非采样帧的延迟；夹具统计不是GPU计时。
- 三次页面的run参数避免文件覆盖。server只写本目录runtime，不写执行者证据或冻结包。

## 候车亭，仅候选一次坐下／起身

新页两个正常窗口结束后点击 `Go shelter seat`，它只从实际交互注册读取street-shelter-seat并传送到近处，不设置seat。等nearby显示实际候车亭入口。通过原生E坐下，点 `Snapshot` 保存真实seat状态。

拍摄前用原生鼠标将普通相机转到候车亭开放的-X侧，避免屋顶／背板挡住人物。可先 `Read camera`，目标约yaw=-π/2、pitch0.18；原生拖动量为目标减当前角度后除0.0055，dx从当前点加到终点，dy同理。默认distance12可先保留。不要用艺术shot或脚本隐藏屋顶／人物来制造证据。若实际镜头仍不能明确看到坐姿，就如实保留未验收，不额外跑全地图。

点击 `Hide QA4s` 后立即保存并实际查看一张坐姿图到本目录，说明人物和候车亭关系，不能只靠seat字符串。再用原生E起身，`Snapshot` 保存seat=null和grounded，坐下／起身只各一次。把实际截图路径和操作结果发回独立判读方。

## 交还与判读

先暂停候选，再将同一tab恢复到原正式地址 `http://127.0.0.1:4341/world/?start=camp&quality=balanced&paused=1`；确认菜单暂停，若初始化短暂需继续则随后Escape。保存简短暂停AX读回在本目录，reset临时viewport，保留用户tab及4341服务。停自有4359，按token/PID核对释放锁。不得关用户标签、改4341服务、push或deploy。

回传：有效／失败窗口文件名、先后顺序、资源快照、实际坐姿图和起身结果、错误、服务及锁交还状态。由性能session独立核对同点三窗camera/player/settings、几何稳定、旧A与旧B漂移，再判断候选是否落在两侧旧版范围之外。即便有效单组ABA也只能提示可重复性风险，不能给单个代码路径做因果归因。视觉、性能、物理边界分开写。
