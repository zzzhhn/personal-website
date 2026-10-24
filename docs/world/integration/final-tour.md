# 最终普通入口巡游：待 FINAL_READY

仅已准备脚本并做语法检查，尚未启动浏览器、录屏或声称到达。

主线程发出 FINAL_READY 后，在 street-integration 工作树执行一次：

```sh
FINAL_READY=1 WORLD_BASE_URL=http://127.0.0.1:4330 FINAL_SOURCE_ROOT=/Users/bobby/Desktop/3D-personal-world/wt/integ WORLD_PLAYTEST_DIR=/Users/bobby/Desktop/3D-personal-world/evidence/integ/final-tour /Users/bobby/.workbuddy/binaries/node/versions/22.22.2-6/bin/node tools/world/playtest/final-tour.mjs
```

路线从目标服务对应 checkout 的当前 layout.ts/layout-v4.ts 派生，沿时间轴中心线和真实桥面进入园区；营地出口绕过停放越野车，园区广场从 van 南/东侧绕到实际栈道入口。位置反馈只读可见 HUD 的 `circle.world-map-anchor`，所有移动是 WASD/Shift/Space；不加载 store、QA、debug 或 fixtures。遇阻只短暂退让，不能跳过失败路径认定到达。

机位依次为：营地默认/近景、城区默认/近景、桥水面默认/近景、园区夜档默认/近景。自由环绕与滚轮只在站定时执行并反向恢复，再继续走；通过真实 E 开关一张教育卡，通过真实 Esc 设置夜晚。视频至少 180 秒，以栈道继续往返步行为主；若路线失败后的静止补时会独立标记，不冒充三分钟持续玩法。

Canvas MediaRecorder 录屏与原 PNG、完整轨迹、全部 page/console/http/network 错误在仓库外 evidence/integ/final-tour；八张保留 HUD 的 JPEG 每张 <400KB，执行后与小报告一起保存。失败原样保留，不过滤本地埋点 404。最终 source hash 前后对照用于发现跑到一半版本变化。
