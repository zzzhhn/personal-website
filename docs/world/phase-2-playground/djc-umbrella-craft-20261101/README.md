# Club 遮阳伞，本地精修候选

最终资产为 `umbrella.glb`，SHA-256 `acabe5cd136560ea73f6957904c5e1d7e1569a7b66e258d8db553d7d50aae592`，2,471,556 bytes。可编辑源为 `umbrella-editable.blend`，保留567个命名网格及独立ASSET、BASELINE、PRESENTATION集合。运行时派生为4个材质网格，42,268三角面、5张内嵌1024px贴图。未改src、public、碰撞、座位、灯光或相邻躺椅，未提交Git。

构造包含八片2.5 mm实体帆布、径向拼缝与双道缝线、12 mm连续包边、八根弯木骨、骨端布袋、滑套、短撑和贯穿铰销。主伞冠为低弧面，顶部由宽短盖帽收束。普通观察距离由曲率、边厚、接缝和骨架解释材质，微织物保持真实毫米尺度，没有通过放大噪声或强法线制造细节。

原点位于木杆底，Three Y-up挂载 `[74,1.4,47]` 和 `[74,1.4,63]`。GLB四个顶层节点均无位置、旋转或缩放偏移。最终局部边界为X/Z约±1.643 m，Y为0至2.82500005 m；檐边最低布边2.175 m。最大半径和高度均落在原伞1.65 m、2.825 m合同内。42,268三角面在原生、按材质合批及fresh import之间一致，零非有限坐标和退化三角面；567个原生实体全部闭合。

木材复用已许可的本地Poly Haven [wood_table_001](https://polyhaven.com/a/wood_table_001)，[CC0许可证](https://polyhaven.com/license)。照片色图和法线缩至1K后内嵌，原始文件只读，来源与散列见 `texture-sources.json`。木照片的baseColorFactor为白，无第二次tint；帆布颜色、粗糙度和法线由脚本确定性生成，不冒充扫描。帆布色图同样factor为白，避免导出时重复乘色。本资产没有AO、实时光、透射、透明或动画。

before只捕获冻结版本 `34754d2` 的原木杆与伞面，共2件、48三角面。保留原始顶点、三角顺序、split normals、颜色和粗糙度，没有混入躺椅或重造一个刻意简陋的旧模型。源码散列见 `baseline-source-hashes.json`，捕获数据见 `baseline-captured.json`。before是同灯光的真实源码离线重现，不能称为生产网页截图。

已实际打开最终 `umbrella-before.png`、`umbrella-after.png`、`umbrella-close-fresh-glb.png`、`umbrella-top-fresh-glb.png` 和 `umbrella-clay.png`。before／after／clay采用同一灯光、正交相机、曝光和1280×1100输出；clay直接来自最终GLB重新导入。近景和顶面图也来自最终GLB在空场景的fresh import。相机、棚灯与渲染设置见manifest和脚本，无景深。曾发现骨端布袋由于水平盒与斜布面相交而穿出顶面，最终按布面切线与法线放置，实际重渲确认顶面亮块消失；袋与骨端连接留在背面。

运行命令见工具目录README。每次Blender作业先运行resource preflight，以atomic FILE独占 `/tmp/bobby-world-phase2-heavy.lock`，限制CPU4线程、600秒；磁盘低于2 GiB或memory pressure达到4立即止步。所有重任务现已结束，Blender退出、锁释放。未测可靠内存峰值，抽样RSS不作为峰值。

主线仍需验证实际网页的日夜响应、摄像机视距、两实例共享成本及碰撞兼容。离线审图和导出检查已完成，不等于网页性能通过或用户视觉接受。运行时可按约定复制为 `/assets/world/club/umbrella/umbrella-v1.glb`；本任务未自行复制public或启动浏览器。
