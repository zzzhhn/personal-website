# 候车站房工艺包

2026-11-05，独立制作清单16、17、18及40中的车站牌框。基线 `b75c474`。参考已认可的列车与宝箱材料分工，不改变当前建筑形体、通行及登车逻辑；本包尚未获得实际引擎视觉验收。

| 构造 | 本次处理 |
| --- | --- |
| 候车厅 | 保留原折面屋顶截面，屋底以有厚度的浅格板和退进接缝分层，铜色檐口与钢制滴水边区分上下表面。原柱、檐梁、承板与实体斜撑保留位置，柱脚/压头有独立装配尺度。 |
| 屋面设备 | 主厅风箱与东附楼服务壳仍在原尺寸内，以有盖板、底座和退入的百叶表达设备；不新建控制亭体或占用站内通道。 |
| 侧板与标牌 | 四块原候车侧板改为有边框的深色面板，未添加文字。车站牌只提供背板和外框，既有双语 atlas 保留。 |
| 东/西服务建筑 | 原封闭核心体量、矿物框和门窗位置保留；东楼玻璃/窗套/滴水边、闭合服务门的面板和把手、西屋百叶分别按材料表达。服务门仍无可开交互。 |
| 登车梯 | 六级踏步及门槛桥由 `COASTER_BOARDING` 精确导出。矿物立板、.055m 面板与钢制踏鼻分开，接触顶面同高，踏鼻不抬高脚路。原前唇的外延保持。 |

[contract.json](contract.json)冻结原屋顶截面、四个柱体、六个结构接触 member、两个建筑体量、六根东屋面 vent、七个实际登车面与车站文字面。所有坐标为本场局部米制；runtime 根设 `coasterWorld([0,0,0]) = [50,1,-195]`，GLB +Y 向上、+Z 向入口。原生 Blender 使用 Z 向上。Far/Shadow 原生根默认隐藏，避免与 Near 重叠。

七种物理材质按职责分工：暖灰矿物、蓝灰涂装钢、铜色包边、加工镀锌钢、哑光屋底、深色不透明窗面及石墨色凹槽。三张自制256px数据贴图负责矿物粗糙度、拉丝钢粗糙度、轻微轧制金属法线，随原生与 GLB 打包；不是扫描材质，也没有新灯光或传输玻璃。

consumer 为 `WorldCoasterStationCraft.tsx`。统合后既有 `detailed` flag 限制最高档，相机到建筑包络的距离以30/36m迟滞选择Near/Far；复用渲染帧，无定时器、每帧分配或React状态更新。两档共用 PBR 材质与纹理副本、借用已有 PMREM，局部环境强度白天0.85、深夜0.50；只在既有夜间值变化时更新。单独 Shadow 根用原主要体量与实体接触作简化不透明投影，避免近档薄构件逐件投影。材质副本归 consumer 释放，loader 几何与图像仍共享。

旧 visual 必须按 [EXCLUSIONS.md](EXCLUSIONS.md) 串行排除，避免与新包叠加；原 collision、glow、atlas 和交互保持原 owner。没有修改现有生成函数、physics、shader 或 review 配置。

```sh
node --experimental-transform-types tools/world/coaster-station-craft-20261105/contract.mjs
blender --background --factory-startup --threads 2 --python-exit-code 1 --python tools/world/coaster-station-craft-20261105/build.py
node tools/world/coaster-station-craft-20261105/verify.mjs
```

已按主 session 授槽，资源预检后使用 Blender 5.1.2、2 threads 无渲染导出。交付 [station-editable.blend](station-editable.blend)、[station.glb](station.glb) 和 [export-check.json](export-check.json)。原生共有477个具名可编辑部件，包含近档、远档与投影源；GLB 1,437,212字节。

| 根 | 三角面 | 材质批次 |
| --- | ---: | ---: |
| Near | 29,480 | 7 |
| Far | 2,388 | 7 |
| Shadow | 400 | 1 |

运行时只显示一个视觉档，另加一个不写颜色/深度的 Shadow 载体，因此主通道最多8个结构提交，投影1批。这是包内结构成本，不是实际全场 calls 或 FPS。Near/Far 的局部包络相同：`[-17.17,0,30]～[12.97,7.7,53.109]`。投影保留主要轮廓和全部接触体，省去窗套、柱脚薄片等小轮廓，需在引擎检查近处阴影。

脚本 AST、Node语法及 helper strict 类型检查已通过。GLB检查通过三档的有限单位法线、UV、非退化索引，近远屋顶原截面、六个结构件各八角点、七踏面共63处射线、中央通道、LOD切换和最终资源释放。图片只检查真实内嵌PNG格式与256px尺寸，Node测试使用占位采样器，不冒充纹理解码或WebGL视觉验证。制作方未自行接入页面或打开浏览器。

主会话已完成正式源码接线、v12普通距离昼夜检查及登乘到riding，v14实际读回近远档；证据见相邻目录`coaster-scene-completion-20261105`。逐阶贴地和下车连续观察仍未完成，整批长尾性能未通过，4341未更新。顶部的“本包尚未获得实际引擎视觉验收”是制作交付时的状态；当前候选状态以上述统合记录为准。
