# READY-3 材质小轮回执，2026-11-01

范围完成：仅同构图无遮挡正午／深夜两图，以及正常 approach 单段 300 帧。材质环境响应比 READY-2 可见增强，床垫前沿、滚边和靠枕轮廓更清楚；是否达到用户期望由主协调看图接受，本会话未自行宣布审美通过。此前已接受的接驳／步行／坐姿未重测。

已重算核对 `build-final.json` 三个完整 SHA256：HTML `b254d3faf0ceb0d2…`、`WorldRuntime.t9qlAWpO.js` `59f3574854345c1e…`，GLB 仍 `5cdd0dde5d041888…`、9,875,476 字节。测试 release/dist，无产品源码／GLB／构建修改，无 push／部署。

`perf-daybed-final-d1-sample-2.json`：300 个正常渲染帧（跳过 30 帧），60.0012 FPS，p50 16.7 ms、p95 17.1 ms；全场景 calls 中位数 118、triangles 中位数 1,576,025，GPU ms=null。shot=null、seat=null、mode=always、Balanced／Clear／Noon 720。用户窗口 CSS 1710×875，实际 buffer 2013×1030、DPR 1.1772275318，未调整画幅。与 READY-2 同条件短样本相近，不扩为整岛最低帧率或 GPU 耗时保证。

`perf-final-close-noon.jpg`、`perf-final-close-midnight.jpg` 均一次控制成功，无人物遮挡；相机位置同为 `[60.3,2.75,39.6]`，实际 buffer 均 2013×1030。对应 snapshot-3／4 分别为 720／0 分钟，night=0／1，shot=`djc-daybed-close-day`，只用于视觉。两张图已交主协调审阅。

预检 memory warning、swap 11.17 GiB、free disk 5.84 GiB；仅复用 Chrome 2／tab1395914218，一个渲染页和一个静态服务。结束后同页设置暂停并 markHandoff，停止自有4356/PID36875，核对 owner `performance-daybed-final-01a171f1` 后释放文件锁。没有重测 legacy、接驳或角色，也未触碰4341；等待主协调看图后发同页交付指令。
