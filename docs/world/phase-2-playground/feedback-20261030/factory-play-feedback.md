# 工厂试跑反馈，2026-10-30

## 实现范围

使用 integrate-design，保留现有场景、控制台样式、真实版本 1 配置与采样数据。未改 factory-game、store、物理、WorldFactory、WorldActors 或几何美术。

玩家循环为：选轻快型或稳健型的取舍，实体试跑，读摘要，选择轮组返工，重新加工、试装并在同样条件下重跑。导航仍为可选，没有增加自动换件、自动开始试验或额外门禁。

## 文件和接口

* `factory-copy.ts`：选择按钮与用途说明展示较高目标速度和低重心、抓地的取舍。轮组切换按钮明确命名目标配置。目标速度不等同于实测胜负。
* `factory-experiment-feedback.ts`：无存储、计时器或物理副作用的派生函数。
  * `factorySameConditions(a,b)` 检查 testKind、loadKg、courseVersion、seed、durationLimitS。
  * `factoryPreviousComparable(trial,records)` 仅查当前轮次之前、同批次同模式同条件且完整完成的记录。优先相同配置身份、revision、kind、三个 part id，其次最近的其它完整配置。
  * `factoryRunSummary(trial,zh)` 描述你的伙伴首次终点采样时间、最高保留速度、绝对倾角峰值和对应前中后路段。路段按样本 progress 三等分，仅为定位，不推断原因或失败阈值。
  * `factoryComparisonSummary(trial,records,zh)` 使用上述旧跑；不存在可比旧跑时使用同轮已知基准机。仅完整完成的轮次可以比较采样耗时和整段记录峰值倾角。换型写明整套配置前后与类型，不把差异归因单个零件。单次峰值差异也不写成稳定性保证。
  * `factoryWheelExperiment(game,zh)` 根据当前身份最新记录提示具体目标轮组、加工试装、相同模式和条件下的下一段试跑。装置故障或会话中断先提示原条件重跑。返工完成后没有旧配置结果冒充当前结果。
* `WorldFactoryReadings.tsx`：先显示摘要，再显示条件；原始采样表折叠，运行中展开。保留历史、试验身份、主观观察与未知故障原因。FactoryTrialReadings 新增可选 `records` 属性。
* `WorldFactoryHud.tsx`：试跑反馈位于选择下一项操作之前；返工台也能读取下一次试验建议。
* `factory.css`：沿用既有字体和色系，仅补摘要、差值、details 的间距与键盘焦点。
* `factory-experiment-feedback.test.mjs`：六个纯函数用例。

## 证据边界

保留的采样不是连续曲线。最高速度和倾角只称为记录峰值，耗时称为采样时间。未完成、中断、缺少终点采样都不比较全程。伙伴自己到终点但双机另一台未到时，摘要可如实描述自己到达，整轮状态仍未完成，禁止全程差值比较。

轮组返工会切换 configuration.kind。现有物理模型的质量、低位配重、抓地、悬挂和目标速度随 kind 调整，因此提示是整套行驶配置的取舍，不声称固定底盘参数下只有轮宽发生变化。

没有新增胜负、合格、稳定性评级或虚构测量。未改样本上限、存档、终检、出厂与中断语义。

## 10 principles re-check

| 原则 | 对应实现 |
| --- | --- |
| 意图 | Hud 将本轮结果放在下一项选择之前。 |
| 认知负担 | Readings 收起原表格，无新增仪表盘。 |
| 状态可见 | 原运行、完成、中断状态保留，摘要不覆盖状态。 |
| 容错 | 不完整不冒充成功，技术中断提示重跑。 |
| 可操作性 | 换轮按钮命名实际目标配置。 |
| 设计隐身 | 沿用控制台和游戏导航。 |
| 无手册 | 摘要解释快、倾角、未走完；建议明确下一轮试什么。 |
| 时间 | 纯派生函数，无额外异步任务。 |
| 透明 | 显示条件、采样依据和换型因果边界。 |
| 主动作 | 保留玩家自主选试验与可选导航，不强制自动返工。 |

## Cross-cutting conventions audit

| 项目 | 结果 |
| --- | --- |
| i18n | 新增字符串均由现有 zh 布尔值选择中英。 |
| 字体 | 继承 factory.css，没有新增字体或外部请求。 |
| 布局 | 复用 factory-console 和 factory-readings。 |
| 导航 | 沿用 guideFactoryStation，无新增页面或侧栏。 |
| 数值 | 使用现有固定精度与单位，条件来源于 trial。 |

## 验证

串行执行 `node --test --test-concurrency=1 src/components/world/factory/factory-experiment-feedback.test.mjs src/components/world/factory/factory-readings.test.mjs src/components/world/factory/factory-guidance.test.mjs`，14/14 通过。

资源限制下未启动浏览器、构建或物理试跑。主线仍需检查真实试跑、返工后同条件比较、双语长文、移动端控制台滚动和运行中读数折叠行为。遵循用户资源限制，integrate-design 的渲染截图验收尚未完成；不能据纯函数测试声称体验或视觉通过。
