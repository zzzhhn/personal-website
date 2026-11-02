# 树冠精修候选

使用现有 G16／G17／G18、ST1／ST2 的实际 `.blend`，保持已接受的切面海湾方向和原包络。不重新生成骨架、密度、落点或 LOD。脚本：`tools/world/nature-craft/build_trees.py`；Street 适配：`src/components/world/WorldStreetTrees.tsx`。Camp 的路径及材质接入由本批主执行负责。

| 构件 | 本次处理 | 冻结契约 |
| --- | --- | --- |
| 树干、根、主枝、细枝 | 保持源网格及材质 | 每个顶点、面、层级、变换与 `_WIND` 完全一致；碰撞仍取原 L0-trunk |
| 树冠 core | 原三档叶色写入顶点色，色度轻收至 94％，让外层叶片可辨 | 顶点、面、原包络和四通道风权重 |
| L0 七顶点叶片 | 原中脉增加叶宽 14％ 的隆起，宽肩向背面收 2.5％，形成浅杯形；叶柄至叶尖有连续色差 | 七顶点、六三角、原埋入叶柄及叶尖，原包络极点不动；风权重和相位不重算 |
| L1 | 几何保持原 decimate 结果，仅改善叶色 | 原 LOD 顶点、三角和切换距离 |
| 材质 | 冠部共享一份白底顶点色材质；原叶色完整存在线性 COLOR_0 | 不增加图集、纹理或透明层；源材质不原位修改 |

改进重点是实际叶面折弯、叶柄与叶片的色彩联系及内外叶层的辨认。三角数量不增加。原叶柄已经埋入 core，本次不虚报新枝条或新的物理连接。

执行命令（由持有重型作业锁的主执行串行运行）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/world/nature-craft/build_trees.py -- --ids G17 ST1 --render
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/world/nature-craft/build_trees.py -- --ids G16 G18 ST2 --render-all
```

省略 `--ids` 默认全部五树。`--render` 只对选中的 G17／ST1 生成 `trees-<id>-baseline.png`、`trees-<id>-native.png`、`trees-<id>-fresh.png`。每张使用同一个米制正交机位、灯位、功率、曝光与 Standard 色彩变换，Cycles CPU 24 samples、768×768；只隐藏 L1 进行展示，不将渲染相机／灯架存进原生资产。旧图来自实际旧 `.blend`。原生及 fresh 图来自本次保存／导出的候选，未修饰旧版材质或灯架。

`--render-all` 在本次生成结束后读取五个已生成 `.blend`，仅追加到独立展示场景，用一次 1536×640 渲染产出 `trees-native-overview.png`。五树按原米制大小分开排放并标注 ID，共用均匀方向光；展示平移不写回原生文件，也不影响游戏布局。五个 native 尚未全部生成时明确报缺失，不用其它树替代。

产物为 `tools/world/nature-craft/blend/<id>.blend`、`public/assets/world/nature-craft/<id>.glb` 和本目录 `trees-manifest.json`。manifest 按单树增量更新，包含源／native／GLB／图像 SHA-256、三角数、包络、风权重范围、精确 native 一致断言及 fresh 检查。fresh 会按实际空间位置匹配每个导入顶点的四通道风值，并验证覆盖所有被面引用的原生顶点；源 L1 decimate 留下的无面孤点在 native 原样保留并单独计数，glTF 三角 primitive 不导出这些孤点。允许 glTF 法线／颜色接缝拆点和 Draco 排序，位置误差阈值 0.00005 m、风值阈值 0.001，不用放宽精度解释实际有面点的丢失。

根节点在三个层次验证：原始与候选 native 的空根父节点、局部和世界矩阵精确一致；直接解析 GLB JSON 的实际 scene root 及 Z-up 到 Y-up 变换；fresh 导入根矩阵与 native 一致。`--verify-only` 默认重查五树已保存 native／GLB 的根、树干逐顶点逐面 hash、L1 完整几何、风属性和颜色，不重建、不导出、不渲染，用于补验已有产物。

Street 候选按材质基色乘入导出的顶点色，在原来的合批中继续保留 `_wind`，增加一个无纹理的 `treeLeaf` 属性，在同一个材质中区分木头 roughness 0.95 和叶面 0.87。该表面补丁在 `attachNatureWind` 的克隆材质上延伸，原风动、深度／距离阴影补丁、实例落点、遮挡、剔除、34 m LOD 和 140 m 距离阈值保持。`?natureCraft=legacy` 继续读取 `/assets/world/street/`，使用原材质单色合批及 roughness 0.93；候选读取 `/assets/world/nature-craft/`。没有修改 loader 缓存中的源材质。

协作者只准备代码与轻量检查，重型作业由主执行串行运行。主执行已完成五树导出、G17／ST1同灯架 baseline／native／fresh 图和五树原生总览，并实际打开代表图。全五树 `--verify-only` 通过；ST1／ST2 的原生 L1-crown 分别有68／48个未被面引用的孤点，原生保留，fresh严格覆盖全部有面点，不放宽位置、风和颜色阈值。五树GLB合计1,194,784bytes，三角形及所有树干／L1几何没有增加。网页日夜与最终候选状态见 RESULT.md，不能把离线图或源树干精确检查扩大成全岛人工碰撞／LOD通关。
