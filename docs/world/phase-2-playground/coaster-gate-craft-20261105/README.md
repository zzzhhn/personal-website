# 入口门锁与门头：独立工艺资产候选

2026-11-05。范围对应场景清单 13、14、15 和 40 的门头实体牌框。以冻结 HEAD `b75c474f73ffa186e7bbc5522e4656dcbbedf9c3` 的物理、交互与位置为合同，只制作新的独立资产和 runtime consumer，没有修改现有总装、状态、碰撞、共享材质或 review 配置。旧的认可源文件及证据保持原样。

## 实际参考与制作选择

已阅读 `blender-material-craft`、其 `coaster-car-benchmark`、构造/材质和 runtime 参考，以及用户指定 `integrate-design`。直接检查了两张已有实际引擎图片，没有新开 GUI viewer 或浏览器：

- `../coaster-car-astra-pilot-20261104/after-ordinary-day.png`：可迁移的是壳体厚度、圆润但有结构的型面、独立加工五金和涂层响应；不是把每件物品都做成车壳。
- `../coaster-chest-transfer-20261104/after-day.png`：可迁移的是连续外壳、凹进装配槽、软硬材料和宽窄边缘的层次；保留灰白建筑、蓝灰钢构和铜色接点。

| 总成 | 支承与构造 | 普通操作距离应读取的变化 | 处理 |
| --- | --- | --- | --- |
| 门柱 | 钢芯承托矿物分块面板，底座与压顶独立，铰链有固定承压座 | 真实面板厚度、回边与板缝；实体基脚/压顶，灯条有安装槽 | 几何与独立矿物/涂装材质 |
| 门楣与字牌框 | 箱梁、上部防水压顶和下部折边；四根实体铜色框条围绕原动态 atlas | 门头有完整深度，字牌嵌进框内，端盒有收口 | 几何；不新增文字、牌面或灯光 |
| 单门叶 | 折边底框、可替换下部嵌板、上部开敞管框、斜撑、轴承铰链与中央钥匙孔面板 | 门体从平板变为有承托关系的装配件，开门保留原机构 | 四类 PBR 材料批，所有部件同一原门轴 |
| 钥匙 | 扁平锻造闭合环、收肩、实心柄、铣槽及切削齿 | 可拿取的完整钥匙形体，环内真实开口，合金和切削面区分 | 两类 PBR 材料批；保留原拾取根 |

不是靠逐处添加螺栓或增加说明字牌做差异。两张 256² 非彩色粗糙度图为确定性自制图，不是扫描素材。没有透明、透射、新实时灯、实时反射捕获、计时器或轮询。

## 根、坐标和运行接口

Blender 原生米制、Z 向上；脚本设计输入及 GLB 都是 +X 横向、+Y 向上、+Z 朝玩家，只在导入/导出转换一次。三个可见根与独立投影根都是 identity，模型子网格已应用原点与变换：

| GLB 根 | 调用方放置 | 必须保持的合同 |
| --- | --- | --- |
| `GateStatic` | 外包 `<group position={coasterWorld([0,0,COASTER_GATE_Z])}>` | `gateZ=56`，柱心 ±5.8，柱脚内侧 ±5.0，门头原范围；原 atlas 面 `[0,6.4,gateZ+1.03]`、8.2×.72 原样 |
| `GateLeaf` | 置于每个原 `RigidBody` 内，外包 `<group scale={[-leaf.side,1,1]}>` | 单叶本地 +X 延伸，原 hinge±5、每叶 collider half `[2.5,1.6,.18]`、原角参数 -1.45；现有门扇运动由主保持 |
| `GateKey` | 用 group 继承旧钥匙 mesh 的 position 和 rotation | 箱内 `[-.2,1.4,.25]`、rotation `[-.25,0,.25]`，门侧 `coasterWorld([5.3,1.65,gateZ+.5])`；原显隐和交互不变 |
| `GateLeafShadow` | 仅由 leaf consumer 派生 position/index 的非写入投影载体 | 与可见门叶相同原点、完整外包络、原铰链父根及镜像；不直接挂载此源根，不用于物理 |

