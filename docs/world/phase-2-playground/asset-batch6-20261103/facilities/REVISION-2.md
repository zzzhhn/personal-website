# Facilities R2：返修记录

状态：源码、native／portable 导出、18 张真实 WebGL 原图及收据均已完成并自查，主协调独立复看后允许冻结为集成候选。**两族尚未标记全面完成，也不是用户审美接受。** R1 原图／收据保留在 `runtime/`，其源与资产冻结于 `b59ee51eee5845a5d1e2f48d142cb8b359a49260`。R2 使用 `runtime-r2/` 与 `manifest-r2.json`。

主协调复看范围：ordinary 日夜4张、hut close 日夜2张、glass grazing／rear2张及 ordinary 正午基线2张。上一轮白板、夸张木纹、蓝漆云斑与夜间过亮阻断已解除。玻璃只称乳浊透明近似；室内大片素墙／窗等未作为本轮优化完成项。下一步交性能线只审这两族，并按现有队列开展下一小组轻量制作；重型窗口继续串行。

## 本轮修正

- 身份核对：`WorldStreetAssets.ts` 明确描述 frosted rear glass，三块大面使用 `S.glass`。R2 按磨砂玻璃处理，不改成白色围护板。
- 候车亭玻璃从 opaque batch 按三角面分离到一个独立透明 batch；12mm 闭合几何，原外框／踢脚梁／中梃位置保留，添加连续胶条和压边。首次网页近景中 alpha=.30 仍偏通透，已调为 alpha=.45、roughness=.46、FrontSide、depthWrite=false、不增加 scene transmission pass。它是低成本磨砂透光近似，不含真实背景模糊。
- 玻璃沿用原 StreetBatch 的距离 LOD、per-object frustum、far alpha fade 和隐藏逻辑，父组隐藏覆盖两批，玻璃不投实体阴影。私有材质与两级几何分别释放。固定碰撞仍只挂原 Builder proxy 一次；座位和 sign atlas 数据不变。
- 木纹 tile 从 2.4×.24m 改为 `.7×(.7*466/1024)m`，即 .7×.3185546875m。依据原 .7m 扫描与 466px 裁切高度，而不是输出 resize 的 512px。长纹沿构件主轴；端面使用两个截面轴，不再坍缩拉成条带。GLTF UV 与共享外接纹理统一 flipY=false，候车亭 native 输入在导出前相应反转 V，避免二次翻转。
- 共享 color 图变为中性 grain modulation：宽频强度 .18、局部细纹 .42，linear 中性 .8，限制 [.6,.96]。portable PBR 与 runtime 都用源 pigment×texture/.8；normal 强度 .18。蓝漆宽频色差由 .065 减至 .012。
- 环境强度改 .35，直接引用已有共享 night uniform，夜间衰减 90%，不加逐物件循环或灯。额外按物理 slot>0 门控 IBL，使所有未审 slot0 旧栏杆／其他共享批面恢复原先零 IBL；不把两个首样的环境方案扩到其他族。
- `extract_shelter.mjs` 直接提取当前 TS 的 geometry／UV／slot／color 与冻结 hull hash；`build_shelter.py` 由此生成命名 native、portable 和 fresh-import 收据。离线包是编辑／几何与 PBR 归档，不能表达 live atlas、dither、时间环境变化和微弱 procedural paint，不能代替最终网页外观。

## R1 加载状态与渲染计数边界

以下为原收据，格式是 triangles／calls／registered geometries／textures，完整数值未改。

| 机位 | baseline | candidate |
| --- | --- | --- |
| shelter normal noon | 792844／185／191／80 | 1415622／191／227／99 |
| shelter normal night | 793572／186／192／81 | 1416350／192／227／99 |
| shelter close noon | 1375455／179／209／96 | 1367598／179／227／99 |
| shelter close night | 1376183／180／209／96 | 1368326／180／227／99 |
| hut normal noon | 454769／81／218／98 | 456195／81／234／101 |
| hut normal night | 455497／82／218／98 | 456923／82／234／101 |
| hut close noon | 439752／74／218／98 | 441090／74／234／101 |
| hut close night | 439752／74／218／98 | 441090／74／234／101 |

