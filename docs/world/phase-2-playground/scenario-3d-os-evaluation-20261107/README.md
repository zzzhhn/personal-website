# Scenario 3D OS 对本地建模 skills 的评估

日期：2026-11-07。上游快照：`e7e19d5f7cf14f3b84a16a261dfb6f77724bd637`。
仓库：https://github.com/scenario-labs/skills/tree/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637

## 结论

值得吸收，优先引入专业检查与制作工具；保留本地的构造审美、实际 WebGL 材质路径、交互边界和性能验收。此次完成源码比较与一个本机兼容性小测，尚未安装整套 skills，也未修改现有 skills 或试玩项目。

“3D OS”是这个仓库的对外称呼。官方 README 区分两类能力：Scenario MCP 云端生成流程，以及无需 Scenario MCP、驱动本机软件的 Expert Tools。Blender family 有 15 个 skills，声明主要验证于 Blender 5.2.1。本机应用元数据与实际运行都为 5.1.2。

## 最有价值的补充

| 优先级 | 上游能力 | 与本地的差异 | 建议落点 |
| --- | --- | --- | --- |
| 高 | expert 的 bx_audit / bx_review | 本地已有缺陷原则与部分验证器；上游提供综合交付检查、故意植入缺陷的测试、多视角 silhouette/matcap/wire 图片 | blender-material-craft 的按需检查工具；按单件资产及语义部件运行 |
| 高 | hard-surface 的 bx_hardsurface | 分开设计倒角与微倒角，检查 modifier 顺序、平面性、布尔后倒角被限制的来源 | 金属设备、窗框、车壳、柜体等机械结构的专门制作流程 |
| 高 | uv-baking 的 bx_uvbake | UV 拉伸、折叠、重叠、利用率、像素间距、密度测量及投射/烘焙异常图更系统 | 把现有 UV/AO 检查从人工约定补成可运行的报告 |
| 中 | texturing-shading 的 bx_materials 与 critique | 提供分层 masks、独立 roughness 观察、材质节点检查及灰度遮罩预览 | 补充具体诊断操作，避免“加噪声等于质感” |
| 中 | export 的 bx_export | 可选的 GLB/FBX 预设、往返检查、静态 LOD 与简单碰撞工具 | 借鉴工具，不替换目前固定轴向、交互节点、材质扩展和属性的验证 |
| 后续 | rigging / animation / sculpting | 专业分域的辅助工具；本次未执行验证 | 单独角色任务再做测试，不并入静态资产批次 |

本地比较对象：
- /Users/a22309/.codex/skills/blender-material-craft/SKILL.md
- 同目录 references/review-and-runtime.md、references/coaster-car-benchmark.md
- /Users/a22309/.codex/skills/blender-low-poly-pipeline/SKILL.md
- /Users/a22309/.codex/skills/blender-connected-refinement/SKILL.md

本地目前已经具备构造分层、真实尺寸、同相机前后对比、重新导入导出文件、运行时 UV/PBR 合批路径检查、日夜与性能比较以及车厢/宝箱可执行好案例。不能把上游也有这些原则，误报为全部新增能力。增量主要是更多专业工具及可执行的故障诊断。

## 本机验证

只提取上游 MIT bx_audit.py 与 gate_cases.py 前半部分，添加明确断言；原始代码与许可证保留在 smoke/。使用全新 headless factory 场景，不打开 GUI，不读取或修改用户模型。

- Blender 5.1.2；两个线程；45 秒外层超时。
- 实际退出码 0；耗时约 2.6 秒。
- 七组 fixture：故障箱体、干净箱体、修复后箱体、render/print/roblox 三种 profile、GLB 导出再导入。
- 故障箱体准确产生四项预期 error：未应用缩放、法线反向、共面重叠、悬空把手。
- 其余六组 pass，errors/warnings 为空。
- 原始结果：smoke/smoke-result.json；日志：smoke/smoke.log。

