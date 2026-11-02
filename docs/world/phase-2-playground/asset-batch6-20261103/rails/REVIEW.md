# 两族栏杆最终候选

**主协调已独立看过最终四张普通图并接受两组候选。** 海堤的涂漆管、镀锌套接与管下薄帽托有清晰构造分工；木构长向纹理、端头与横销改善可辨。停止扩族与加密，生产源冻结于`e6152bf227016f775e94376439c441e7e7631751`。这是下一集成候选，尚不等于用户审美接受或GPU无回归。

基线为本地4341此前已实装的`97c9546`。`railCraft=baseline`返回该基线原Builder；默认路径只包装本组实际静态／动态视觉工厂。第一轮海堤主要提亮，自退回后只修海堤，木构源未重做；`runtime-r1/`保留旧图和失败判断。最终证据在`runtime-r2/`，仅普通两对及各一张同机位必要夜景，共6张原始JPEG，均实际打开自查，没有裁剪、调色或合成。

普通配对均为1710×931、DPR1、FOV50、12:00、曝光1、Balanced、晴天；夜景为00:00，使用原共享night系数，没有新增灯或自发光。夜间山路本身仍很暗，本轮没有把材质检查写成夜间导航改善。

取证门不会仅靠经过3秒就ready：每次切机位／时间都重置稳定窗，要求当前相机位置与方向、当前／挂载模式匹配，3张共享贴图实际尺寸与CPU/GPU版本一致、加载结束、blend1且当前shadow.pending=false。每图记录完整机位／模式、实际稳定年龄、贴图UUID／CPU与GPU版本，以及6个生产模块SHA。最终6图均满足这些门。旧R1取证门可能沿用旧摘要的稳定年龄，因此只作返修历史，不用于最终接受。

## 几何与碰撞合同

| 范围 | 改变 | 保留／验证 |
| --- | --- | --- |
| 海堤近／远 | 从实际相邻placement矩阵派生约1.962963m跨度，替代2m可见梁；近景薄帽托／套接／底板 | 27跨位置、首／中／末接缝与端柱闭合、原完整代理positions／indices／hulls、LOD阈值／fade；无第二份53/27配置 |
| 木柱近景 | 横销y=.455→.535，穿两侧夹板与立柱，位于承托面下；沿Y木纹 | 原柱位置、包络和碰撞；实际坡梁轴线与销轴垂直，原销位悬空问题消除 |
| 木梁近景 | 沿X木纹、有限程序端纹；借用原木包，不称新照片扫描 | 梁长／根位置／坡度、原代理和动态接口；代表`rail-beam-5`仍4.26m、pitch约.0778358rad |
| 木构远景 | slot／制造UV与角点拆分 | 三角形位置／法线／颜色与原远景逐角点一致、三角数不变；buffer索引／顶点数量因解缝而改变 |

唯一新增共享接口为`bindStreetFacilityCollision(visual, original)`：集中原WeakMap／hulls语义，先规范化已绑定来源，禁止visual与归一化代理相同。新视觉与完整原代理是不同Builder，L0与L1均明确绑定，未用“只冻结hulls”代替原代理不变。既有finish复用后，全部旧族实际输出／代理与97c9546合同一致；重复绑定测试证明正常使用不形成代理链。

实际StreetStatic读取的L0代理positions／indices哈希与原始值一致。StreetKnock仅新增本组导入并包装木梁视觉工厂，去掉这两处后与97c9546逐字一致，保留原质量45kg、COM高度.085m、锁定、碰撞及30秒复位实现。**未做真人受推或全岛性能采样**，源／工厂合同不冒称真人玩法验证。

## 材质链与有限成本

运行链为实际factory→本组构造／负物理slot／制造UV→原Static或Knock→原StreetBatch／BatchedMesh→原共享StreetMaterial。真实BatchedMesh合并检查保留wood1、paint2、bare3及非零UV；浏览器收据确认3图已上传GPU，普通图实际显示沿轴纹理。圆柱UV在背部／下方解缝，锥顶与端面使用独立端面响应，避免轴点拉伸。端纹为程序色环。

共享Surface、StreetMaterial、WorldPark与原3张PNG保持97c9546原内容，借用既有环境缓存、贴图生命周期和night衰减；不新增runtime图片、材质实例、draw组或逐帧适配。native／portable是同源可编辑档案，游戏依旧使用Builder；不是用离线模型冒充已实装。详情见`NATIVE-EXPORT.md`。

| 有界观测 | 基线 | 候选 |
| --- | ---: | ---: |
| 海堤普通帧calls／textures | 148／90 | 148／90 |
| 木构普通帧calls／textures | 126／101 | 126／101 |
| 实际13种本组geometry的近景三角总数 | 3242 | 4938 |
| 同组远景三角总数 | 430 | 430 |
| 原始属性／索引源buffer字节 | 397884 | 1030656 |

近景增加1696tri，原始buffer增加632772B，包含为正确圆柱UV进行的角点拆分；未计批次复制或完整GPU分配。两对其它注册根摘要相同，world-street名义几何摘要正好增加1696tri。calls／textures相同只作为有界计数，不能推导FPS或GPU无回归。没有重复全岛成本或生命周期矩阵。

## 可直接运行的检查

```sh
node --test tools/world/facility-craft/batch6/rails/rails.test.mjs tools/world/facility-craft/batch6/bench-bin.test.mjs tools/world/facility-craft/batch6/surfaces.test.mjs tools/world/facility-craft/street/street.test.mjs
node tools/world/facility-craft/batch6/rails/verify_review.mjs
```

23项源／实际工厂检查及取证校验均通过。后者核对6图配对参数、完整ready门、生产源SHA、原共享图内容、native／portable哈希及fresh-import报告，共20个文件hash。原生重新导入海堤1060tri／木构916tri、包围盒偏差均0。旧bench／bin档案的逐字节源冻结属于其历史版本，本轮以新增绑定语义的旧族输出／完整代理回归为准，不改写旧档案接受范围。

清理：最终自有1395914343先Escape暂停后关闭，4350标签复查为空；核PID61770完整命令为本组Astro4350后SIGTERM，wrapper退出143／finally按token释锁。未设置viewport override，已通知Nature接窗。未操作用户4341、root回退目录，也未push／merge／部署。集成由主协调完成。完整路径见`OWNED-PATHS-FINAL.txt`。
