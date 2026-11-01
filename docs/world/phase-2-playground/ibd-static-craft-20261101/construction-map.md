# IBD 静态设备三组

本批延续获准的国投物资场 v1 工业风格，以及实际 crate 的浅木、冷色钢件和克制黄色边界。保留三棚、钢卷、吊机、货车、装卸路径及全部交互，只替换三个设备家族的静态外壳。三家族选择及落点由 root 于 2026-11-01 明确确认。

| 家族与落点 | 原生构造 | 固定语义与接触 |
| --- | --- | --- |
| InspectionBench，`[10,0,-12]`、`[18,0,-12]` | 四根 RHS 腿、焊接鞍座、足板、纵横框、托盘折边、下层斜撑、完整金属检查面 | 原台面 `y=1.0`、`3.3×3.0`；框外包 `3.6×3.2`；所有 roller bar、步行 gaps、工具和样本仍由原代码绘制 |
| UtilityBench，`[-3,0,26]`、`[-6,0,19]` | 顺纹厚板、钢侧腿、横撑、斜撑、下承梁、原黄色后挡条 | 原生 Receiving／Tools 两个高度，台面 `.88`／`1.18`，宽深 `2.2×1.2`；不通过非均匀缩放改变五金 |
| ControlPedestal，原 10 处操作点 | 折钢壁、内缩检修门、门框、铰链、风口、固定底板、黄色操作台盖 | 原生 Standard／Crane 两个高度；盖顶 `1.33`／`.93`；原屏幕、按钮、手轮、静态操纵杆及动画 crane levers 全部保留原代码与坐标 |

`buildIbdStatic({separateCraftShells:true})` 只把上述外壳顶点分离为小型 legacy mesh，原 main mesh 不包含第二份外壳。GLB 未加载、不可用、在远处或 `?qa=1&ibdStatic=legacy` 时展示这一原始外壳；成功后只挂载一组 portable meshes。原来的全部 solid proxies、gallery/ground/roller trimesh 数组保留。控制外壳由 `addYardControl` 最初三个 cube 调用界定，后面的全部控件仍留在原 builder。

运行时按六个共享物理材质合批。只拥有合并后的 geometry 与材质 clone，贴图从 GLTF loader 缓存借用，卸载不释放借用资源。玻璃／灯／新实时光／新轮询均未加入；静态夜间补光沿用原 fixture 采样。

原生编辑源为米制 Three Y-up 约定，Blender 中 Z-up 存储。三个顶层导出根均为 identity transform：`InspectionBench`、`UtilityBench`、`ControlPedestal`。后三个高度变体是各自家族内的子根。运行时选择正确子根，绝不同时绘制互相重叠的两个变体。

材质：原创建模；512² 确定性 brushed-metal normal／roughness、coating roughness，克制的工艺方向变化；已交付 crate 中的 CC0 Coated Pine 派生贴图复用，不再下载，完整来源和派生哈希见 `tools/world/ibd-crate-craft/textures/sources.json`。不把程序噪声称为扫描材质，不用均匀污渍替代构造。

验证分层：focused geometry tests、原生／fresh GLB／clay 图、实际浏览器、用户视觉验收分别记录。截图是否完成以及最终统计由 `manifest.json` 与 handoff 记录，尚未完成的图或验收不在此提前宣称。
