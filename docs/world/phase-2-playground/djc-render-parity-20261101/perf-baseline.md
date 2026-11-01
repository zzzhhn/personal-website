# Blender→网页材质一致性：冻结基线

2026-11-01。仅采集改动前基线，不宣布质感通过，不评判当前源码或正在制作的 AO 候选。

**输入：** `/tmp/bobby-world-daybed-20261101`，即主线当前 4341 的独立快照。三文件完整 SHA256 已重算匹配既有 `djc-daybed-runtime-20261101/build-final.json`：HTML `b254d3faf0ceb0d2a00a1702e72c9a83448798b15a427defffb9e81864fd08be`，WorldRuntime.t9qlAWpO.js `59f3574854345c1eb80b05ad69e8a91370935db77e7c72889f813d2521e7f60b`，日床 GLB `5cdd0dde5d0418888e06422828d426eac07f7f9b27e0f762ef190aae211395d8`。没有把已修改源码／当前 dist 当作旧版。

复用 Chrome 2／tab1395914218，经本目录 4356 QA 壳直接提供冻结产物；生产 bundle、4341、src/public 均未修改，没有新开标签或启动构建。QA 壳沿用先前版本，另加可见 Bar Front 布置按钮，全部输出保存于本目录 `perf-` 文件。

## 可复现图像

| 证据 | 相机／状态 | 实际 buffer |
| --- | --- | --- |
| `perf-baseline-daybed-noon.jpg`／snapshot-3 | Close shot `[60.3,2.75,39.6]`，Noon 720、night=0 | 1951×1062 |
| `perf-baseline-daybed-midnight.jpg`／snapshot-4 | 完全同机位，Midnight 0、night=1 | 1951×1062 |
| `perf-baseline-bar-noon.jpg`／snapshot-5 | 既有 North Bar Front：`[40.762076805,7.741845734,57.054930225]`，target `[40.75,3.068825626,46.002204895]`，Noon 720 | 1951×1062 |

截图 CSS 均为用户当前 1710×931，Balanced、Clear，时间停止，未改变窗口尺寸。日床无遮挡；固定 shot 仅用于图片。对应 JSON 前缀为 `perf-baseline-a1-`。

北吧台没有找到已命名的专用 WORLD_SHOT，因此沿用先前已验 Front 机位：Bar Front 传送 `[40.75,3.4,46]` 后自然落地，画布原生拖动 `[300,360]→[871,360]`；yaw 1.5697036732、pitch .4、distance12、FOV50、无相机碰撞。完整 camera 留在 snapshot-5，after 应对齐该数值。

## 正常运行短样本

`perf-baseline-a1-sample-2.json`：Daybed approach，shot=null、seat=null、mode=always、Noon 720、同实际 1951×1062 buffer；先跳过30帧，再记录300个不同 render frame ID 的真实delta。60.0036 FPS，p50 16.7 ms、p95 17.5 ms，calls中位118、triangles中位1,575,257，GPU ms=null。单一基线短样本不证明所有视角性能，也不隔离首编译或宿主负载。

## 资源与交接

启动前 preflight memory warning、swap8.65 GiB、disk8.32 GiB；npm busy 标记存在，本会话未启动 npm 工作。仅一个渲染页和一个轻量服务。采完立即通过菜单暂停同页并 markHandoff，停止自有4356/PID72839，核对 owner `performance-parity-baseline-01a171f1` 后释放文件锁，已通知主线可串行开始 Blender。没有坐姿／碰撞重测，没有 push／部署。

等待正式 after 候选和构建 hash，再仅按这些构图、状态和实际 buffer 对照；独立资产 AO 及环境方向修正不在本基线中。
