# 意图过山车场景性能与材质基线

2026-11-04。源码以 release Git 对象 `7280675` 为准。范围是车站、轨道与支架、工位、列车和过山车植被。下文的当前成本来自源码结构，未采当前帧耗、GPU 时间或显存。

| 消费入口 | 当前绑定与生命周期 | 制作边界 |
| --- | --- | --- |
| `WorldAttractions → WorldIntentCoaster → createCoasterStructure` | 模块 lazy，但远处仍挂载。距场景边界 24 m 内或乘坐时选择近档，设备、工位、标牌和乘坐用碰撞随激活挂载。静态 steel 和 glow 各一合批；前者投收阴影，后者为独立 Basic 发光批次。 | 轨道支架线在结构生成处提交部件。普通/远档都核对，不在 JSX 为每根支架加网格。保持 track、relief、collider 与各自 LOD 的一致性。 |
| `CoasterBatch.add/finish → WorldIntentSurface` | 输入转非索引，删 `uv`，按参数重写顶点色，再做 `nightRadiance` 烘焙和 cliff 调色。已有 normal 随几何保留及变换。角色为整批非归一化 Uint8；有标记的批次给其余部件填 0。合并后释放零件。 | 不能把 GLB 的贴图、原色或 PBR 参数交给这个 Builder 后期待自动保留。新增 UV 或属性须定义全批合并契约，含无标记零值、近远档和 worker round-trip。 |
| `WorldIntentSurface` 与 craft | 普通程序只加共享 night uniform；craft 程序使用角色、位置、normal 计算颜色、粗糙度和金属度，当前不读取 normal map。craft 对两处主批次生效（steel、workshop body）。角色 0 保留现有色和 PBR 常量，仍有 varying 与分支成本。独立 glow 维持原材质。roller 夜间以原烘焙反推入射量再乘钢材漫反射。 | 在共享接口确认角色编号、坐标、shader key 与夜光语义。当前 craft 无条件覆盖 roughnessFactor/metalnessFactor，新增贴图时须显式组合；避免让深色或零色 roller 直接进入未保护的 bakedPigment 除法。 |
| `CoasterStructureCache / buildCoasterInWorker` | 每个挂载实例初档同步 build，首次缺档启动 worker。以 near 布尔值去重 pending，最多保留两档 CPU 属性。转移 TypedArray 和物理数据，主线程 hydrate。切档 dispose 旧几何 GPU 对象，重访重传；卸载清缓存并 abort，worker 成败或 15 s 超时后 terminate。失败时保留已显示结构和其匹配碰撞。 | 新属性也增加初档主线程 build、两档 CPU 驻留和重传成本。不要加每次靠近都重新生成的路径。 |
| `WorldCoasterVegetation → mergeCoasterPlantGeometry` | ST1/ST2 与街树复用 loader key，另读 G19。合并自有副本，烘平材质颜色，只保留 position/normal/color/风属性；材质统一粗糙 .93，贴图和 UV 不进入消费。五个实例批次，预算 48 树、近树最多 8、可见灌木最多 24。0.1 s 选档，视图不变跳过，组签名不变不上传。卸载释放私有实例、几何和材质，保留 loader 缓存所有权。 | 植物和风路径独立，勿为场景材质制作重设街树缓存或全局风。 |
| `CoasterTrain / WorldIntentWorkshop / IntentMovingLight` | 三车共享一份几何但分别绘制，跟乘坐姿态和停车碰撞配合；列车标为动态阴影，位置只在行程参数变化时写。工位 body/glow 分开，7 杆合为一实例批次，状态变化才上传。六台机各有活动输出、胶囊另挂；即使闲置，输出回调仍反复写可见性与变换，胶囊和工位灯也重复赋相同值。已有两盏车站/随行灯按夜间和姿态变化更新，工位一盏，均不投影。 | 列车改外观时保留座位、可见性、活动阴影和停站碰撞。工位保留正在处理和完成件。不要复制灯、回调或把运动件并入静态批。 |
| `WorldIntentSigns / WorldWorkshopSigns` | 分别维护 1024×384 和 1024² CanvasTexture，状态变化替换 atlas，effect 释放旧 atlas 和卸载几何。牌面独立保留 UV。工位订阅整个 workshop store，但 atlas 重建依赖 phase/task/progress/notice/lang。 | 标牌消费走原 atlas，不经删 UV 的静态 Builder。新纹理需写清 loader 所有权及地图暂停后的到达刷新。 |

制作前优先约定一张角色与属性表，由主线统一编号。保留有角色零值的两档合批。需要 UV 或贴图的部件先证明生产入口会消费，随后决定扩现有批次还是给明确可见、需要独立控制的部件单独划批，避免重复绘制同一几何。程序材质新增噪声和导数时先限定角色范围，再看近处覆盖及远距采样。无需为当前制作预先重构实例或灯光。如果工位更新成为实测热点，先让闲置输出按状态签名短路，保持现有动画与上传边界。

旧实测仅作取证参考。仓库 `docs/world/phase-2-playground/overhaul-20261028/facility-arrival-worker-near-fixed.json` 的旧到访窗口记录 1,807 帧、约 31.27 s，p50 16.7 ms、p95 17.3 ms、最大 325.4 ms，包含场景进入阶段。它早于当前提交，测的是帧间隔。现有 cache/transfer 测试可用于核对去重、取消与传输契约，不能代替当前场景开销测量。

最终建议一轮同构建条件的 A/B：分别留下普通站内走近、列车固定路段、单工位执行的短窗口，以及一次冷近档交接的单独读数。固定相机/行程、画质、DPR、可见状态、昼夜和加载完成；记录 commit、路线与姿态、ready/失败数、calls/triangles（注明是否含阴影）、几何和纹理数量、近远档及实例数量/矩阵上传、worker cold build/hydrate/切档及两档 attributeBytes。帧时保留 p50/p95/max 和异常时的事件；若没有 GPU timer，明确只报告帧间隔和提交计数。用同一夜间观察确认车灯、车站及工位原发光，以一组近远观察确认纹理/法线确实进入实际 draw。
