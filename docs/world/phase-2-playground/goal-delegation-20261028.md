# 七项目标的实施分工

用户于 2026-10-28 要求把可独立实施的目标分给其它 sessions，提高实际产出效率。各线负责一轮完整实现与相关验证，主线只负责跨模块决定、审阅合并、GitHub 和 4341 推广。代码基线为 `32cb362`；此时货车地板修正的 35 项定向回归已通过，4341 仍是 v16，v17 浏览器收尾在主线进行。

| 线 | 对应目标 | 本轮交付与所有权 |
| --- | --- | --- |
| 字节过山车 | 2、3、5、7 | 当前 v4 真实轨道已扩至约 1.9 km／85 m／八次倒置，自由视角与小跑登乘已有实现。以已批准 v4 日夜参考为准，完成岩岸、支架连接、轨道与车站层次的代表性细化和本设施净空回归；拥有 attractions/coaster-*、WorldIntentCoaster.tsx、意图设施专属美术／照明，不重写既有 v4 轨道或退回旧 v2。共享角色／全局镜头改动交主线或角色线。 |
| 场景美术与照明 | 1、5 | 本轮专注国投：三棚屋架连接、钢材／涂装、设备与货物层次、夜间工作面，以 IBD v1 为基准。拥有 ibd-yard-architecture.ts、ibd-yard-site.ts、ibd-yard-palette.ts、ibd-yard-geometry.ts、ibd-craft-geometry.ts、ibd-truck-geometry.ts、ibd-yard-lighting.ts、WorldIbdLighting.tsx 及对应美术测试。不得改变工作站、装卸坐标与控制状态；必要接口先交接。 |
| 国投玩法与首次引导 | 6 | 接手当前真实订单、取工具、翻卷、拆检、退换、装车和放行，修首次体验的断点与重复／取消／重入问题。拥有 ibd-yard-game.ts、ibd-model.ts、ibd-yard-guide.ts、WorldIbdGuide.tsx、WorldIbdHud.tsx、ibd-yard.css 及各自测试；不碰美术线拥有的静态模型，不擅改站位和路径。 |
| 音乐与音效 | 4 | 负责可试听、可回退的小批音频与有界接入，实现一轮改善。拥有 WorldParkAudio.ts、WorldClubAudio.ts、声音素材／生成源及音频专属模块和测试；保留来源与许可。既有 48 秒候选未接入、未听感验收，先做短 A/B 校准，不能直接等同音质完成。 |
| 人物接触与镜头 | 3、7 | 负责共享人物／镜头／狭角的接触一致性、过山车自由视角与上下车动作链回归。拥有 WorldActors.tsx、actor-*、player-*、相机专属模块及定向测试；不改轨道、设施模型、音频或世界性能调度。优先真实可复现问题，避免无依据重构。 |
| 性能与资源效率 | 全局横向项 | 对当前场景的静态／活动／暂停／离开／卸载做源码和有界测量，提交至少一项有证据的节省或完整回归结论。拥有 WorldRuntime.tsx、WorldPerformance.tsx、performance-* 和资源策略专属模块；音频建议交音乐线，角色建议交角色线，不与他们同改。 |

## 共同交付规则

- 使用主线准备的独立分支和工作目录，不在默认 main 或 integration 直接修改。保留其他人的成果。不推送、不更新 4341、不 merge main。每轮交付一个可审阅的本地 commit、自己的 handoff、验证证据和剩余差距。
- 项目仍按 `src/components/world/AGENTS.md` 与 visual-calibration-20261027 的参考合同工作。美术先对照已批准图；只用测试不能证明审美。禁止为了绿灯降低碰撞断言、隐藏场景或把浏览器未验写成通过。
- 需要跨线文件时先在自己的 handoff 写清最小接口请求，主线统合，不顺手越权改文件。各线可以独立使用有明确边界的 subagents；Sol 必须 gpt-6.1-sol/high，Luna 必须 max。不要递归铺开重型工作。
- 当前磁盘约 2.8 GiB，内存时有警告。每次重工作前运行 `/usr/bin/python3 /Users/a22309/.local/bin/codex-resource-preflight.py`；复用已装依赖，不 npm install，不下载历史录像或大型模型。浏览器、完整 build、Blender、音频重渲染共用一个串行重任务窗口；当前由主线持有。其他线先完成源码、设计和短测试，有需要在 handoff 标注请求的窗口，不忙轮询等待。
- 这份分工不把目标标为完成。已实现的轨道、相机、动作与货场修复无需重做，后续以当前代码和真实用户反馈为准。