运行方式（在本目录内）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --threads 2 --python-exit-code 1 -P smoke/smoke.py -- "$PWD/smoke" "$PWD/smoke/smoke-result.json" "$PWD/smoke"
```

这不是整个上游测试集，不证明 UV、材质、雕刻、绑定等全部兼容，更不证明我们现有模型因此视觉提升。

## 接入时必须改写的部分

1. **按资产语义检查。** deliverable() 以表面积最大的连接组为主体，其余组可能被判悬空。可开合盖子、车门、独立灯具等需要按静态/活动/悬挂关系分组。不能对全岛一次调用，也不能为消除报告而焊接活动零件。
2. **诊断不是穷尽证明。** 共面检测基于面中心的近邻查询，浮空检查存在采样，超过 5000 个部件会跳过部分检查并警告。pass 不代表不存在所有交叠、碰撞或穿模。
3. **保留本地坐标与节点验证。** bx_export.compare 对尺寸排序后比较，并主要检查材质输入贴图类别，不能替代轴向、位置、节点层级、hinge/seat/contact 点、纹理内容与 glTF 扩展检查。
4. **不照搬固定默认值。** 上游纹理尺寸、密度、AO 距离、倒角段数是工作流默认或特定案例，不适合作为整个浏览器世界的统一硬指标。我们的实际摄像机距离、像素占比、共享贴图和性能窗口仍决定资源预算。
5. **材质规则要保留条件。** 比如避免同一套法线与置换重复表达同一尺度细节有意义，但不能扩大成任何情况下禁止 normal + displacement；Cycles 的表现也不替代实际 Three.js。保持 glTF 独立 occlusion/ORM 约定。
6. **尊重版本差异。** 现有 5.1.2 的小测成功，不代表 5.2 专用 API 全可用。不为安装 skills 顺便升级 Blender。
7. **不要新增无用依赖。** 本地 Blender expert 工具不需要 Scenario 账号；图生模型、重贴图等云端路线另需账号/服务。开源仓库不等于模型服务和算力免费。
8. **安装和学习分开。** 官方全家安装有兄弟目录脚本依赖，单独拷贝 SKILL.md 会漏工具。正式吸收时固定版本、保存 MIT 归属，使用明确的轻量适配层。

## 建议的下一步

**执行更新，2026-11-07：** 用户已授权吸收并开展 Sol pilot。仓库已以 zzzhhn 账号 Star，GitHub 读回 204。六类工具与 GUI 依赖文件按 MIT 原样固定到本地 `blender-material-craft`，轻量 wrapper、适配边界及 Blender 5.1.2 实测记录见 [skill-integration](skill-integration/)。Sol 独立选择 C03 大帐篷并冻结首轮源文件与 GLB；实际结果见 [试玩验收](../scenario-tent-pilot-20261107/README.md)。本次对照是现有资产与新资产，不是同任务下旧 skill 与新 skill 的随机控制实验，不能据此声称工具导致了全部品质变化。

先在当前 skill 下建立按需参考与受测工具适配，不替换主入口，也不安装 Maya/Unity/Unreal 等无关 family。用一个尚待优化的营地资产作为新 pilot：

- 继承同一基线、相机、照明和交互尺寸。
- 比较“当前 skill”和“补充工具后的 skill”得到的首轮结果；保留协调者返修记录。
- 检查普通玩家视角、近景、夜间；保持 DPR、渲染设置和采样窗口一致。
- 达到可见提升且运行成本可接受后，再扩展到下一批。

需要评价的不只是 error 数量，也包括第一轮能否做对大形和材质、返修次数、总时间、额外资源成本。此次尚未执行这一视觉效果对照试验。

## 主要来源

- [Blender family 状态与验证范围](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/skills/dcc/blender/README.md)
- [综合检查源码](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/skills/dcc/blender/scenario-blender-expert/scripts/bx_audit.py)
- [上游真实 Blender 测试](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/tests/scenario-blender-expert/test_live_gate.py)
- [硬表面流程](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/skills/dcc/blender/scenario-blender-hard-surface/SKILL.md)
- [UV 与烘焙流程](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/skills/dcc/blender/scenario-blender-uv-baking/SKILL.md)
- [材质流程](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/skills/dcc/blender/scenario-blender-texturing-shading/SKILL.md)
- [导出源码](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/skills/dcc/blender/scenario-blender-export/scripts/bx_export.py)
- [MIT 许可证](https://github.com/scenario-labs/skills/blob/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637/LICENSE)
