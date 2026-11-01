# IBD 运输箱外壳与盖

交付：`crate.glb`、`crate-editable.blend`、`manifest.json`。GLB SHA256：`a01de057e34cc1788684d0874b5da50682ab9fdfeae2f794a5140411b207723e`，4,161,428 bytes。

实际生产基线固定为 `34754d2` 的 `buildIbdPackShell` 与 `buildIbdLid`，源文件和哈希保存在 `tools/world/ibd-crate-craft/`。before 是实际 builder 输出的同相机离线重渲，不是网页截图。

| 接口 | 最终结果 |
| --- | --- |
| 顶级组 | `Shell`、`Lid`，均 identity，无外层容器 |
| 单位与朝向 | Three.js Y-up、米，正面 +Z；原点与旧 geometry 一致 |
| 铰链 | Lid 不烘入位移，运行时仍挂 `[0,1.08,-1.25]`，X 角 `0..-2` |
| Shell 范围 | `[-1.5,-1.01,-1.35] .. [1.5,1.045,1.35]` |
| Lid 本地范围 | `[-1.41,-.06,0] .. [1.41,.085,2.5]` |
| 几何 | Shell 21,068 tris，Lid 2,412 tris，总 23,480；零非有限顶点与退化三角形 |
| 材质与批次 | 8 个共享材质，Shell 7 / Lid 4，共 11 primitives |
| 图像 | 3 张 1024×512 松木 PBR，512×512 切端，1024×1024 AO；全部嵌入 GLB |
| 兼容 | 普通 indexed GLB，无 Draco、传输材质、灯、相机或独立交互件 |

保留 M8/4 原线划标签、四槽八托垫、原 stowed hoist stub、绑带。样品、卡尺、presenter tray、rigMast、rigBoom、rigTether 均由原交互代码继续提供，不包含在此 GLB 中。内部净空、承重面和碰撞代理未修改。

木箱改为真正分板与框角连接、可辨木纹和切端，底部保留三根承重托和原底板平面，脚轮区分橡胶胎、凹轮毂、叉架、轴与六角轴帽。主木纹来自 [Poly Haven Coated Pine](https://polyhaven.com/a/coated_pine)，[CC0](https://polyhaven.com/license)，作者 Charlotte Baglioni 与 Rico Cilliers。保留自然纹理并调为轻木、哑光包装木响应，不冒称原木扫描。确切源 URL、哈希与衍生规则在 `tools/world/ibd-crate-craft/textures/sources.json`。

实际审图修正了三类问题：程序切端的重复靶心、框角和轴端完全重合面的纯黑小块、AO atlas 太稀疏造成的碎线。框角现在为真实搭接，贯穿轴端藏在叉架内，外帽独占可见端面。150 个原生组件的诊断显示体积符号为正、无非流形边，黑块射线落在距离完全相等的两个面上，修的是几何连接而非灯光。

AO 使用原生连通拓扑独立 UV1，零 margin projection 后显式 3px packing，占用 56.72%，距离 .055m、64 samples、Only Local。暴露盖板中心 6 个样本 mean=1/std=0。最终不为 rubber 挂烘焙 AO，避免一条细小胎面 UV 边线，橡胶原 PBR 与实时阴影保留。AO-only 最终图的木面与胎面均已实际读图。

重点审阅图：`crate-before.png` / `crate-after.png`，同灯光夜景对照 `crate-before-night.png` / `crate-after-night.png`，`crate-clay.png`、`crate-open-native.png`、`crate-fresh-closed.png`、`crate-fresh-close.png`、`crate-fresh-open.png`、`crate-fresh-night.png`、`crate-ao-only-fresh.png`。native 与 fresh 开盖图均使用生产 X=-2；fresh importer 根组先设 XYZ 模式。独立 open 相机扩大画幅以显示完整盖子。

可复现命令见 `manifest.json.commands`。`run.py` 自动执行资源检查、原子 FILE 锁、3 线程 Blender，并在 finish 后补全 manifest；磁盘低于 2GiB 或 memory pressure≥4 时不启动新的重负载。可编辑 `.blend` 打开时显示闭合的原生分件，导出的 runtime 根组保持 identity。

离线原生/fresh import 读图和接口几何验证已完成。网页交互、网页日夜观感、实测性能和最终用户视觉接受属于主会话的独立验证层，不能从这些离线图片推断。