独立组件 `src/components/world/attractions/WorldCoasterGateCraft.tsx` 的 API：

```tsx
<WorldCoasterGateCraft part="static" />
<WorldCoasterGateCraft part="leaf" />
<WorldCoasterGateCraft part="key" />
```

组件只绘制对应 named root，**自己不放世界坐标、不读 gate 状态、不注册交互、不拥有物理或铰链**。加载应由主使用现有 Suspense/fallback；没有主动 preload。整个 GLB 同用一个 loader URL，可见几何/纹理属于 loader cache；自有 PBR clone、leaf 投影副本的几何及 depth 材质由 retain/release 在最终卸载后释放，StrictMode effect replay 可以重获，不会复用已 dispose 材质。材质不经 `CoasterBatch` 或旧 `WorldIntentSurface` 重写，保留 UV/法线/PBR/clearcoat，复用现有 renderer-scoped PMREM。日夜强度沿认可资产的 .85→.50，`useFrame` 仅在 `night.value` 变化时写值，没有每帧 React 更新或分配。

主串行接线时需要：

1. 仅替换旧 gate leaf 的视觉 mesh，保留同一个 rigid body、collider、ref、kinematic 回调与镜像语义。
2. 新 `GateStatic` 与旧门柱/门楣钢体不可双画。主在总装中精确停用旧 static 门头 steel 分支，同时保留它们原有 colliders 和已有 cyan glow，新的灯槽为原 glow 留位。不要以隐藏整个 `structure.steel` 来换一个门头。
3. 原 `WorldIntentSigns` 的动态 atlas mesh 保留，新的实体框留出其精确矩形。牌面内容、UV 和状态更新归原组件。
4. 宝箱与门侧旧钥匙两处视觉一并替换，外包 group 保留原 transforms；不更改 `keyTaken/gateOpen` 或 pickup action。
5. 由主做实际引擎日夜、开门全程、通道/镜头、拿钥匙/开门及成本验证。此候选不自行进入 4341。

## 可复现交付与成本

`tools/world/coaster-gate-craft-20261105/build.py` 自包含制作具名可编辑部件，先保存原生文件，再为 runtime 副本按每个根合并，保留各物理材质批。只需 Blender 及其内置 NumPy；无外部资源或许可证依赖。

```sh
/usr/bin/python3 /Users/a22309/.local/bin/codex-resource-preflight.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python-exit-code 1 --python tools/world/coaster-gate-craft-20261105/build.py
python3 tools/world/coaster-gate-craft-20261105/verify.py
node tools/world/coaster-gate-craft-20261105/check-source.mjs
```

Blender 5.1.2 只在主协调授予唯一重任务槽后运行，命令由外层 150 秒超时约束。没有做任何渲染。最终无渲染导出与 `verify.py` 已通过；重任务槽已释放。成本来自 `export-check.json` 的实际 GLB，原生源统计与哈希在 `manifest.json`：

| 根 / 场景组合 | 具名可编辑部件 | 三角面 | 材质图元 |
| --- | ---: | ---: | ---: |
| GateStatic | 72 | 13,536 | 5 |
| GateLeaf 单叶 | 60 | 10,608 | 4 |
| GateKey | 8 | 1,700 | 2 |
| 三个可见根总计 | 140 | 25,844 | 11 |
| GateLeafShadow | 24 | 448 | 1 |
| GLB 四根总计 | 164 | 26,292 | 12 |
| 场景一静态、双门叶、一可见钥匙，不含投影副本 | 200 个可见源件实例 | 36,452 | 15 |
| 同组合主通道，含两个非写入投影副本 | 上述可见件及双投影根 | 37,348 | 17 |

六种物理材质，两张内嵌 256² 粗糙度图，无图像副本。两张原始 RGBA8 GPU 基础数据合计约 .5 MiB，含完整 mip 理论约 .67 MiB；这不是实测显存。当前 GLB 为 1,040,880 字节，原生 blend 为 306,404 字节；增加投影根使 GLB 比原首版增加 31,064 字节，没有新增图像。每个门叶实例单独绘制，不把“一个 GLB”当成“一次 draw”；表中图元也不包含 shadow pass 或其它全场成本。

