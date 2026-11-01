# 灰盒视觉对照复审 v2

审查者：GPT Astra。日期：2026-10-21。

本次为修复后截图复审，不是 Bobby 试玩，也不是第 6 步最终盲审。灰盒标准与 [v1](visual-review-v1.md) 相同：允许建筑、树、帐篷、车辆及道具保持方块/胶囊，不要求正式模型或重新设计。

## 结论

**v1 的 P1 接面条纹、P2 夜档最低可读性可以关闭。** 营地出口的通行疑点也已有真实键盘移动记录补证，可关闭原补证项。当前八张截图中未发现新的灰盒视觉交付阻塞。

但这不是“全路线通行通过”：本次读取的 connection-regression.json 中，`plaza-boardwalk` 仍记录 `could not reach seam`，广场至栈道的实际通行尚未验证。该项应在灰盒整体交付前完成验证；不能从图片相接或其他两段通过推导它也通过。

## 实际查看与证据范围

本轮逐张用 view_image 查看了修复后的 [overview](overview.png)、[camp](camp.png)、[camp-night](camp-night.png)、[town](town.png)、[town-night](town-night.png)、[bridge](bridge.png)、[park](park.png)、[park-night](park-night.png)。又实际查看旧版 [bridge](visual-v1/bridge.png)、[park-night](visual-v1/park-night.png)、[camp](visual-v1/camp.png) 对照变化。参考图及两份冻结文档沿用 v1 已实际阅读的内容。

另只读查看 [connection-regression.json](connection-regression.json) 的已有记录，未运行实现或测试，未修改代码、冻结内容，未创建 PR。下文把视觉判断与他人已生成的自动化通行证据分别说明。

## 原问题关闭情况

| 原问题 | 新截图/记录中的实际证据 | 结果 |
| --- | --- | --- |
| P1-01 桥—广场及广场—栈道接面交错条纹 | 新 bridge 中旧图约 x=730–875、y=420–485 的密集水平条纹消失，桥面为连续色面；约 x=970–1090、y=510–585 的入口交错条纹也消失。新 park 广场入口和 town-night 右侧桥头没有复现旧条纹 | **关闭视觉问题**；不等于栈道入口碰撞已验证 |
| P2-01 夜档园区路面及水边不可读 | 新 park-night 中，入口、纵向转折路段和左下横向栈道均出现连续、克制的暖光；木色行走面与深青海面可分离，六屋前平台边缘可追踪。相较旧图大块纯黑海面与近黑木板，最低导航信息已改善 | **按灰盒标准关闭** |
| P2-02 营地出口接缝需通行补证 | camp 右下仍可见坡板侧壁及路缘转折；图片自身不足以判断断路。已有 JSON 的 `camp-exit: endpoint grounded` 与 `camp-exit: meaningful keyboard traversal` 均为 true，范围声明为真实 WASD、没有跳跃/驾车替代 | **关闭原通行补证项**；结论来自已有自动化证据，不冒充本人或 Bobby 实玩 |

桥至广场也已有 `bridge-plaza: endpoint grounded` 与 `bridge-plaza: meaningful keyboard traversal` 为 true，可作为这一段的独立通行补证。它不覆盖广场至栈道。

## 布局及两档复核

overview 的营地—海岸路—东北广场—水上栈道顺序保持不变，三块二期地基仍可见。camp 保持三橙色帐篷占位、八垫块、四凳与中央火堆；town 的六栋主楼仍在道路内陆单侧，各楼前场可分辨；park 仍为折转栈道及六屋，没有以修补条纹为由改变冻结布局。

camp-night 保留篝火中心，出口路缘仍能辨认；town-night 的道路边界、六楼及年份柱仍可读。park-night 的青色细线没有被扩大成霓虹面，补光仍以暖色地面照明为主。两档区分没有因修正最低明度而消失。

## 残留事项与优先级

**P2，灰盒交付前需完成：广场—栈道通行验证。** 新 bridge/park 显示入口两侧有矮栏及边缘结构，视觉上并未证明通路完全封死；同样也不能证明胶囊必然能通过。已读 JSON 最后一项为 `Connection traversal completed: false`，错误是 `plaza-boardwalk: could not reach seam`。当前描述是验证未通过、可能与测试路线遇到护栏有关，不能据此直接认定实现有 P1 断路，也不能宣称通过。需要正确路线的真实键盘移动证据，若确有净宽或碰撞问题，再在灰盒内修正。

**可后续美术阶段处理，不作为新问题阻塞：** 近处屋前平台仍比主通路暗，城市路灯地面光斑较弱，营地出口青柱较暗，海面暂未有正式倒影，坡板侧壁造型仍生硬。这些不妨碍当前截图中的基本边界辨认；应与正式灯光、材质及模型一起完善，不需要继续抬高整幅夜图亮度。

因此，本轮可以交付“视觉复审通过、原视觉问题关闭”的结果；整体灰盒是否完成仍取决于未完成的栈道入口通行验证以及独立的试玩/验收流程。

## 后续补证追加：2026-10-21 11:16（Asia/Shanghai）

本节是上述初次复审之后收到的补证结论，保留前文和原失败记录以呈现时间顺序。**广场—栈道通行待验证项现已关闭。**

已只读查看新的 [connection-boardwalk-regression.json](connection-boardwalk-regression.json)，其记录时间为 03:16:03–03:16:13 UTC（本地 11:16:03–11:16:13），命令范围为 `--boardwalk-only`。记录显示一次 QA 定位在广场起点 XZ=[50.8,-41.6]，之后以真实 WASD 从开放端头 XZ=[49,-46] 进入并沿中心线行走，目标为 [62,-40.8]，实际终点约 [61.9095,-40.9680]；`passed=true`、`groundedFraction=1`、`maxUnsupportedMs=0`、`errors=[]`。没有以跳跃、穿栏或再次传送来完成这段通行。

也实际查看了 [entry-mouth 截图](connection-plaza-boardwalk-entry-mouth.png) 与 [end 截图](connection-plaza-boardwalk-end.png)：前者显示角色在广场侧、两侧栏杆开放端头之前，后者显示角色已站在木栈道内部，广场位于后方。图片支持这两个状态的空间关系，连续通行结论来自 JSON 的键盘轨迹记录。

原失败仍保存在 [connection-regression.json](connection-regression.json)。新记录说明原脚本从侧面向栏杆行进，停在约 [51.829647,-41.347374]，距中心线约 3.27 m，对应栏杆偏移 2.85 m + 半厚度 0.08 m + 胶囊半径 0.34 m。修正后的路线经过开放端头后通过，支持将旧失败归为测试路线撞到有效护栏，而不是开放入口不可通行。

**更新后的范围结论：本报告列出的 P1/P2 视觉问题及三个接点的通行补证均已关闭，没有本轮证据支持的灰盒交付阻塞。** 这只覆盖已审查视图和指定接点，不宣称全世界所有路线、驾驶或交互均已验证；仍不是 Bobby 试玩或第 6 步最终盲审。本次仅查阅补证及追加报告，没有运行测试、修改实现或重审全部截图。
