# 营地可玩美术样片 · 2026-10-21

本次只制作出生营地到出口的一段。Bobby 已明确授权提前 L1，四个独立 `group/opus55-fast` 会话分别制作帐篷/篝火/长凳、书桌/书堆/奖杯/旗、自然物件与运行时接入；Codex 主会话整合实景，直接与 WorkBuddy 的 Fable 5.1 协作审阅。

## Result

- 16 个独立 Draco GLB：C03–C10、G16–G23。全部附可编辑 Blender 源、生成脚本、机器报告、最终 GLB 六视图。16 件合计 8,690 三角，GLB 合计 197,156 字节（约193 KiB）；实例及渲染多 pass 另计。
- 营地段 C01/C02/G01/G02 程序化地面、石板、崖壁与配色，配合局部夜光、橙帆布内透光、旗面风动、篝火动效。Draco 使用同源解码器，GLB 失败显示独立命名的灰盒后备。
- 其他城区/园区、角色和三辆车仍是灰盒；C11–C15 为低矮帆布盖包，C16 小灯未制作。没有扩大到全岛，没有 Hy3D 调用。
- 既有镜头、出生点、八块石板和帐篷坐标、地形与物件碰撞体、车辆参数保留。现有碰撞体与正式视觉网格尚未逐件拟合；轮胎侧碰架构未改，不能把本轮步行视频作为驾驶穿模已修复的证明。

## Evidence

| 组 | 清单和实测 | 最终彩色视图来源 |
| --- | --- | --- |
| Shelters C03–C06 | [manifest](shelters/manifest.json)、[QA](shelters/qa_report.json)、[说明](shelters/README.md) | 最终 Draco GLB 全新场景回读；clay另标原生blend |
| Props C07–C10 | [manifest](props/manifest.json)、[QA](props/qa_final.json)、[说明](props/README.md) | 最终 Draco GLB 全新场景回读 |
| Nature G16–G23 | [manifest](nature/manifest.json)、[QA](nature/qa_report.json)、[说明](nature/README.md) | 最终 Draco GLB 全新场景回读 |

机器通过、美术审阅、实际运行与用户验收分别记录；最终状态以本报告与80项资产清单为准，各组原始交接中“未运行/未审”是当时的历史状态。资产审阅快照见 [Fable逐件审阅](reviews/审阅-营地样片资产-20261021.md)。Fable 已正式给出 [“营地样片设计通过”](reviews/审阅-营地样片运行图-20261021.md)，并自行回写 Art Lock v1.2 色板；Bobby 尚未验收。

审阅原文为只读快照，其中“C11～C16 五块石板”是编号笔误：实际为 C11～C15 五块盖包，C16 桌灯未制作。最后一次摆放采用旗杆 index4、书桌/书堆 index3、奖杯 index5；默认镜头书桌部分出框，第一面旗被裁，第三面橙旗完整可见，这是 Fable 接受的构图取舍。

最终静态图为 r4：[默认出生](runtime/spawn-dusk.png)、[最近档](runtime/spawn-zoom-0.png)、[最远档](runtime/spawn-zoom-2.png)、[默认夜晚](runtime/spawn-night.png)、[营地全景](runtime/camp.png)、[营地夜全景](runtime/camp-night.png)。

[20秒实走视频](runtime/walk-to-exit.webm)与[关键末帧](runtime/walk-end.png)为 r3：在 r4 调整石板上旗/书桌摆放前录制，物理、灯光和镜头与最终版一致，视频不冒充 r4。完整轨迹见 [r3实走报告](runtime/walk-r3-evidence.json)，最终静态统计与源码哈希见 [r4报告](runtime/runtime-evidence.json)。

## Verification

- 一次 `npm run check`：74文件、0 errors、0 warnings、101 hints；92来自同源复制的第三方Draco JS，9为现站已有提示。见 [诊断摘要](runtime/astro-check.txt)。
- 一次 [清单一致性检查](runtime/inventory-check.json)：80 ID、Markdown80行×9列、16 GLB SHA/大小/压缩/面数/materialRole/源文件/最终视图全部匹配。
- 最终6机位均加载16种模型，0 pageerror、0资产加载失败。默认中档176 draw calls/36,471 triangles，全景205/38,807（含实例和多pass）。
- 20秒内从默认出生沿实际WASD路径到出口，19.794秒抵达，8/8路径点，141个采样均着地，0错误；主会话和Fable看过关键帧。该路线不覆盖贴近全部物件或驾驶碰撞。
- 本轮未改物理参数，不重复connection与完整驾驶回归；不新增仓库测试，不执行全量测试。截图中的renderer.info不是唯一模型三角数，也不等于帧率/首包性能认证。

三个资产组最多各三轮建模；r4指运行时摆放/光照截图轮次，不是第四轮模型生成。

## Handoff

- Bobby 尚未体验或认可这版样片，不能代签灰盒门。
- 未验证：M1 Air 1080p 稳定60fps、真实网络冷加载、移动端、线上D1写入、完整驾驶与轮胎侧面碰撞、全部对象精确碰撞、全岛美术、课程黑板等内容交互。
- 书脊、奖牌和旗面文字未制作；C16小灯与其他未授权模型不计入这次16件交付。
- 不存在“待 Fable 补图”的资产职责：G28/G29/T07的原生图由Codex生成；G28双方推荐A，G29/T07按Fable简化条件留作后续参考，本次没有开模。
- 建模预算使用四项已注册skills的适用规则，旧单体面数仅为历史估算；不扩大整个产品的加载/同屏预算。
