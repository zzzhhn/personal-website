# 营地实机与终版音乐复核

2026-11-09，Mac Chrome，任务自有 4356 预览。先做资源预检、持有 `/tmp/bobby-world-phase2-heavy.lock` 后串行运行。终版构建前压力级别 2、历史 swap 8.78 GiB、磁盘余量 11.05 GiB。4341 服务 PID 20867。

## 旧包同条件 ABBA

同一个浏览器标签页，每轮重新加载。A 是 `a23da48` 覆盖 `b495d7f` 的阴影／酒吧相关模块，B 是 `a23da48` 候选。资产文件 SHA-256 清单核对 140 个。固定工具墙机位、12:00、Balanced、曝光 1、1951×1062、DPR 1.141273。固定机位关闭音乐。每组 360 帧，首尾 loading 和 shadowPending 都为 false。

| 顺序 | P50 / P95 / Max（ms） | >50 / >100 ms | 窗口重叠采样的 swap in / out（MiB） |
| --- | ---: | ---: | ---: |
| A1 | 17.0 / 28.1 / 126.2 | 2 / 1 | 0.3125 / 0 |
| B1 | 19.2 / 54.7 / 966.8 | 19 / 1 | 2.546875 / 55.625 |
| B2 | 17.2 / 35.7 / 74.9 | 7 / 0 | 0.1875 / 0 |
| A2 | 18.5 / 37.0 / 86.4 | 3 / 0 | 171.625 / 47.9375 |

B1 最大帧间隔与系统换出所在的约一秒采样区间重叠，无法据此归因。B1、B2 的帧耗方向不一致，样本不足以确认稳定改善。A1/A2/B1 的驻留计数为 397 geometries、136 textures、168 programs。B2 为 411/134/162，draw calls 在窗口由 346 到 347，其余三轮均为 347。A 为 1,042,057 triangles，B1 和 B2 终点为 1,042,189。A2 点击后约 72 秒开始计数。普通模式下 A/B 的 W 输入均移动约 2.6 米并保持落地，未测成对的移动帧耗。旧包同一机位 A2 的标签日夜均可读，B2 日夜五个分类标签呈黑色矩形。成因待定位。

## 正式构建 4968fbf

本地正式配置构建 8 页通过。实际交互测试使用同一个正式运行时及资源，另外的临时 HTML 路由只加了可见验收面板用于读取原生媒体和定位舞池测试起点。W 输入产生位移。真实菜单保持暂停时可以选 Late night / High，再选 Noon / Balanced。靠近舞池出现 E 提示，实际按 E 进入和退出，再点 Return to camp。两首 Club MP3 响应 200，酒吧 GLB 接近时响应 200。

正式包的原始 `/world/` 页面在同一机位复核了白天，再通过实际暂停菜单切换 00:00 后复核夜间，两张截图的五张标签均可读。旧包 B2 的黑块在这次正式包复核中未复现。标签图集由 `WorldCampContent.tsx` 的 `LabelPlates` 建立，`WorldCampContentAssets.ts` 的 `drawLabels` 写入 canvas。旧包两臂复用此代码，现有样本不足以定位原因。

`boardwalk-v3-longform.mp3`，9,996,621 bytes，SHA-256 `13c4eb149ca8042774cacdf720d55450d80c1b69eaa56ac8cb3c6925146b66bb`。Chrome 请求收到 206，原生媒体时长 499.760975 秒，error=null。播放从 0.402 秒前进到 4.142 秒。暂停后相隔 5.248 秒的两次读数均为 4.182494 秒，原生 paused=true 且 roaming sources=0。恢复从同一 offset 续播。舞池开始播音后漫游 sources=0，原生媒体暂停在约 12.524 秒。回营地后 sources=1、原生 paused=false，播放进度达到 15.592 秒，沿用 12.524 秒的 offset。控制台未见 error，仅 Three.Clock 与初始化参数弃用提示。机器读数覆盖实际浏览器播放状态，未做听感评审。

## 原始证据

本机 `/tmp/camp-perf-actual-4968fbf/` 下的 `{A1,B1,B2,A2}-360.json`、同名 `*-memory.jsonl`、`{A2,B2,final}-{day,night}.jpg`、`final-audio-browser.json`、`final-build.log`、`http.log`。正式包原始 HTML 为 `final/world/index.html`，SHA-256 `d7ab373977a1533217128ee98479c04604c1e7ce1b7d8d5815c74240bd724b38`。终版没有追加帧耗基准。暂停渲染休眠的原始前后台帧计数见实现 `0ac1342` 的交接 `dfd0c15`，主协调集成 `8379c9e`。

## 主协调复核与图集初始化修复

独立对照 A2/B2 原始白天截图，确认 B2 的五个分类标签呈黑色，A2 可读。正式 4968fbf 未复现，因而没有将黑块归因于阴影或酒吧补丁。

源码中存在确定的初始化风险：LabelPlates 先用默认 300×150 空画布创建 CanvasTexture，再在 passive effect 中把画布改成 512×1600 并绘字。Three 的 Texture 契约不支持首次使用后改变尺寸。改为创建贴图前同步绘好图集；语言变化重新生成资源，原有 dispose 清理保留。模型、灯光、材质参数、分辨率不变。

修复候选 `/tmp/camp-label-ready-20261109/final` 正式构建 8 页通过。原生 Chrome 同一机位检查英文白天，再用真实设置菜单切至中文及 00:00，标签均可读，console error 为零。截图为同目录上级的 `labels-day.png`、`labels-night-zh.png`。这验证了修复后显示与切换行为，不是对旧黑块原因的完全重现证明。

## 原生长帧记录的边界

为避免包装每个帧回调改变被测对象，附加本地临时 QA 路由，使用浏览器原生 [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames)。不进入正式 `/world/` 页面；只在点击按钮后保留 20 秒、最多 80 条。脚本与截图位于 `/tmp/camp-label-ready-20261109/`。

工具墙固定视角记录包含 12 个长帧，合计 776.2 ms，其中 React Three Fiber 的帧回调合计 693.3 ms。打包源码核对该回调依次执行订阅者和 gl.render。该窗口帧计数仅从 108 到 198，包含固定视角的收敛尾部和休眠，**不是新的稳态 FPS 对照**。它定位到了主帧回调范围，不能进一步区分具体订阅者、GL 提交、驱动等待或系统抢占，也不能证明水面是原因。原始记录见 `native-frame-20261109/shot-warm-tail.json`。

另在无固定机位的普通漫游页记录 20 秒，实际按 W 后人物移动约 1 米，捕获 3 个长帧，最长 78.8 ms；均包含 React Three Fiber 帧回调，其中一帧还包含 7 ms 的 idle callback。渲染计数增加 1135，开始与结束均 ready、loading=false、paused=false，控制台零 error。该页使用自然流逝的黄昏时间，没有与旧版本配对，不能据此宣称稳定性能提升。记录见 `native-frame-20261109/ordinary-roam.json`。

4341 保留原稳定版本。四轮 ABBA 未证明稳定收益，用户此前要求的性能提升验收尚未满足；不将功能或构建通过表述为性能通过。两位验收者的测试标签及 4356 服务均已关闭。保留候选构建和本地原始截图，供下一次归因／复核后清理。
