# PARITY after 限定回执，2026-11-01

已完成指定的日床正午／深夜、北吧台正午三图和正常 approach 一个300帧样本，未重测玩法。图片显示靠枕塑形与垫面接触暗部发生明显变化；是否达到 Blender→网页质感目标由主协调看图决定，本回执不自行宣布质感通过。

## 构建与真实加载

已重算核对 `build-parity.json` 三项完整 SHA256：HTML `ac7666f510928545…`、`WorldRuntime.BvbzAou9.js` `4fd91fa79f0a5539…`、`daybed-ao-v1.glb` `99a0abd938b967d9…`。使用本轮 release/dist，经原有4356 QA壳和同Chrome2／tab1395914218访问；没有改src/public、4341或构建。

`perf-after-b1-snapshot-1.json` 中新 `/assets/world/club/daybed/daybed-ao-v1.glb` 请求 decodedBodySize=13,905,392、transferSize=13,905,692。`djc-crafted-daybeds` 及实际实例对象存在，`djc-original-daybeds` 不存在，未以 fallback 充当新模型验收。网络时间只是本机记录，不作为线上下载预算。

## 同构图与同缓冲

| after图片 | 对应元数据 | 与基线对齐 |
| --- | --- | --- |
| `perf-after-daybed-noon.jpg` | snapshot-3，720分钟、night=0 | camera `[60.3,2.75,39.6]` |
| `perf-after-daybed-midnight.jpg` | snapshot-4，0分钟、night=1 | 同 camera |
| `perf-after-bar-noon.jpg` | snapshot-5，720分钟、night=0 | North Bar Front，camera与baseline误差约1.8e-15 m |

三图均为CSS1710×931、实际buffer1951×1062、Balanced／Clear／时间停止，与相应基线一致。日床无遮挡，同一个 Close shot；北吧台沿用 Bar Front 安全落地和571px原生拖动，未另换观察角度。日床图片使用固定shot，不混入正常运行帧时。

## 正常300帧

| 条件 | FPS | p50 ms | p95 ms | calls中位 | triangles中位 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 60.0036 | 16.7 | 17.5 | 118 | 1,575,257 |
| after | 60.0024 | 16.7 | 18.0 | 118 | 1,575,265 |

after文件为 `perf-after-b1-sample-2.json`；正常 Daybed approach、shot=null、seat=null、mode=always、Noon720，同实际1951×1062 buffer，跳过30帧后采300个不同render frame ID。GPU ms=null。有限视角短样本未见明显帧率回退，不能推成整岛保证或隔离方向／AO各自开销；相差8个提交三角形不解释为资产拓扑变化。

## 串行资源与收尾

预检 memory warning、swap9.4 GiB、disk7.54 GiB，npm busy标记存在；本会话未启动npm、构建或其它重工作。仅复用一个渲染页与一个静态服务。采完立即暂停同页并markHandoff，停自有4356/PID20728，核对 owner `performance-parity-after-01a171f1` 后释放文件锁，并通知主线可开始下一批建模。

只写本目录perf证据与报告；未push／部署、未替换4341、未继续诊断灯笼或日床玩法。
