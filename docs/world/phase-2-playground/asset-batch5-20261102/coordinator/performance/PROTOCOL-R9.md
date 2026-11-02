# R9 最终冻结采样协议

主协调已亲阅接受C15日／夜／low原图，并明确解除R9视觉samplingHold。R9身份由性能session独立核验通过；**这不是性能通过声明**。旧R5至R8均不测，不继续视觉调参或源码扩审。

冻结包：`/tmp/bobby-world-batch5-r9-fourteen-01a19a62`。author commit `ba35d23303f8d4891de57a1b2e554c92a72f133e`，release对应十份源码字节相同。独立收据 `verified-build-r9.json`：60/60文件、10/10源码与基线Terrain匹配，实际HTML→WorldApp.kyI3W9ni.js→WorldApp.BVoCjssk.js→WorldRuntime.D7NGFd4R.js完整，递归30本地JS引用无缺失。R6不可启动记录保留，不混入本轮身份。

## 执行与前置检查

原持有session仍是唯一浏览器操作者；性能session只独立判读。只复用Chrome2／tab1395914218，以当前inventory为准，不另开实例或标签、不关用户标签、不改4341服务。采样前先完成主协调要求的**C15真实推移／复位后无残影检查及候车亭实际坐下／起身可见证据**，以执行方已有有界工具记录，不能用seat赋值代替原生E。若两项出现问题，先回报，不启动ABA。

采样脚本绝对路径：

`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/qa.js`

同目录 `serve.py` 写入同目录runtime，不动冻结包或执行方工具。QA／serve的冻结SHA在 `protocol-frozen.json`，逻辑沿用既定协议，未为R9改门槛。语法检查已过；未声称本夹具已通过真实浏览器试跑。若夹具本身出错，保留错误并停止，不调试后追加窗口。

先resource-preflight、inspect现有tabs及4359归属，确认重型窗口可用后O_EXCL拿FILE `/tmp/bobby-world-phase2-heavy.lock`。写唯一token与自有服务PID；已有服务若非本任务所有，不终止或覆盖。只一项重作业，不使用第三方DevTools MCP。启动命令：

```sh
/usr/bin/python3 /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/serve.py /tmp/bobby-world-batch5-r9-fourteen-01a19a62 4359
```

## 固定六窗，任一无效即停

临时viewport设1710×931，夹具核真实buffer和DPR1。普通跟随相机yaw0.9272952180016123、pitch0.7853981633974483、distance12、FOV50。readout给出的dx/dy只能用原生拖动调整；不使用艺术shot、冻结物理或固定摄影相机。

1. `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=r9-old-a`。等 Coordinator batch5 控件就绪；暂停菜单若挡初始化，用产品“继续探索”。点击 `Normal camp`，待ready后点击一次 `Bounded sample` 并等结果；然后 `Normal street`，ready后同样只采一次。
2. `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&run=r9-new`。同样依次camp／street各一次。
3. `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=r9-old-b`。同样依次camp／street各一次。

故两点各为旧A→新→旧B，全部来自同一R9包，facilityCraft=legacy切换13设施与G17。不把R9对照说成旧R5优化前后实验。**任一窗口无效、超时、被暂停或资源严重恶化，立即停止全部后续性能窗口；完整保留failed raw，不重试、不换点追最好数字。** 如有夹具前置错误未能保存raw，另存当时完整UI错误与原因，不能当有效窗口。

固定门槛不变：

- visible／always、正常grounded、角色与相机静止，paused=false，shot／seat／card／clubMode为空；Balanced／Clear／Noon720、timeRunning=false、night误差≤0.001。
- CSS和实际buffer均1710×931，DPR1，普通相机符合上述参数。
- 点击后至少十秒、最多二十秒settle，calls／triangles／geometries／textures／programs连续60不同render frame恒定，shadow pending=false，才90不同frame预热＋300不同frame测量。
- 300帧全窗计数恒定、无shadow pending、相机与角色漂移≤0.0001m。测量限三十秒；期间不截图、输入、切tab或调用完整场景诊断。
- 夹具在边界记录完整小型readback，采样期间仅统计／loop／store位置／shadow pending标量。raw保留300帧、arrival／settled／before／after和summary，GPU时间为空。

## 交还与独立判读

采样成功或首次失败后均暂停候选，原tab恢复 `http://127.0.0.1:4341/world/?start=camp&quality=balanced&paused=1`，核对暂停菜单，reset临时viewport，保留用户tab和4341服务。停自有4359，按token／PID核对释放锁。

把窗口顺序、有效及failed文件名、原始数据、前置C15／候车亭实际截图和结果、错误、资源与清理状态回主协调并转性能session独立判读。不扩大为物理／全地图／性能已通过。性能session核对三窗姿态和设置、几何稳定、旧A/B漂移，再报告候选是否落在两侧旧版范围之外；单组ABA仍不能排除宿主／温度／动画相位等因素或断定某个补丁的因果收益。
