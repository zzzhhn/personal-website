# READY-2 限定复查，2026-11-01

接驳的原锯齿共面斑块在本次正面／特写中已消失，正常步行可以跨边进入日床；近侧后照片清楚可见屈膝坐姿，随后真实 E 起身成功。新增环境响应后的单段正常运行样本仍约 60 FPS。技术范围内没有发现新的阻塞；昼夜材质可读性由主协调实际看图接受，深夜床体仍明显偏暗。本回执不扩大为整岛或发布通过。

## 构建与环境

`build-recheck.json` 三个完整 SHA256 均已重算核对：HTML `d5d72f99a001b628…`、`WorldRuntime.DTY0nMau.js` `80ca5eb1b7af3fe9…`、GLB 仍 `5cdd0dde5d041888…`。测试本地 release/dist，URL 不带 legacy，未改变产品源码／GLB、构建、4341、远端或 Git 同步。

复用 Chrome 2／tab `1395914218`，未新建标签或调整窗口。预检 memory warning、swap 10.68 GiB、free disk 5.98 GiB；一个渲染页与一个静态服务串行执行。

## 正常运行唯一短样本

`perf-daybed-recheck-c1-sample-2.json`：300 帧（先跳过 30 帧），60.013 FPS、p50 16.7 ms、p95 17.6 ms，calls 中位数 116、triangles 中位数 1,577,033，GPU ms=null。正常 Daybed approach，shot=null、seat=null、mode=always，Noon 720／Clear／Balanced。CSS 1710×875，实际 buffer 2013×1030，DPR 1.1772275318，与首轮正常样本相同，未缩画面。未重跑 legacy。

与首轮 60 FPS 相近，只能说明本机此接近视角未出现明显回退。延迟加载／几何驻留和宿主状态仍会变化，没有测 GPU、PMREM 首编译尖峰或长时间卸载驻留。

## 接驳与实际行走

从 Daybed approach `[62,2.55689,39.49574]` 开始，原生 W 650 ms 跨过新裁接前边约 z=40.575，中间没有传送。`perf-daybed-recheck-c1-snapshot-3.json` 的 actor.player 为 `[62.00544,2.57489,41.10868]`、grounded=true；随后落稳 `[62.01345,2.57383,41.19883]`（snapshot-4）。HUD store position 与 actor 快照相差数帧，以上取 JSON actor.player。

`perf-recheck-front-noon.jpg`、`perf-recheck-close-noon-clear.jpg` 未见原来的共面斑块，坡道边沿和坐垫圆边接合清楚。该路线有限通过，没有穷举全部四床接边。

## 材质与坐姿照片

- `perf-recheck-close-noon-clear.jpg`：角色移出遮挡后的同一 Close shot，坐垫滚边、靠枕缝线、木圈／木桌纹理可见。与原图对比交主线，不能仅凭 envMap 参数声称审美达标。
- `perf-recheck-close-midnight.jpg`：00:00、night=1；灯笼发光体可见，床体仍暗，木材细节辨识较弱。等待主线对可读性的判断。
- `perf-recheck-close-noon.jpg` 为人物遮挡的探索构图，正式材质审阅优先用带 `-clear` 的图片。特写 snapshot-5 为 3420×1750，移出人物后 snapshot-6／7 为 2013×1030；均只用于视觉，未混入帧时样本，不能用作严格逐像素照明差分。
- 回正常 approach，真实 W 300 ms 出现 E 提示，按 E 坐下；原生滚轮拉近并拖动 250 px 改到侧后方，正常运行数秒后保存 `perf-recheck-seated-side.jpg`。这次照片明确显示臀部落在垫边、膝部弯曲、双腿悬下；snapshot-8 同时记录 seat=`djc-daybed-0-1`，不再只有状态字段。坐位约束下 grounded=false 不视为掉落。
- 再按 E，snapshot-9 seat=null、grounded=true；未扩成角色动作修复。

## 收尾与交接

同页已停在新默认候选设置暂停界面并 markHandoff；停止自有 4356/PID 18539，核对 owner `performance-daybed-recheck-01a171f1` 后释放文件锁。主线已收到图路径和结果，由主线看图决定接受及后续 4341 切换；本会话没有导航 4341。只保存本目录 `perf-` 证据及报告，无其他文件改动。