当前 GLB SHA256：`26d02b6955ea8adf30fb2b996cb7ccfc7823685ca52f9980984d732635f6e989`。当前 blend SHA256：`5acbbd9c8e68906636577b04d1646adf68626a7e4d0bb677d7d484b88c5f6837`。旧 GLB 全文件 SHA 为 `6e1fcf85a015676b0e05a2102fd26d66b6928dae3fd0a715c8a9cc0f5e673c08`；增加 root 后全文件自然改变，但三个可见根的节点变换、逐通道原始数组、索引、PBR、采样和图像字节签名前后完全相同，均为 `fa1f745ff4c4087f42a154d88df49b51e76c61f4e4a2b1fe42eb2dee26542eac`。逐项基线在 `visible-before-shadow.json`，对比结果在 `export-check.json.visibleInvariance`。

## 独立门叶投影修正

早期投影 candidate 完整复制每叶 10,608 面，在主通道额外提交同样的面，不能称为低复杂度投影。当前新增的 `GateLeafShadow` 由真实框杆独立制作：十根栏杆、外框、下部实体嵌板、斜撑、两个铰轴、衬板和钥匙孔外轮廓。上方栏间没有整块平板或凸包，保留原开口。主要外框保留单段倒角，其余构件简化截面；完整外包络与原门叶在 1e-5m 内相同。

| 每叶投影载体 | 旧完整复制 | 当前独立根 |
| --- | ---: | ---: |
| 三角面 | 10,608 | 448 |
| position 缓冲字节 | 99,456 | 8,208 |
| index 缓冲字节 | 63,648 | 2,688 |
| 运行副本合计字节 | 163,104 | 10,896 |
| 主通道额外 draw | 1 | 1 |
| 每个覆盖叶片的阴影视图 draw | 1 | 1 |

双叶额外主通道成本降为 896 面、21,792 字节及 2 次 draw，较完整复制候选减少 20,320 面、304,416 字节；阴影提交数保持每叶每视图一次。与最初四批可见面各自投影相比，每叶每个实际覆盖它的阴影视图少三次 draw。这里是 CPU 几何/提交清单，不是全场实测 GPU 时间或 FPS 收益。

visible PBR 四批均不投影，carrier 的 `DoubleSide/shadowSide` 保留前后两侧，跟随原铰链父根和 `shadowDynamic` 机制。运行副本只含 position/index，GLB 的 proxy 源数据保持借用。没有改 static/key、交互或 physics。该修正的实际引擎闭合/半开/全开投影与相邻帧窗口仍由主协调验证。

导出阶段发现并在 builder 修复两项问题：薄嵌板的 bevel 半径被 Blender clamp 到半厚度时产生重合圈和零面积面，现统一限制到最薄边 .42 倍；Blender 默认双面材质现显式启用 backface culling。最终文件重新导出并通过全部 GLB 检查，没有对 GLB 做隐式修网格。

## 验证边界

轻量源接口检查覆盖三个 root 的 builder/adapter 对应、TS 语法、PBR loader/环境/资源生命周期路径、无物理/状态/计时器，以及先保存原生再做 runtime 合并。它不验证外观。

GLB 检查器覆盖有限顶点/单位法线/UV/索引/零面积面、四个 root identity、材质/内嵌图、门扇旧尺寸包络、十米静态通道、atlas 牌面留空、简化投影低于 1,200 面、完整外包络和三可见根前后哈希一致，均通过。实际组件 CPU 测试 3/3，覆盖 9 个栏间开口两侧射线、10 根栏杆投影、简化根完整索引/位置、左右镜像闭/中间/全开世界位置、PBR/借用资源及 StrictMode 最终单次释放。它没有做完整 swept collision、浏览器执行、导出重导入渲染或性能采样。主负责真实引擎验证，不能把源码或导出成功称为视觉提升已通过。
