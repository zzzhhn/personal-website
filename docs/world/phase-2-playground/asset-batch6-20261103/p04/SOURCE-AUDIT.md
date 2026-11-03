# P04 栈道灯柱：轻量源审

对照主线 `395cbbfaa2aea60877ad08d9c1590dbe1cd3a0ac`（美术 `67b5b49`）。P04 生成器、材质、灯光、消费者和初始化涉及的九份生产源码，与本隔离树逐字节相同。仅复用已审的 P02/P03 普通、支承侧和夜景图；未打开 4341，也没有新的 P04 专项截图或视觉通过结论。

已有图里，灯柱的细锥杆、帽形灯头、基脚和夜间暖光池已可读。近处可见的杆身、深色套环和灯帽，表面大多仍是平整色块，缺少木材与涂层件的质感区分。没有证据支持重做帽形、扩大轮廓或增加灯光。保留现有形体、石基、暖色透镜与照明，只优先验证杆身和罩、套环、检修盖之间的材质分工。

## 实际消费链与缺口

1. `WorldParkLamp.ts` 调用 `WorldStreetAssets.lampGeometry({height:2.6, arm:0, pole:S.woodMid, base:S.woodDark, cyanRing:false})`。`finishStreetFacility` 对 `arm===0` 或远档直接返回原 Builder，P04 未消费 G10 的厚翻边、独立反射碟和卡件；也没有 P04 GLB 入口。不可解除共享分支的无悬臂保护，否则会同时动 G11。
2. 近档 `base/shaft/hatch/cap/head`，远档 `base/shaft/head`。原几何已有锥杆、套环、检修盖、罩口和透镜的实际接合，顶部原 cap 插入灯罩内，罩口与透镜的边缘相接。优先用材质区分既有连接；如未来实际普通机位仍看不清罩口，再单独评估很小的罩口回边，当前不建议加几何。
3. Builder 的表面槽值全为 0、UV 全为 0；`parkAttributes()` 转成非索引几何，只从 `aMat.z==1` 拷出暖色 `aEmit=[.35,2.4,1]`，然后移除 `aMat/aSuv`。最终 `Knockables` 收到的只有 position/normal/color/aEmit，克隆并加 `aInstFade`，保留 `parkMaterial` 的共享 shader hook。灯具没有实际进入共享木色、法线、粗糙度或按槽环境反射路径。仅去掉两个 delete 不会产生表面响应，必须有本地的语义槽和真实 UV。

## 候选边界，等安排后再验证

- 首选仅改 `src/components/world/WorldParkLamp.ts`。在 P04 自己的适配内，沿真实圆杆轴向、周向展开杆身木纹（逐三角处理 UV 接缝），帽壳和既有套环、检修盖试用克制的涂层响应。现有色相和轮廓先保持，透镜和石脚保持原响应。材质归类按面和构造件：`shaft` 同时含深色套环，`head` 同时含暖透镜，远档顶 cap 还并在 `shaft` 内，不能整段按材质签名或 part 名涂一色。复用共享三张木图和 PMREM，不加灯、纹理、材质实例、draw 或逐帧任务。若两档均补齐两个 Float32 顶点通道，原模板对新增 65,664 B；不把这个数当作实际 GPU 内存或帧耗。
- 冻结：9 个 home/yaw（高度 1.14 m），近 766 / 远 146 tri，原边界近顶 2.79 / 远顶 2.77 m；四个原 hull 输入 340/144/84/256 点，总质量 45 kg、每 hull 11.25 kg、摩擦 .8、恢复系数 .08。现有首矩阵按真实刚体对象只初始化一次并保留父空间，60 m LOD、休眠、30 秒复位、1.2 秒 dither 不动。P02/P03、G10/G11、园区布局均保持。
- 冻结夜间链：仅透镜发光，近/远 48/18 个发光三角面；`ParkClock → parkNight → parkMaterial`，以及原半径 1.7 m、强度 `parkNight*.4` 的合批灯池与 `WorldEnvironment` 三个原区域补光。灯池留在原 home，不改为跟随刚体，不借调光验证材质。未来比较应只切 P04 局部基线，不能关掉全局 facility hook。
- 后续只建议一个完整灯具的步行机位，日景同条件对照，必要夜景复核；先从 `lamp-1-r-0`（约 `[62.397,1.14,-37.064]`，yaw `1.842`，检修盖朝步道）取样，画面保留脚、杆、帽及步道尺度。若普通视距下区分仍不清楚，保留原版，不凭特写、材质参数或源码通过选入。
- 预计 owned：`WorldParkLamp.ts`、`tools/world/facility-craft/batch6/p04/` 下必要的源检查/可编辑归档，以及本 `p04/` 审阅目录；确需网页对照时可有独立任务 QA 配置。共享 `WorldStreetAssets`、`WorldStreetFacilityCraft`、`WorldParkKit`、`WorldFacilitySurface`、`WorldParkWalk`、`WorldEnvironment` 无需认领。当前只写本报告，没有生产改动。

当前只读 CPU 指纹（SHA-256，JSON 序列化的实际数组/列表）：placements `c5e8eb1b1a3d4de4e0afcf5e45cc9ce4133f71ae2f35f9b612f08ef416494f2d`；hulls `74e48bd9a1ce768e807f96c80735da723509120827d3585229b64e4fe07f888b`；近/远 aEmit `8787b16a85145548d14b9e589d7b61dabf63a7d67d539e974abc0c95f5fd8489` / `68a6a16869e587fdb485956971f73d3dc4d6ef342bbac70297bbf3b670f50910`。未开浏览器、构建、Blender 或申请重窗。

## 局部源码候选

生产改动集中在 `WorldParkLamp.ts`。根据原 Builder 部件范围和构造面的材质特征写入共享槽位。近档杆身与套环分开，远档杆身与同范围顶盖分开，灯罩与透镜分开。木纹 U 沿高度，V 绕杆一整次纹理周期。跨角度分支的三角形局部展开，重复顶点的 V 差为整数周期。

用 `node tools/world/facility-craft/batch6/p04/check.mjs` 复核。近档木材、涂层、石基、透镜分别为 48、614、56、48 个三角形，远档分别为 12、84、32、18 个。实际接缝均纳入检查，三角形周向跨度最大分别为 1/12、1/6 周期。位置、法线、颜色和发光数组逐值等于局部基线，布置和 hull 指纹匹配。CPU 调用现有 shader hook 后同时读到共享表面和暖光注入。该检查不涉及 GPU 编译。

两档模板新增 55,152 和 10,512 B 属性，合计 65,664 B。每档现有克隆再复制对应缓冲，增量合计约 131,328 B 的 CPU TypedArray 数据（模板加运行时克隆）。普通日夜视觉收益待串行窗口实测。使用 `?parkLampCraft=baseline` 可切回本地原始属性布局。
