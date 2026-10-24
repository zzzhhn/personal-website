# 最终普通入口巡游：44a339e 实测

2026-10-24，在 `http://127.0.0.1:4330/world/` 普通入口执行 **一次**，1920×1080。真实出生点开始，HUD `circle.world-map-anchor` 闭环 WASD 步行，经营地 → 出口 → 下坡 → 大道 → 桥 → 园区/夜间栈道往返。没有 QA 参数、store/debug 状态读写、fixtures 或传送。

## 实测结果

- **136/136 行走段到达**，8/8 机位目标到达。营地越野车、园区 van 都真实绕行；桥侧近景停点仍在护栏内。没有失败路径被省略或用后续图片冒充到达。
- 教育卡通过真实 E 打开和关闭；真实 Shift＋Space 跑跳按键已发送并留在录像中；自由环绕拖拽及明显滚轮近景后均反向恢复，再继续走路；夜档由 Esc 设置中的 Night 按钮选择后继续步行。HUD 本身不能测量垂直跳跃高度，因此未宣称跳高/碰撞精度通过。
- 录制墙钟 187.081 s；ffprobe 实读 VP9 **1920×1080、编码时间轴 187.058 s**（5589 个视频包，首时间戳 0.000，末 187.025）。视频 122,343,267 bytes，静止补时 **0 ms**。MediaRecorder WebM 无容器 duration 字段，采用真实视频包时间戳计算，没有拿文件存在或墙钟代替实际时长。
- **Page 0 / Console 1 / HTTP 1 / network failure 0**。唯一请求错误是已有 `POST /api/events` 404，对应一条 Console `Failed to load resource`；完整保留，没有过滤、mock 或屏蔽。脚本因此 exit 1，不能称全零错误。无 fatal，行走和录像均成功。
- 源 checkout：`/Users/bobby/Desktop/3D-personal-world/wt/integ`。前后 HEAD 均 `44a339e4dd6e9297b6dd03acdbe023a9e918f246`，world 源文件 81 份前后无 dirty，SHA256 均 `c6623c7ef1aabba905fdb9cc695bf3e4802ba09e59ff49242941b5061164af25`。
- 主线程并行运行预算/驾驶集合；本次不以 rAF、帧时间或录屏包数量认证硬件性能，不重跑全交互、碰撞或预算。

## 八个机位

均为真实玩家位置的全页截图，保留 HUD；原 PNG 在仓库外。默认距离约 12 m，近景由真实滚轮 -650 后截图，再 +650 恢复；园区/水面有站定后的真实环绕视角。JPEG 每张 <400,000 bytes。

| 机位 | HUD x,z（米） | 证据 | 大小 |
| --- | --- | --- | --- |
| 01-camp-default | -41.994, 34.995 | [JPEG](final-tour-01-camp-default.jpg) | 377,479 B |
| 02-camp-near | -50.703, 39.253 | [JPEG](final-tour-02-camp-near.jpg) | 330,648 B |
| 03-town-default | 21.091, 7.747 | [JPEG](final-tour-03-town-default.jpg) | 279,010 B |
| 04-town-near | 20.741, -21.241 | [JPEG](final-tour-04-town-near.jpg) | 286,026 B |
| 05-water-default | 34.061, -42.986 | [JPEG](final-tour-05-water-default.jpg) | 247,886 B |
| 06-water-near | 34.660, -40.216 | [JPEG](final-tour-06-water-near.jpg) | 233,367 B |
| 07-park-default-night | 54.112, -43.679 | [JPEG](final-tour-07-park-default-night.jpg) | 162,704 B |
| 08-park-near-night | 62.677, -40.660 | [JPEG](final-tour-08-park-near-night.jpg) | 173,839 B |

## 看图判断

已亲看八张机位和独立 `content-card.png`：营地近景能辨认桌脚、书、凳子和玩家；城区的铺装、路缘、年份柱、展板与车辆有细节，沿大道自动出现真实履历摘要；桥的默认/近景保留水面和护栏，水面有浪/泡沫；园区夜档的木板、灯池、栏杆和小屋可读。默认与近景构图均保持正常 HUD，没有采用 QA 固定高机位。

Bobby 最可能批评「城区阴影太重、夜里还是有点暗」：实图中楼影确实占据大量路面，园区夜档主要靠局部灯池可读；本批按冻结边界保留真实画面，没有提亮截图或改运行时。美术偏好仍需 Bobby 亲玩，不能用 136/136 或截图代替接受。

## 文件与未验证边界

- 录屏：`/Users/bobby/Desktop/3D-personal-world/evidence/integ/final-tour/final-tour.webm`（canvas-only，HTML HUD 在截图中保留）。
- 原 PNG、内容卡截图、完整 report/轨迹、ffprobe：`/Users/bobby/Desktop/3D-personal-world/evidence/integ/final-tour/`。
- [小报告 JSON](final-tour-summary.json) 保留源版本、八图位置、动作、全部错误与视频实读数据；逐帧完整轨迹仅在仓库外。
- 未追加第二次浏览器运行、路线补测或全交互检查。没有本轮新增运行时代码/资产修改。
- 未验证项：生产首包/8 s、全岛最终预算、所有交互、接触精度、夜档全岛每个角落、Bobby 验收；这些不由本次巡游追认。
