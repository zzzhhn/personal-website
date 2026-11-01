# 日床首轮运行回执，2026-11-01

后续 READY-2 的接驳与材质限定复查见 [perf-recheck.md](perf-recheck.md)。以下保留首版历史结果，不代表修补后候选仍有同一接驳问题。

结论：真实 GLB 接入、一次 E 坐下／起身状态转换、正午／傍晚／深夜画面已覆盖；新版正常接近视角短样本约 60 FPS。**本候选尚未整体通过：坡道平顶与圆垫有明显相交／共面斑块，已交主线修复。** 主线已确认该问题并安排最小可见几何补丁，待新 bundle 后只复查接驳与实际步行。

## 产物、环境与方法

已逐一核对 `build.json` 的完整 SHA256：HTML `1e1cbd2f124c7bd4…`，`WorldRuntime.C4bVdiWJ.js` `4361e92b9df6f2e6…`，GLB `5cdd0dde5d041888…`。本记录绑定首轮构建，最终修复必须另记 bundle hash。

GLB 实际 9,875,476 字节，8 meshes／primitives／materials、113,664 triangles、8 内嵌图，无 extensionsUsed，全部 OPAQUE。运行时观察到 `djc-crafted-daybeds` 与 8 个命名实例对象及其 sun 代理；请求 decodedBodySize=9,875,476、transferSize=9,875,776。不是只看到 fallback。

复用 Chrome browser 2。主线原页受跨会话占用而无法接管，主线关闭自建云预览页后，授权在同实例新建唯一验收 tab `1395914218`。通过可见 QA 壳 4356 服务原 dist，所有输入走 CUA；未改产品源码、GLB、构建、4341，未 push／部署。

采用用户窗口 CSS 1710×875，正常运行实际 buffer 2013×1030，DPR=1.1772275318，Balanced、Clear、Noon 720、停止时间。没有缩小画面。`Daybed approach` 后 shot=null、seat=null、mode=always；各跳过 30 帧后记录 300 个不同 render frame ID 的真实 delta，GPU ms=null。

新旧相机约 `[62,7.87984,28.44245]`，两样本末相机位置差 0.000371 m；固定 yaw／pitch，角色在同一坡道上微小接触沉降。跨 reload，顺序新→旧，仅各一段，不是 ABBA。

## 正常运行短样本

| 文件 | FPS | p50 ms | p95 ms | 全场景 calls 中位数 | 全场景 triangles 中位数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `perf-daybed-new-a1-sample-2.json` | 60.001 | 16.7 | 17.8 | 114 | 1,570,745 |
| `perf-daybed-legacy-b1-sample-2.json` | 50.918 | 16.7 | 41.3 | 63 | 708,447 |

新床显著增加提交与绘制几何，实例化并不抵消四床面数与全材质投影。当前有限视角未见新版掉出 60 FPS，但不能推成整 Club 的保证。旧版页面首次恢复有输入／读取超时，CUA kernel 一次重置；恢复连接后才启动样本，超时不混入计数。宿主压力和延迟加载仍影响比较，不能声称精修使性能变快。

开始预检 memory warning、swap 9.81 GiB、free disk 7.01 GiB；中途 memory normal、swap 11.22 GiB、free disk 6.28 GiB。仅一个渲染页和一个静态服务，无本会话并行 build。没有把历史 swap 当作页面泄漏证据。

## 材质与日夜

- `perf-new-front-noon.jpg`、`perf-new-close-noon.jpg`：新圆垫、圆角靠枕、滚边、木圈与木桌可见，木桌／圈有纹理。实际观感较离线灯光更暗，织物微纹理不在此自评通过，交主线审图。
- `perf-new-close-evening.jpg`：19:00，night=0.72；`perf-new-close-midnight.jpg`：00:00，night=1。灯笼发光体保持可见，床体深夜明显更暗，未凭 emitter 推断新增真实照明。
- `perf-legacy-close-noon.jpg`：同一 Close shot 的旧版视觉对照。
- 固定 shot 在此构建可能将 buffer 重置为 3420×1750、DPR=2，而 CSS 仍 1710×875。特写仅作视觉，**没有用 demand 静态镜头采样或与正常 buffer 的帧时混比**。每张对应 snapshot 保存 shot／buffer。

## 接驳问题与交互

新旧近景都显示坡道木平顶和坐垫接合处共面斑块，新版更明显。主线已实际看图并定位 y=1.755 重叠，安排只按新圆垫边界裁可见坡道，不改碰撞／坐位；本会话未代修、未自行抬模型或设 polygonOffset。首轮外观不能通过。

`Seat left` 控件直接传送 `[61.05,2.574,40.45]`，该 x 在中央坡道横向范围外，角色落至侧面，作为无效测试布置排除，不能据此报产品无法坐下。随后回 `Daybed approach`，真实 W 300 ms 后出现 `E Sit and listen` 提示，再按 E：

- `perf-daybed-new-a1-snapshot-8.json` 的 seat=`djc-daybed-0-1`，座面位置 `[62.95,1.755,41.15]`；`perf-new-seated.jpg`、`perf-new-seated-settled.jpg` 保存当时人物画面。
- 再次真实 E 后，`perf-daybed-new-a1-snapshot-9.json` seat=null，人物仍在支撑面，`perf-new-standing.jpg` 保存起身画面。

这证明一次实际交互状态往返；没有穷举八坐位，也不以 seat 字段替代人体坐姿／接触视觉的最终接受。

## 收尾

最终同一 Chrome tab `1395914218` 停在旧版本地设置暂停页，已 markHandoff，未关闭。核对文件锁 owner `performance-daybed-01a171f1` 后删除自有锁，停止自有 4356/PID 97526。服务下次复查需重启，保留页面当前暂停内容。没有改变 viewport、其它用户页或 4341。

主线已收到图路径、短样本与坐起状态。等待最小接驳补丁构建后复查，届时沿用同页；本轮不扩大到全岛、GPU、根卸载驻留或远端回归。
