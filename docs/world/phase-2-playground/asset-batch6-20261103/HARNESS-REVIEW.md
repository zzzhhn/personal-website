# 材质制作 Skill 与验收链路复查

2026-11-03。源码基线 `d10d902`；本次只修改指导与批次协调文档，不修改生产渲染代码或4341。

## 判断

问题不是缺少“做好材质”这句话。旧 `blender-material-craft` 已要求导出保真、正常视距和最终引擎验收，但没有具体说明如何发现中间适配层静默丢弃材质信息。第五批执行又沿用了旧 Art Lock/纯色处理，主协调把“结构更完整、没有阻断缺陷”赋予了过高的质量完成权重。指导的操作性、运行适配和实际验收都有责任，不能归因为 Sol 能力不足。

可复核的源码边界：

| 路径 | 事实 | 对制作的影响 |
| --- | --- | --- |
| `WorldStreetGeometry.ts` 的 `Builder.vert` | 非标牌 `aSuv` 置零 | 新木材图需要有效的独立表面坐标 |
| `WorldStreetMaterial.ts` 的 `createStreetMaterial` | 旧shader用顶点属性替换粗糙度/金属度map片段 | 设置贴图不等于最终shader使用贴图 |
| `WorldParkKit.ts` 的 `toBatch/meshPiece` | 只保留位置/法线，再按首材质名称生成颜色 | 原GLB UV和多材质响应不能直接抵达画面 |
| `tools/world/facility-craft/street/build_native.py` | TypeScript Builder为运行权威，导出的GLB用于便携证明 | 不能用未消费的GLB代表网页已升级 |
| `WorldParkKit.ts:306`、`WorldParkWalk.tsx:240` | 克隆后才读取自定义钩子 | 当前Three的独立无renderer探针确认clone不保留这类回调；需显式组合，夜景画面仍待实际验证 |

性能线的原始源码哈希、安装版本及探针收据保存在 `performance/source-evidence.json`。报告仅为源码与构造验证，不证明当前玩家帧已经改善。

## 修改的权威来源

- `/Users/a22309/.codex/skills/blender-material-craft/SKILL.md` 及 `references/review-and-runtime.md`：给出source→loader→merge/clone→shader的材料路径检查、必要通道/变体/资源所有权检查，保留简短的首样证据记录。纹理和高面数均不是强制目标。
- `/Users/a22309/claude-project/.agents/skills/orchestration-harness/SKILL.md` 及 `references/playbook.md`：视觉批次在正常视距分别判断正确性与改善幅度；首样无明显提升先修原因，再扩展同类处理；由主协调亲自检查真实图。独立试用不提供预设诊断答案。
- `blender-low-poly-pipeline` 已明确不因名称限制低模，连接、角色设计、动画skills也不是此次静态材质丢失的原因，未扩大修改。

两生产会话已收到精确文件重读指令。共享模块所有权已单独划定，性能会话仅提供报告，不双写生产源码。

## 验证与限制

结构检查：通过已有 Homebrew Python 3.14 执行 `skill-creator/scripts/quick_validate.py`，上述两个skill均返回 `Skill is valid!`。系统 `/usr/bin/python3` 最初缺少PyYAML，随后复用已安装环境，没有安装额外依赖。

独立前向试用：新协作者 `craft_harness_forward_test` 使用 GPT 6.1 Sol / high、无历史fork，仅获得普通制作任务、修改后的skill和实际源码；禁止读取本批诊断目录、其它会话记录，也未向其提供预期问题清单。它独立发现街道GLB并非网页输入、UV和材质通道丢失、克隆钩子风险，并补充木屋碰撞依赖 `shell/piles` 节点的约束。报告明确拒绝凭离线图批准网页视觉、交互或性能。主协调检查相关源码后接受这份诊断交付。

这次试用证明该指导能支持一次有效的源码诊断与交付边界判断；没有做旧版/新版skill的随机对照，不能据此宣称因果增益、普遍模型能力提升或最终画面更美。测试未打开浏览器、Blender，未构建和更换试玩包。

后续效果证据仍是第六批四个真实首样：岩石、帐篷、候车亭、小屋的同机位网页前后对照。普通视角看不出提升时继续局部返修，不能把“指导已更新”算作资产优化完成。