相关 GLB source 核对：R10 小屋 A/B 为 2996／3068 triangles，R1 为 3084／3156，每变体增加 88 triangles。它不能单独解释 shelter-normal 的 +622778 triangles。原收据未记资产 root 或 URL，无法事后确定哪一包迟加载、LOD／阴影工作或其他状态贡献了差异；相机参数和 shadow settled 不等于加载集合相同。以上只作局部美术证据，**不据此给净性能增减结论**。

R2 QA 仅汇总六个相关 root，每 root 提供 mesh／层级可见数、registered／visible 集合 digest、至多 12 个 assetId，并列至多 24 个相关 GLB URL；不把整场景大清单灌入浏览器／聊天。录制前等 loading inactive、内存与相关集合稳定至少 1s，再检查两侧集合是否一致。候选新增玻璃批／小屋几何是预期差异，背景集合差异需另列，稳定本身不作一致证明。统计名义三角面不等于 GPU 实绘数量。

## 已验证与待验证

已通过：街景原 construction 5 项；surface／group／shader／glass partition 及实际 StreetBatch LOD、fade、hide、dispose 共 5 项；改动 TS／TSX transpile syntax；Python compile。提取的候车亭 source 为 2576 triangles，R1 为 1828；冻结 hull、seat、sign 和 L1 原数据测试均通过。

已完成真实网页：普通／近景日夜 8 对，以及候选玻璃 grazing／rear 两张正午图，共 18 张，逐张查看，全部 1710×875、DPR1、曝光1、过渡完成、shadow settled。新玻璃在两侧角度均能看到乳浊透光、胶条和压边，未观察到旧白板残留或背面叠色；这些有限机位不等于任意移动视角验收。小屋近景木纹不再压过板缝，普通视距更克制；夜间木材和玻璃恢复暗海／铺地的整体层次，原 map／窗／局部灯保留主次。这是执行者自查，不代替主协调或用户视觉接受。

8 对的相机／FOV／时间／画布／曝光／quality／night／blend 全匹配，四个相关背景 root（DJC 整体、吧台、家具、营地）的完整汇总与集合 digest 也全匹配；仅 world-park 的本轮几何 digest 及 world-street 新玻璃批存在预期差异。候车亭普通／近景四对的 render counter delta 均为 +3097 triangles／+1 call；小屋普通为 +1906／0，近景 +1818／0。这里报告本帧计数，不声称 FPS 或 GPU 时间收益，也不把六个 root 的有界汇总称为全场景证明。

基线初始化时曾出现未加载小屋的 greybox，因此 QA 又补目标真实 mesh 全部挂载的必要条件；loading inactive 和集合稳定 1s 本身仍不是完整性证明。最终图均在真实小屋挂载后录制。玻璃 LOD／fade／hide／dispose 已做真实 StreetBatch 源级验证；没有额外录制远距离隐藏／连续移动排序视频，未做 production build 或正常游玩性能比较。

最终 native／portable：小屋 A/B 为 3084／3156 triangles、149／155 parts，304 meshes 均有 UV，runtime GLB 无 embedded images；候车亭 fresh-import 为 2576 triangles，边界误差0，portable 玻璃为 BLEND／FrontSide，木材 color／rough／normal 渠道保留。最终玻璃参数 .45／.46 已同步归档。

便携包检查发现 Blender exporter 会保留木图却丢弃旧 MixRGB 的常量乘色，现由可复现 glTF 材质适配明确写入 hut 的 pigment/.8 factor，并逐材质断言。候车亭通过 vertex color/.8 携带同一公式。离线包仍不代表网页的时间／atlas／fade／环境响应。

最后重导使 runtime GLB 的容器 SHA 从拍摄时 `5135478f3efb7cd624a0b14e641051f183180c4fca8e31affebf1fd661205957` 变成 `2773a10b595d15720b95c9431648643e671913e784291bfff16d7baf2d9973ac`。已保留 `native/huts-r2-captured.blend`，用坐标与逐角 UV／朝向 polygon 的 canonical 比较排除 BMesh 枚举顺序，首拍／最终的304个mesh、层级／变换／材质指派／smooth和packed图字节完全相同，见 `hut-source-equivalence.json`；没有把新容器 hash 冒充拍摄时原 hash。

测试标签 `1395914299` 已关闭，临时 viewport 已 reset，核对自有 PID 66309 后停止 4348，重导／语义校验也结束，heavy lock 已释放并通知自然线。用户 4341 未操作。
