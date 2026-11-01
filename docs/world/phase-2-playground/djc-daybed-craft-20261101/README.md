# Club 圆形池畔日床，本地精修候选

交付 `daybed-editable.blend`、`daybed-v1.glb`、真实源码的 `daybed-before.png`、同机位 `daybed-after.png`、`daybed-close-fresh-glb.png`、`daybed-clay.png`。最终四张图均已实际打开检查。GLB 和 Blender 均内嵌纹理；打开模型不依赖原始贴图路径。尚未在本任务中进行浏览器性能、人物接触或用户审美验收。

原模型来自精修前冻结的 release 源码，通过 esbuild stdin 在 `add` 中捕获第一张 x62,z42 日床，从 `The timber rim occupies` 注释起至该床灯顶结束，共 24 个原始构件、1,556 三角面。没有手工重造 before，没有混入坡道或世界其他物件。原始顶点、三角形顺序、split normals、颜色与原材质粗糙度均保留。冻结几何源码 SHA-256 为 `6f7b388924a9b163d6b45f36427dc597a0891d9e63de33289a175ce274b22ecc`；其余源散列见 `manifest.json` 和工具目录的 `baseline-source-hashes.json`。这是一份真实源码在同一离线灯光下的对比，不是生产浏览器截图。

| 构造 | 本轮落实 |
| --- | --- |
| 石鼓 | 连续承重芯、三层错缝弧形石块、细孔颜色/法线/粗糙度；不添加巨大随机破损 |
| 木架 | 28 段弧形木圈、19 根独立承托板、后背竖撑和横撑、侧盘外置双支撑与上部悬臂 |
| 软包 | 真实闭合的环形侧围、双道包边、锁式缝线、后侧拉链；五只双面充气式缝制靠枕，有底角受力褶和轻微上沿塌陷 |
| 材质 | 木面/外侧/端面按制作方向展开；共享细密织造颜色、粗糙度与法线；不透明灯芯，无透射材质 |

原点保持世界 `[62,1.5,42]`，Blender 转换为 `(x-62,42-z,y-1.5)`，朝向世界负 Z，即 Blender 正 Y。导出只执行一次 glTF Y-up 转换。外半径保持 1.65 m；石基座世界 y0.5 至1.38，木圈1.38至1.5，软垫半径1.46、下表面1.525、上表面1.755。垫下新增承托板填实原有25 mm支撑间隔。最大高度为世界 y2.21143，低于原模型2.215；无新增大物件突出原圆形半径。中央1.6 m接近方向和两侧坐位未改变，本任务未改碰撞或源码布局。

| 最终统计 | 数值 |
| --- | --- |
| 原生可编辑部件 | 804 个命名网格 |
| 三角面 | 113,664，原生/导出/fresh import 一致 |
| GLB 批次 | 8 个网格、8 种物理材质 |
| 纹理 | 8 张：2K 木色/木法线，2K 共享织物颜色/粗糙度/法线，1K 石材颜色/粗糙度/法线 |
| GLB 包大小 | 9,875,476 bytes，约9.42 MiB |
| 座面最大偏差 | 3.624e-7 m，两个200 × 200 mm坐位区域共50条向下射线 |
| 几何异常 | 原生全部体积闭合；原生/fresh import 均零退化三角面、零非有限坐标 |

GLB 只包含按材质合并的视觉网格，不包含相机、灯光、地板或基线。原生文件保留 `BASELINE`、`ASSET`、`PRESENTATION` 三个集合，未合并原生部件。GLB供主线以实例复用几何和材质；本任务没有修改 `src`、`public`、服务、Git 或 Skill。

实际审图修复了三类导出问题：before 导入器曾因 bmesh 重排后误用原法线顺序出现黑斑，最终改为逐字保留原始三角顺序；旧 `MixRGB` 在 Blender 5.1 glTF 中丢失布色，最终改为导出器识别的 `ShaderNodeMix` RGBA Multiply；合并时不同 UV 层名曾导致部分部件采错通道，最终统一每件唯一 `UVMap` 后再合并。最终 fresh import 图已确认青绿布色、织造、木圈/侧盘/灯顶木纹正常。JSON检查分别核对四种准确 `baseColorFactor`、共享图像+采样器+UV语义、所有纹理UV0、材质库存、边界和面数；不以 texture entry 编号必须一致代替真正共享检查。

`daybed-close-fresh-glb.png` 和 clay 均直接来自最终 GLB 在空场景重新导入后的模型。before/after/clay 使用相同三盏大面积灯、相机、AgX Medium High Contrast、曝光0、1440 × 1080。总览正交相机位置 `(4.2,5.8,3.3)`、目标 `(-.02,0,-.12)`、尺度4.38；近景位置 `(-3.3,2.8,1.8)`、目标 `(-.85,-.20,.20)`、尺度1.95。Cycles CPU4线程，总览/对比/clay24采样，近景32采样，无景深。离线图展示了整个石基座，实际池水会遮住下部石材。

木纹使用已授权本地 Poly Haven `wood_table_001`，来源与原始散列记录于 `texture-sources.json`，许可证为 [CC0](https://polyhaven.com/license)，[资产来源](https://polyhaven.com/a/wood_table_001)。只读使用原始贴图，在内存中派生2K版本；没有改写源文件。织物和石材贴图由本脚本确定性生成，未冒充摄影扫描。实际执行了 Skill 的 `box`、`beam`、`closed_lathe` helpers，并在应用修改器后验证源体积。

仍待主线核对：游戏中的日夜材质响应、织造纹理过滤、角色坐姿和接近坡道、四床复用后的真实成本。木材端面按截面展开，未另取摄影端纹；布面极近处仍有细微采样纹。本轮是可集成的本地候选，未声称用户视觉批准或性能提升。

在 release 根目录重建：

```sh
node tools/world/djc-daybed-craft/capture-baseline.mjs
/usr/bin/python3 tools/world/djc-daybed-craft/run.py
/usr/bin/python3 tools/world/djc-daybed-craft/run.py --finish
```

仅复核已有最终GLB与manifest、保留现有图像：

```sh
/usr/bin/python3 tools/world/djc-daybed-craft/run.py --verify-only
```

包装脚本在每次 Blender 作业前执行资源预检，并独占 `/tmp/bobby-world-phase2-heavy.lock`；工作已结束并释放该锁。最终模型、图、输入与脚本散列在 `manifest.json`，所有构建日志留在本目录。
