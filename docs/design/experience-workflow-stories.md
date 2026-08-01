# Experience Workflow Stories

## Intent

五段实习经历采用同宗异构的 workflow 叙事。它们共享展开入口、蓝图底纹、节点材质、字号层级和动效约束，但根据工作的真实结构分别使用实验台、路由器、dossier、闭环引擎和审核台账。

| Experience | Story form | Information structure |
| --- | --- | --- |
| Video Rebirth | Evaluation Lab | 数据与指标双通道汇入评测舱，再输出分析和报告 |
| ByteDance AIME | Evaluation Router | 需求与意图进入双校准通道，再经过自动、人工和质量闸门 |
| MoE Capital | Research Deal Room | 一级市场、赛道研究、访谈和舆情四条真实信息流汇入研究综合与投资备忘录 |
| WorldQuant | Alpha Foundry | 候选生成、仿真、门控、复核形成持续迭代闭环 |
| SDIC Securities | Underwriting Ledger | 立项、底稿、估值、报告和内核形成可追溯台账 |

## UI principles re-check

| Principle | Concrete implementation |
| --- | --- |
| Intent alignment | `TimelineCard.tsx` 保留卡片与 View workflow 单一展开入口，用户无需先选择图表类型 |
| Cognitive load | `NarrativeWorkflow.tsx` 每个画面只有一条主叙事和最多四个同层状态 |
| Status visibility | 各布局以 RUN、GATE、阶段编号、输出节点和审核勾选等贴近任务的状态呈现进度 |
| Forgiveness | 展开和收起完全可逆，不写入状态，也没有破坏性动作 |
| Affordance | 所有 workflow 仍使用相同按钮和 chevron，视觉节点不伪装成可编辑控件 |
| Good design disappears | 专业隐喻服务于经历理解，不新增教学层或操作说明 |
| No manual required | 五个标题、阶段编号和连接关系在首次展开时即可理解 |
| Respect time | 无新依赖，不做持续指针跟踪，每个 workflow 只有一个 CSS 或 SVG 动态线索 |
| Truthfulness | 节点逐条映射当前经历正文；MoE 不再展示正文未支持的技术尽调与 IC 节点 |
| One primary action | 每张经历卡片仍只有 View workflow 一个主操作 |
| Traceability | 阶段编号、分支和回路保留从输入到输出的可追溯关系 |

## Cross-cutting conventions audit

| Convention | Audit result |
| --- | --- |
| i18n | 标题、meta 与节点均由 `i18n.ts` 提供中英文；组件继续使用 `data-lang` |
| Typography | 正文沿用站点字体，系统标签统一使用现有 monospace 字体栈 |
| Layout wrapper | 五种布局均复用 `.wf-container`，因此继承同一垂直中线定位 |
| Theme | 浅色和深色使用现有 CSS token；没有写死页面背景色 |
| Motion | 每种布局最多一个动态线索；`prefers-reduced-motion` 下全部隐藏 |
| Navigation | Header、section id、sidebar 和卡片展开逻辑均未改动 |
| Mobile | 沿用现有移动端策略，隐藏桌面时间轴 workflow 及其入口 |
| Locale data | 日期、组织、地点和经历正文均未复制或改写 |

## Acceptance invariants

- 1440px 桌面视口下，五组 workflow 与对应卡片的垂直中线误差不超过 2px。
- 英文浅色与中文深色下，workflow 节点不得出现 `scrollWidth` 或 `scrollHeight` 溢出。
- 深色模式下，阶段编号和辅助标签必须保持可辨识对比度。
- Astro check 为零错误，静态构建成功。
- Cloudflare Pages 成功后，正式域名样式资产必须包含四个新增 variant selector。
