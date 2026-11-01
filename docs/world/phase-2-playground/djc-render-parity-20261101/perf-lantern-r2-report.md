# 灯具r2材质限定复查，2026-11-01

r2正午／深夜两图已保存，r1全部证据保留。正午木纹可辨，扩散板原先明显的脏斑噪声明显减轻；是否达到交付要求仍由主协调看图接受。本轮没有重测legacy、日床或其它玩法，也未更新4341。

## 候选与加载

已重算核对当时 `build-final.json` 的四个完整hash，并冻结一份为 `perf-lantern-r2-build.json`：HTML `2ed93e9ec9136e31…`、WorldRuntime.cIQS8_h2.js `cdf1c6d076185dbe…`、日床AO `99a0abd938b967d9…`，新灯 `pool-lantern-v2.glb` `30022ad90d063a6d…`。

`perf-lantern-r2-a1-lantern-4.json` 记录新URL的实际请求 decodedBodySize=1,358,944、transferSize=1,359,244，crafted灯组存在、原灯fallback不存在。未把r1 URL缓存当作r2。

## 干净两图与settle

- `perf-lantern-r2-noon.jpg`：720分钟、night=0。
- `perf-lantern-r2-midnight.jpg`：0分钟、night=1。

同一Chrome2／tab1395914218。使用既有 `Lantern close` 的安全高处落地布置、正式V第一人称；等待落地与镜头稳定，保存snapshot-3和lantern-4／5的metadata，grounded=true。Noon／Midnight相机均为 `[61.456413269,2.307474661,29.343956757]`，yaw=-π/2、pitch=.12；两图camera位置差0，实际buffer均1951×1062，CSS1710×931、Balanced／Clear、时间停止，无fixedshot。截图前仅用QA壳临时隐藏覆盖层。

该camera与r1 legacy同一 `Lantern close` 落地结果一致；距r1 refined最初实际步行所得camera约.077m的既有差异保留，不能将r1/r2照片用于严格像素差分。本轮不为此扩展机位调试。

## 顺手正常短样本

`perf-lantern-r2-a1-sample-2.json`：正常Daybed approach／Noon、shot=null、seat=null、mode=always、同1951×1062buffer；跳过30帧后记录300帧，59.805FPS、p50 16.7ms、p95 17.4ms，calls中位126、triangles中位1,777,379，GPU ms=null。r1同视角单段约60FPS、p95 17.4ms。宿主与延迟加载有波动，不对瞬时calls／tri差值作材质或拓扑归因，未重跑其它性能矩阵。

## 收尾

预检memory warning、swap10.56GiB、free disk7.07GiB；单渲染页和单临时服务。全部输出使用本目录 `perf-lantern-r2` 前缀，没有覆盖r1。

完成后同页设置暂停、markHandoff，停止自有4356/PID78494，核对 owner `performance-lantern-r2-01a171f1` 后释放文件锁。未改产品源码／资产／构建，未push／部署或导航4341。两图与样本已交主协调，等待实际审图后的交付指令。
