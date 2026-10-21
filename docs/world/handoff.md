# 灰盒阶段交接 · 2026-10-21

## Status

第一阶段代码和本地证据已具备草稿 PR 交付条件。分支 `codex/world-greybox`，基准 `1f530e15304d5078b7757e720ec8b95473971337`。Bobby 已授权五个现站文件的最小改动及项目依赖安装，接入已完成。PR、最终提交 SHA 和 Cloudflare 预览以 PR 正文及会话交付链接为准。正式模型尚未开始；Fable 清单审阅与 Bobby 亲手试玩签字仍待完成。

## Result

- [资产清单 v1](资产清单-v1.md)：80 个制作条目，逐件列出来源、参考裁切、三角预算、materialRole 和物理属性；9 项参考不足已标待补图。
- [参考裁切索引](reference-crops.html) 与 [机器可读清单](assets-v1.json)。冻结原图原样复制，未改 PRD 或 Art Lock。
- 独立 `/world` React 岛：连通三区灰盒、胶囊走跑跳、三辆四射线物理车、E 上下车、2 秒翻车/R 复位、落水拉回、固定跟随相机与三档缩放、Esc 暂停地图、双语、两档光照。
- 四个动态路障验证占位刚体与 30 秒重生机制。其他正式道具、角色动作、履历经过提示及展位交互留后续门。
- Three/R3F 和 Rapier 在 `/world` 运行时动态加载；移动端先显示桌面试玩提示。正式移动端 10 秒预告片属于上线门。

## Verification

已有证据：

- [物理定向测试](evidence/actor-regression.txt)：真实 Rapier 三底盘/四射线、驱动、制动、碰撞及恢复/镜头纯逻辑，2/2 通过。
- [首次浏览器回归](evidence/browser-regression.json)：走跑跳、三车 E 上下车和短程驾驶通过；翻车恢复超时暴露 HUD 重渲染导致刚体位置回写的问题。保留原失败记录。
- [修复后的恢复定向回归](evidence/browser-recovery-regression.json)：12/12 通过，覆盖停车位置保持、翻车满 2 秒、R、落水回路、暂停、语言、夜档和缩放。修复为稳定场景与车身 props，未全量重跑玩法。
- [事件处理器](evidence/analytics-regression.json)：三个新事件和已有 `project_card_open` 返回 204，未知事件 400；内存 D1 stub 写入 4 次，无真实数据库请求。
- [视觉对照 v1](evidence/visual-review-v1.md)：Astra 实际查看 8 机位和 5 张参考，认可布局数量和空间顺序；指出桥头重叠面、夜间通路亮度及营地坡面补证要求。修复前图片留在 evidence/visual-v1/。

- [修复后 8 机位](evidence/world-shots.json)：1440×900，最大 102 draw calls、9,039 三角，0 pageerror；[Astra 复审](evidence/visual-review-v2.md)关闭接面条纹和夜档可读性问题。
- [接缝通行](evidence/connection-regression.json)：真实 WASD 通过营地坡道及桥至广场。第一次广场至栈道测试路线侧穿矮栏失败，历史记录保留；修正为从开放端头进入后的[单段补证](evidence/connection-boardwalk-regression.json)通过，grounded 100%，未用跳跃或连续 teleport 替代通行。
- `npm run check`：68 文件，0 errors、0 warnings、9 hints，均在既有非 world 文件；[日志](evidence/astro-check.txt)。`npm run build`：8 个静态页面构建成功，仅大于 500 kB 的分块提示；[日志](evidence/astro-build.txt)。交 PR 前全量各运行一次。
- [生产构建单轮样本](evidence/production-probe.json)：Apple M5 Pro、Chrome headless、1920×1080/DPR1；100 Mbps 下行、30 ms 延迟、冷缓存到 ready 897 ms，首批编码后资源 1,219,784 bytes（含内联 WASM 的运行时 JS）。三区各 5 秒静止跟随相机/实时物理约 60 fps，p95 帧时 16.7–16.8 ms。此为本地样本，不是 M1 Air 或实际 Cloudflare 网络承诺。
- 同轮检查首页未请求 WorldRuntime/Rapier/WASM；390×844 移动端提示页无 Canvas、未加载 3D 运行时，0 pageerror。

## Handoff

Bobby 本机复核最多三点，建议连续玩至少 5 分钟：

1. 营地走、Shift 跑、Space 单跳，E 上下越野车，沿坡道到海岸路。
2. 换开三辆车，过桥至广场，感受重量、转向、刹车、碰撞，检查翻车 2 秒后按钮/R 与落水拉回。
3. 检查固定跟随相机、滚轮三档，以及 Esc 菜单中双语和黄昏/夜晚 2 秒过渡。

未验证：M1 Air 1080p 60 fps、Bobby 主观驾驶手感及 5 分钟签字、Fable 审清单、远端 D1 写入、30 秒路障复位的浏览器计时、完整三车路线与镜头遮挡的人工体验、正式模型/完整内容交互/移动端预告片。现站 experiences collection 只有四条，六栋占位不擅自补履历事实；v3 轮心原点歧义、Interactive Learning 平台数量差异记录在资产清单，须在相应后续门确认。

只提交独立分支和草稿 PR，由现有 Cloudflare 集成自动产生预览。Bobby 自行决定签字与最终合并。
