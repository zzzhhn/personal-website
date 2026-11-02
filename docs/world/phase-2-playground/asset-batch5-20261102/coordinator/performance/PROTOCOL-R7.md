# 冻结采样协议，等待主协调 R7

本文件取代历史R5/R6启动身份。R6因HTML指向缺失WorldApp而不可启动，禁止以其60份哈希收据作为可用证据。**未收到主协调 R7 冻结路径、commit及哈希收据之前，不启动服务、不取得重型锁、不执行浏览器采样。** 不测旧 R5，不扩大源码诊断，不改生产源。

原持有 session 执行，性能 session 独立判读。复用 Chrome2／tab1395914218；不新开标签。主协调将本文件与下列脚本交原持有方。

## 固定文件

共同前缀：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/`

- 可见 QA：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/qa.js`
- 服务器：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/serve.py`
- 完整原生操作、候车亭机位与清理说明：同目录 `RUNBOOK.md`。
- 夹具身份与门槛：同目录 `protocol-frozen.json`。QA 仅通过静态语法检查，尚未浏览器试跑。不得声称已验证夹具可用。

收到 R7 后，核对该包 HTML、runtime、相关GLB与地表基线身份，并检查HTML实际引用的WorldApp存在、其动态runtime引用存在且指向本次包。入口引用链不完整即停止，不得采样。在本目录另存 `verified-build-r7.json`，保留R5/R6历史收据。将主协调给的真实冻结绝对路径作为serve.py第一个参数，4359作第二参数，禁止误填R5或R6。例如：

```sh
/usr/bin/python3 /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release/docs/world/phase-2-playground/asset-batch5-20261102/coordinator/performance/serve.py "$BATCH5_R7_FROZEN_ROOT" 4359
```

`BATCH5_R7_FROZEN_ROOT` 必须先赋主协调核对后的真实路径，本文件不猜路径。启动前完成 resource-preflight、tabs inventory、确认4359空闲，并 O_EXCL 独占FILE锁；关联实际自有服务PID。不停止他人服务或4341。

## 顺序与操作，最多六窗

临时viewport设1710×931，由夹具核实际buffer和DPR1。正常相机yaw0.9272952180016123、pitch0.7853981633974483、distance12、FOV50；用readout给出的dx/dy进行原生拖动，禁止艺术shot采样。

1. 原tab打开 `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=r7-old-a`。等待 Coordinator batch5 控件就绪；若暂停菜单挡住，只通过继续探索恢复。点击 `Normal camp`，等ready后点击一次 `Bounded sample`，等待结果；再 `Normal street`，ready后点一次 `Bounded sample`。
2. 同tab打开 `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&run=r7-new`，按同样顺序各一次camp/street。候车亭坐姿和起身证据可在此后一次完成，见 RUNBOOK，仅原生E，普通相机从开放-X侧看清人物，不设置seat、不隐藏屋顶。
3. 同tab打开 `http://127.0.0.1:4359/world/?qa=1&start=camp&quality=balanced&paused=0&facilityCraft=legacy&run=r7-old-b`，同样各一次camp/street。

**任一窗口无效或资源严重恶化，停止后续性能采样，保留failed原始流并回报；不补测、不换点追数字。** 若夹具本身出错，停止并报告，未经主协调重新定协议不调试后追加窗口。可用性证据与性能分别标明。

每窗固定：角色与普通相机静止、落地、visible/always、paused=false、shot/seat/card/clubMode为空；Balanced/Clear/Noon720、timeRunning=false。点采样后至少十秒、最多二十秒settle，五项渲染/资源计数连续60不同render frame恒定且shadow pending=false，再90warm＋300不同frame。测量全窗计数恒定、无shadow pending、相机与角色位移≤0.0001m。测量期限三十秒；期间不截图、输入、切tab、跑完整诊断JSON。

ABA比较始终来自**同一R7包**，facilityCraft=legacy切换全部13设施与G17。它不是旧R5优化前后实验，也不能将结果归功于某个补丁或保证60FPS。对比同点三窗的姿态、支撑落点、实际buffer、夜值、计数和旧A/B负载漂移，性能session最后独立判读。

## 交还

原tab恢复 `http://127.0.0.1:4341/world/?start=camp&quality=balanced&paused=1`，确认暂停菜单并保留标签，reset viewport，停自有4359、核token/PID释锁，4341服务不动。发送有效/失败raw路径、时序、坐姿图路径和真实坐/起结果、资源与错误、清理状态给主协调，并转性能session判读。无需重复其它模型图、A/B、全地图或长跑。
