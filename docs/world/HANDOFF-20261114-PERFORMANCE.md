# 最新接续：性能专项第一轮

代码分支 `codex/world-performance-20261114`，运行时 `46e6e81`，基于工厂整合 `facdc92`。先读 `docs/world/performance-20261114/DELIVERY.md`、`comparison.json`，再看原工厂和Alpha交付。当前新增的是性能工作，原模型、材质资源、音乐与玩法没有降级。

本轮修地图静态路径重复序列化、灯数变化引起的shader组合重编、遮挡材质反复销毁、附近材质分任务预编译。重点收益在实际跨工厂边界，首次立即转镜头仍有0.7–1.1秒尖峰，不能宣称全部卡顿解决。

生产模式：`npm ci`、`npm run build`、`npm run preview -- --host 127.0.0.1 --port 4341`。原factory-integrated分支facdc92保留供回滚；本机最新端口见performance目录preview.json。

测量脚本在tools/world/performance-20261114。bot真实鼠标/W走路、QA只设置区域起点/时间与读统计；正式比较用无GL封装/无CPU采样器/不截图时段。早期截图造成约1秒长帧已标capture相位隔离。未经控制的OS/GPU缓存、后台用户应用及M5 Pro/M3差异均在报告写明。

没有更改画质开关、DPR、阴影尺寸、碰撞或控制。下一轮性能优先首载地形/地图同步工作、未预热的新材质与Safari；内容建议见NEXT-CONTENT.md，未自动开展新场景施工。
