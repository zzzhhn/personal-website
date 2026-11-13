# 接手基线类型修复

2026-11-13，基于6205018，独立分支codex/alpha-baseline-check-fix-20261113。用于让Alpha候选能执行有效类型验收，不更新4341、不push。

## 变更

- WorldCamp的QA图像尺寸使用显式可选width/height类型，保留缺值时null。
- ToolAction为只注册交互的React组件，显式return null。
- 音乐播放attempt显式声明可变boolean，仍使用同一对象身份检查异步play结果，不改音轨、加载、暂停续播。
- coasterSpineProfile声明真实二维tuple返回类型，不改轨道数值或算法。
- 国投绿植茎干补metal:0，消除undefined进入aMat生成NaN。没有把其它材质统一改值。

## 验证

`node --import tsx --test --test-concurrency=1 src/components/world/attractions/ibd-site-craft.test.mjs src/components/world/camp-prop-interactions.test.mjs src/components/world/park-roaming-music.test.mjs`：24/24通过。

`astro check --minimumSeverity error`：本修复checkout624个文件，0 errors。没有宣称含正在开发的新山岛/交通候选的最终集成检查通过，也没有做全量测试。

真实Builder + addIbdPlant([0,0,0],seed2,scale1)生成1484顶点。修复前aMat含140个非有限值，修复后为0；position、normal、color、aSuv与index SHA-256逐项保持一致。新回归覆盖不同seed/scale的全部属性有限以及植物金属度为0。

| 属性 | 前后一致的SHA-256 |
| --- | --- |
| position | 3c3bd076adbe9e928bfcee96aa834c58f93d21650a0c43f63435df3d0b0ddaba |
| normal | 2101488d67260111b46efab400f02a7715fbb474b964fed3ac105a7d26b03649 |
| color | 4214ab475d3c81f5168954025a5d7d3d8d90aeb63cfbb32858335bfc879ebfdf |
| aSuv | 941350c5ff3ed58f2b943bc66c13c46b33b25ce12ecf2dcdb759d068825d765b |
| index | 33b6f74f09875501299475be054b8f984daac8188b7642ebb64528d723474d9d |

原始logs：工作区evidence/status-20261112/planning/coordination/baseline-fix-{tests,check}.log。尚未单独做新GL帧视觉验证；国投植被的有限材质修复需随集成候选看图，不把数字修复冒充审美通过。
