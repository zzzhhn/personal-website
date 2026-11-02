# 候车亭与小屋 R2：主协调视觉复核

2026-11-03。上一轮的主要返修阻断解除，允许冻结为集成候选。**不是两族全面完成、用户审美接受或 4341 已更新。** 下一步是冻结最终来源和性能/兼容性审查。

## 实际打开的图片

来源：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-facilities/docs/world/phase-2-playground/asset-batch6-20261103/facilities/runtime-r2/`。

主协调本轮实际打开 10 张现成 JPEG：

- `candidate-{shelter,hut}-normal-{noon,night}.jpg`，4 张。
- `candidate-hut-close-{noon,night}.jpg`，2 张。
- `candidate-shelter-glass-{grazing,rear}-noon.jpg`，2 张。
- `baseline-{shelter,hut}-normal-noon.jpg`，2 张。

未打开的其余 R2 图片不记为主协调已看。没有为本次复核新增浏览器或 Blender 任务。

## 视觉判断

| 对象 | 本轮判断 | 边界 |
| --- | --- | --- |
| 候车亭 | 普通视距的三块白板已成为透光面；斜角和背面能读出玻璃板、压边及夹持关系，地图保持实体。夜间框架与环境重新处于一致亮度层次 | 当前是低成本乳浊透明玻璃近似，背景仍清晰，不能宣称真实磨砂模糊。静态图没有明显排序缺失，不代表所有移动角度均已通过 |
| 小屋 | 木纹方向与尺度较 R1 克制，近景板缝重新清楚，蓝漆不再呈强云斑，檐口与梁柱有材质区分。夜间保留原局部灯光主次，木构不再自发亮 | 相比原基线，普通视距提升温和，近景更清楚；室内大块素墙、窗面和展品仍有后续精修空间，不将整栋建筑所有表面报为完成 |

允许将两首样进入集成前审查，不继续无目的调整相同参数。后续同类扩展仍需独立看实际普通游玩视图，不能把这一结论泛化到全部街道、Club 或其他设施。

## 收据复核

主协调重新读取并比较全部 8 对 R2 JSON：view、fov、time、canvas、exposure、quality、night、blend 逐对一致。四个相关背景 root（Club 整体、吧台、家具、营地）的记录逐对一致；候选 world-park 几何变化及 world-street 新增玻璃批是本轮预期差异。

每帧渲染计数差异：候车亭四对均为 +3097 triangles / +1 draw；小屋 normal 两对为 +1906 / +0，close 两对为 +1818 / +0。它们仍是对应整场景帧的计数，不是单件模型面数或 FPS 测量；不沿用 R1 约 62 万三角面的误差作性能结论。

作者提供的 `hut-source-equivalence.json` 报告首拍与最终 native 的 304 个 mesh 在规范化枚举后的几何、逐角 UV、材质指派、层级/变换以及打包木图字节相同。主协调已读该报告，未重新执行 Blender 等价性工具；最终归档来源、portable factor 修复及具体提交仍需随冻结交付检查。

## 交接

已将上述结论发回设施作者，要求完成最终本地提交后，把精确来源与改动路径直接交性能线审查材质缓存、LOD/fade/dispose 及受影响局部开销。自然线的下一重型窗口保留。4341 保持稳定版，原 57 族待复核/返修清单没有因这次候选复核而整体减少。
