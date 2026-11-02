# R10 最终身份与条件采样协议

首窗已由主协调与性能session分别核对并批准保留，raw SHA256为`e626fb07f7367d3b21a4d262b8d31e6b1de71b80f475f6c1dc6af9e052107598`。首窗保存后的55秒regex等待误报属于执行器完成检测异常，不是invalid数据窗口。仅改执行器literal saved／直接UI读取并匹配当前run／mode／地点文件名，直接继续原剩五窗，无需双重许可；不重采、不增加第七窗、不改QA／serve／包／门槛。暂停审阅间隔由执行者保留。独立证据见FIRST-WINDOW-R10.md和first-window-audit-r10.json。

R10独立身份已通过，唯一剩余hold条件是**执行者在R10现场完成同一候车亭原生E坐下／起身，并用开放-X侧普通相机明确看到坐姿，确认不再distance0、人物隐藏或相机重叠**。该项通过即可直接做下述六窗，无需再等主协调重复批准。失败则保留证据、停止后续窗口。身份核验和该条件解除均不代表性能通过。

## 身份与不变范围

- 冻结包 `/tmp/bobby-world-batch5-r10-fourteen-01a19a62`。
- author commit `6ffeeeb53a8c720905b7df72dee83beed077437c`，含主协调 `de7e8f4` 的坐姿相机修复。
- `verified-build-r10.json`：60/60文件、12/12源码两树匹配，Terrain与base相同。原十份源码与十个设施GLB均与R9相同，新增WorldActors.tsx／camera-collision.ts身份。
- HTML SHA256 `ab16953b8a77ca1b4ca5887d37164d3b1699bc0d87823c40d72a4d7a08993a03`。
- 实际入口链 `world/index.html → _astro/WorldApp.CFES6A1d.js → _astro/WorldApp.Cd8SXF-f.js → _astro/WorldRuntime.CDhmzaiM.js`，递归30个本地JS引用无缺失。
- R9的14资产视觉与C15行为沿用，不重做；R9候车亭失败及ABA零窗记录保留，不算R10性能窗口。R6仍不可启动。

## 操作与固定六窗

执行session仍是唯一浏览器操作者，性能session只判读收据和raw。不新开实例／标签，不改4341服务。现有Chrome2／tab1395914218以当前inventory为准。操作前resource-preflight、tabs检查，独占 `/tmp/bobby-world-phase2-heavy.lock`，核4359所有权。保留当前自有服务可按其既有归属处理，不终止他人进程。

冻结QA脚本绝对路径：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/qa.js`。同目录serve.py只写本目录runtime。QA／serve哈希及全部既定门槛不变；脚本身份见protocol-frozen.json。

如需启动自有服务，命令为：

```sh
/usr/bin/python3 /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/serve.py /tmp/bobby-world-batch5-r10-fourteen-01a19a62 4359
```

候车亭前置通过后，按固定顺序，每个按钮仅一次：

1. `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=r10-old-a`。待Coordinator batch5就绪，`Normal camp` ready后点一次 `Bounded sample`；结果返回后 `Normal street` ready再点一次。
2. `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&run=r10-new`。同样camp后street各一次。
3. `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=r10-old-b`。同样camp后street各一次。

每点为旧A→新→旧B，全部同R10包，只切facilityCraft=legacy。不测R9或混版本，不继续模型调整。普通跟随相机yaw0.9272952180016123、pitch0.7853981633974483、distance12、FOV50；必要时用readout的dx/dy原生拖动对齐，禁止艺术shot。临时CSS与实际buffer均1710×931、DPR1。

门槛保持：visible／always、grounded静止、paused=false、shot／seat／card／clubMode为空；Balanced／Clear／Noon720、timeRunning=false、night误差≤0.001。点采样后至少10秒、最多20秒settle，五项渲染／资源计数连续60不同render frame恒定且shadow pending=false，再90不同frame预热＋300不同frame测量。300帧全窗计数恒定、无shadow pending、相机／角色漂移≤0.0001m，测量限30秒，期间不截图／输入／切tab／跑完整诊断。GPU时间为空。

**任一窗口无效立即停止全部后续窗口，保留完整failed raw，不补测、不换点、不追最好数字。** 若前置或夹具错误导致raw尚未生成，另存准确UI错误与原因，不能算有效窗。

## 交还和判读

完成或失败后，暂停候选，将原tab恢复 `http://127.0.0.1:4341/world/?start=camp&quality=balanced&paused=1`，核对暂停菜单，reset viewport，保留用户tab与4341服务；停自有4359并按token／PID核对释锁。把候车亭真实图／坐立状态、窗口时序、全部有效／失败raw、资源／错误与清理状态回主协调及性能session。

独立判读先核同点姿态／设置／支撑落点／几何稳定和旧A/B漂移，再讨论候选是否超出两侧旧版范围。至多一组ABA，仍不能孤立归因于某段代码、排除所有宿主变化或承诺60FPS。
