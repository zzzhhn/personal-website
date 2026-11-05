# 工坊夜景候选：轻量性能审阅

2026-11-05。输入为主 session 给定的同镜头窗口：v10为旧架构/旧工坊、新车/新箱，P50/P95 21.6/57.4ms、148 calls、797,496 triangles；v12全批为28.6/78.9ms、194 calls、998,747 triangles。相邻复测仍由主线程进行。以下只读当前调用链、Three本地源码和GLB的JSON头；没有打开浏览器、构建、Blender或执行场景生成/大审计。

## 1．门叶的投影载体仍完整复制高细节几何，既走主通道，也走动态投影

**后续修正，2026-11-05：** 下述完整复制问题已在独立候选中修复，尚未作本次真实引擎复测。新增 `GateLeafShadow` 为每叶 448 面，按门框、十根栏杆、斜撑与铰链独立制作，不用实心箱封住栏间；visible `GateLeaf` 仍为 10,608 面、四批 PBR。三个可见根的全部原始属性/索引、节点变换、材质和图像字节签名前后均为 `fa1f745ff4c4087f42a154d88df49b51e76c61f4e4a2b1fe42eb2dee26542eac`。source GLB 增加投影根后 SHA 为 `26d02b6955ea8adf30fb2b996cb7ccfc7823685ca52f9980984d732635f6e989`。

运行 carrier 仅复制 position/index，每叶 10,896 字节；双叶主通道额外 896 面、21,792 字节与 2 次 draw，较下述旧完整复制减少 20,320 面、304,416 字节。每叶每个实际覆盖的阴影视图依然一次 draw，不能把理论视图数当全场实测。静态 GLB 验证及实际组件 CPU 回归 3/3 通过，包含双面栏间开口、原外包络、镜像开闭与 StrictMode 资源释放；实际投影画面及性能由主协调复验。完整成本和证据见 [门锁修正记录](../coaster-gate-craft-20261105/README.md)。以下保留修正前诊断与其证据边界。

证据：`WorldCoasterGateCraft.tsx:41–71` 将 leaf 下所有可见 primitive 的完整 position/index 合并成 `GateLeafShadowCarrier`。它的材质关闭colorWrite/depthWrite，但没有关闭visible。当前 `WebGLRenderer.js:1956–1958` 仍把 material.visible 的 mesh 加入主渲染队列，不以colorWrite判断是否提交。

实际GLB头给出每叶4个材质图元、10,608面；两叶都入视锥时，两个非写入载体会在主通道额外提交21,216面和2次draw。门叶还在原RigidBody的 `shadowDynamic:true` 子树中，`WorldShadows.ts:250–255、374–375、680–684` 因而不把它们烘进静态chunk；`applySunPass:894–903` 对动态普通mesh按级联提交，只有显式 `shadowLodGeometry` 才切换，而这里没有该字段。各级联实际覆盖多少仍须读浏览器统计，不能把理论次数直接当作本窗实测。

最小修复：参照当前工坊已有的独立ShadowWorkshop，给门叶增加保持栏杆镂空、外框、铰轴和镜像开角的低复杂度独立投影根，替换载体的完整复制几何。可见10,608面及所有材质/UV保持原样。先在闭合、半开、全开同镜头检视投影，再单独复测门叶成本，不用实心凸包填掉栏杆空隙。

当前站房已是400面的独立投影，工坊已是2,324面；它们也有非写入主通道载体，但没有重复提交各自29,480/54,860面的高细节主体。工坊旧 `geometry.body` 只为接触/旧glow生成，JSX没有挂载它，未发现新旧工坊主体同时绘制。

## 2．站房远档有效，但园内测量几乎始终使用近档，局部距离没有参与

证据：`WorldIntentCoaster.tsx:28–36、61` 把 `renderedNear` 直接传给站房，它来自 `active || riding`。上层 `WorldAttractions.tsx:11–14` 的active覆盖整个园区bounds及外围24m。因此人在工坊、园区另一端或骑乘时，只要结构档已切换，站房都使用Near。当前 `coaster-station-craft-runtime.ts:52` 只是切换可见根，没有按站房距离筛选。

实际近/远根同为7批材质，三角面分别29,480与2,388。远档不是坏掉或未导出，而是现有触发条件过于粗；若远处站房仍入视锥，它保留27,092面可避免的近档几何。工坊静态8个材质批次合并覆盖整个工坊，且当前没有LOD；这一点也已在工坊README中明确，不能把其“合批”误当成局部裁剪或远景优化。

最小修复：先只把站房LOD从“园区active”中独立出来，复用既有位置订阅的布尔选择，不增加计时器/每帧React状态更新。阈值根据实际视距和普通距离对照确定，近景、登车状态继续用Near，接触/物理不随LOD改动，材质和纹理保持一致。这样先测试现成Far的收益，无须重做资产。工坊按家族分区裁剪会增加draw，不建议在没有其分项测量前盲目拆批。

## 3．零清漆因子的材质也带clearcoat扩展，导致无效的Physical类型升级

证据：三个实际GLB共有21个材质，全部带 `KHR_materials_clearcoat`；其中11个clearcoatFactor为0：站房4个、门包4个、工坊3个，包括矿物、钢、橡胶和哑光屋底。`GLTFLoader.js:898–902` 只要发现扩展，就选择MeshPhysicalMaterial；三个adapter再调用源材质clone，类型保留，`instanceof MeshStandardMaterial` 的检查也会接受其子类。

这确实是无实际涂层的类型升级，但不是11套额外clearcoat着色：`WebGLPrograms.js:141` 用factor>0控制USE_CLEARCOAT。Physical仍保留其PHYSICAL/IOR/specular路径；没有GPU分项测量，不能把此项当作P95上涨的主要原因，更不能据此削弱已经认可的真实涂装。

最小修复：只对clearcoatFactor=0、没有clearcoat贴图、且没有其它Physical高级特性的材料，在运行派生中剔除无效clearcoat扩展，或在clone适配时严格降回等价的MeshStandardMaterial。保留原源文件、所有基础PBR值、法线/粗糙度图、UV与环境响应；非零清漆的铜漆、蓝灰涂装与窗面不动。先对一包检查材质类型和同镜头像素，再测GPU/帧时间。这不减少材质分工，也不减少材质批次数。

以上三项分别定位了可避免的重复几何、LOD选择范围和无效材质类型；它们不能单独解释当前整窗的全部46 calls与201,251 triangles差值。最终归因仍应使用主 session 的相邻窗口和分包隔离结果；本审阅未修改任何实现。
