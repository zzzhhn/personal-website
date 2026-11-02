# 第六批共享材质与成本方案

2026-11-03，按QUALITY-AND-BATCH审阅当前release源码，基线HEAD见source-evidence.json。只读方案阶段；未改生产源码、构建、浏览器或R10采样。目标是先让普通行走视角的大面材质与形体明显改善，再量化实际成本，不用固定面数或一批次目标先削平首样。

## 必须先打通的真实消费链

| 源码事实 | 对首样的影响 | 最小可行改动方向，供作者实施 |
| --- | --- | --- |
| WorldStreetGeometry.vert:81把非sign的aSuv写零；WorldStreetMaterial:74用aMat常量替换roughness／metalness采样 | 挂新贴图到旧材质，不能自动获得完整PBR和有效纹理坐标 | 保留sign atlas独立含义，新增表面坐标／slot；接入真正的color、roughness、normal采样，明确哪些面沿木纹制造方向 |
| WorldParkKit.toBatch:60只留position／normal，再生成color／aEmit；meshPiece:77只取首材质名 | GLB的UV、纹理、粗糙度与多材质分组在进网页合批时丢失 | 新路径保留所需UV／表面slot／AO或材质属性；material[]按真实groups拆分或映射，不能继续取[0]代替全部表面 |
| StreetBatch每组一个材质；现有实例级LOD、frustum和dither仍有价值 | 可以复用变换／fade／碰撞框架，但“一draw”不等于零片元成本 | 首样可在同一opaque shader共享一套木材图；若不同表面需独立渲染状态，接受少量按状态分组，不按每个物件拆材质 |

园区／街道作者已回应首样采用共享木材color／roughness／normal及slot／制造方向坐标，保留来源、sign、aEmit／night和dither。该方向可用。先在候车亭和小屋真实网页成立，再推广五族材质返修；不把旧纯色或roughness／metalness词汇上限当作本批用户约束。

## 两会话可共用的纹理／材质契约

建议每套SurfacePack记录`id/version、canonical URL、色彩空间、采样档案、实际纹理尺寸、米制尺度、通道语义、来源、所有权`。这是一份共享描述与加载约定，不要求先造全岛材质框架。共享核心文件若需生产改动，由主协调指定单一实现所有者，两制作会话不同时改同一缓存文件。

1. **纹理共享，状态分权。** 同一来源共用明确URL和采样档案，不在每个GLB重复嵌入同图。baseColor按sRGB，roughness／metalness／normal／AO按线性数据处理。作者现有三图方案可先用；若后续合ORM，固定R=AO、G=roughness、B=metalness，不把普通阴影或泥污无差别乘到全部颜色上。UV／法线方向与法线图约定须一起验证。
2. **loader资源只借用。** GLTFLoader／useLoader已有按URL复用，camp／DJC工厂也借用geometry与texture，只拥有必要材质副本。不要为每实例new TextureLoader、重复decode、烘PMREM或重建geometry。每件独立fade的物件仍需独立材质状态，或使用已有批次alpha；不能共享opacity让一件复位时全部变透明。
3. **共享纹理不等于共享所有可变状态。** 当前Three的WebGLTextures以Source及wrap/filter/aniso/format/type/mipmap/flipY/colorSpace等组成的key复用GPU backing。同Source、同配置的Texture.clone并非必然多占一份GPU；配置变化或另一Source则可能另分配。统一采样档案，避免同图混出大量配置；有必要的纹理副本在工厂内缓存并释放，不直接改loader公用Texture影响其它资产。
4. **材质实例缓存与shader缓存分开。** 不同fade所有者可以有材质副本，但相同shader功能应共用程序。材质实例key需包含表面包／状态所有者；program key只描述会改变shader代码／defines的布局版本、贴图功能、形变／fade／alpha策略，不放随机UUID、时间或每实例名称。
5. **复用环境缓存。** WorldDjcFurnitureEnvironment:11已有renderer键WeakMap、引用计数和microtask释放保护，PMREM只在缺少条目时生成。需要PBR环境响应的首样借用该机制，不另造每材质／每帧PMREM，不改全局曝光或新增逐物件灯。贴图／GLTF源、材质副本、临时geometry、环境target各自只由所属owner释放，不能因一个实例卸载dispose共享map。

预算以真实载入尺寸和唯一GPU backing计。作为估算，未压缩RGBA8含完整mips时，1024²单图约5.33MiB，2048²约21.33MiB；三张分别约16／64MiB，另有解码内存，均非本批实测。JPEG下载小不等于GPU压缩驻留小。paintAtlas默认2048，但实际调用可能传更小size，先查真实参数，不按默认猜占用。先选能在普通视角看出收益的分辨率，保留mips及合理各向异性，不靠无限提分辨率补结构。

## 合批与导出边界

- 首样先接一份共享木材包，paint／metal可先用各自合理的PBR因子和大面结构；不要求每种表面三张独立图。若确需更多表面，按`surface pack × opaque/cutout/blend × side × deformation/fade/depth特性`分组。相同不可变材质跨实例共享；活动机械与独立复位部件保留其节点。
- 对Street同一BatchedMesh的L0、L1和fallback提供相同属性布局／类型及明确默认slot。保留aMat.w的sign语义、aSuv的标牌坐标、aEmit夜间契约，不能重用一个字段却让旧sign路径继续按另一含义解释。
- 木纹坐标从制造方向／局部部件空间产生，在合批或bake世界变换前保留；物件旋转后木纹随它转。Park旧toBatch会烘位置，不能事后把世界坐标直接当所有木板的同一纹理方向。法线贴图必须得到正确UV／切线或导数空间，不是仅加一个属性就自动有效。
- 保留原sign atlas，避免把双语文字和会重复的木纹挤入同一种repeat规则。若采用材质atlas，留mip gutter，检查远处渗色；若用fract重复tile，显式处理导数／mip边界。首样不必先实现多层texture array或全局大shader。
- 材质分组不复制刚体、碰撞和座位。原proxy仍只挂一次，别因wood／metal两批各生成一份相同collider。当前streetFacilityCollision保留原Builder来源可沿用；新视觉的边界和相机遮挡仍需单独核对。

## 找到的实际浪费与兼容风险

**优先处理材质hook丢失。** 当前安装Three的纯Node构造probe确认`Material.clone()`不复制onBeforeCompile或customProgramCacheKey。ParkKit:306的PartBatch和ParkWalk:240的Knockables从clone再取prev，拿不到source的parkNight hook。新PBR／发光也会遇到同一问题。应先保存source hook，再显式按顺序组合PBR／night／wind／fade／动画，key包含组合功能；色彩与depth／distance的位移、alpha和fade语义一致。此结论来自本机代码和无renderer probe，不伪称已做本批夜景运行验收。

**可复用已完成的按变化更新。** WorldCampPushableVisual:5按childadded／removed登记表面，setFade:71仅变化时写，能承接late Suspense替换；WorldCampFacilityCraft:53也对相同night值提前返回。本批新适配器沿用，不恢复每帧traverse／findByName／clone／needsUpdate。旧camp／DJC setNight仍逐材质写同值，可按该模式小修，但不值得为此重开全岛重构。

**局部上传可用dirty判断。** ParkKit.PartBatch.sync:323每次同步所有节点并置texture.needsUpdate；ParkExhibits的帧hook调用它。静止节点／未变emit无需重复上传，活动部件真正变化时仍正常更新。StreetBatch.update:67已只在LOD／alpha改变时更新GPU状态，但仍逐帧算全实例距离；可在相机位置与实例matrix/fade/hidden版本均未变时复用结果。必须让setMatrix／setFade／setHidden触发dirty，不能把静止相机误认为场景静止。

**程序噪声不是免费材质。** WorldCraftMaterials:6的stone／wood shader即使craftFine衰减为零，源码仍调用高频noise／正弦，不能假定GPU自动免算。可把适合重复的纹理细节烘进共享图，以mips处理远处细节；是否更便宜等冻结首样测量，不宣称贴图天然比程序材质快。不要同时叠旧全频噪声和多套新PBR采样。

## LOD、阴影与暂停的具体方案

| 项 | 复用与新增约定 | 避免的做法 |
| --- | --- | --- |
| LOD | Street现有±4m迟滞与每实例culling保留；ParkLOD:16的60m单阈值可加迟滞、仅变档时写visible，避免阈值抖动／每帧重建last对象。G17共同距离决策可共享。L1移除远处不可读五金／高频法线，保留大面色调、粗糙度关系、轮廓和冠层开口 | 用旧平板替代普通走路距离首样，或为了一个预算先把树冠和檐口削平 |
| 阴影 | 封闭壳体在确认拓扑后FrontSide；薄帐篷、叶片、开口锅具按真实表面保留侧面策略。柱梁／屋顶／树干等主要投影保留，隐藏内件、细弦、灯芯和玻璃按视觉作用不投影。叶片优先合适cutout而非无谓blend堆叠，保留风动shadow | blanket FrontSide或全部关shadow；为每个螺钉一独立caster；用实时灯／全屏AO补坏结构 |
| 阴影兼容 | 只改变color／roughness／normal通常无需新customDepth；保留static default-depth caster的现有chunk路径。alpha cutout、形变和dither则需要正确depth／distance语义。WorldShadows:670会排除customDepth、alpha cutout、displacement等，少draw的颜色合批不保证少shadow draw | 为纯颜色细节加无谓depth shader；alpha／位移只在颜色pass生效，影子仍是原壳 |
| 暂停 | worldRenderMode已是运行always、暂停／shot demand、隐藏never；Physics随renderMode暂停。菜单昼夜依赖timeRevision与NightClock有限过渡，画质／尺寸也会invalidate；StaticShotFrames只用于有限shot稳定 | 给新材质挂独立RAF／setInterval／每帧invalidate，让暂停永不睡；用Date.now驱动风／灯并在暂停时继续走 |
| 按需刷新 | 新图／GLTF／字体到达或材质档案切换时只触发必要invalidate，完成后回到休眠；夜值统一引用／变化时更新。风／布料／信号动画沿现有可暂停共享时钟，保持resume delta边界 | 每帧重绘canvas atlas、texture.needsUpdate、shader needsUpdate或刷新PMREM；为保持菜单效果把整个世界常驻always |

## 首样通过后的验证范围

现在不重采R10，不新开性能／浏览器窗口。先由主协调看四个首样在正常行走及交互距离的正午／困难夜景真实对照；离线原生图与网页消费链分开留证。

艺术方向通过后，对当时冻结包核入口HTML→WorldApp→动态runtime及实际材质／纹理资产，按真实收据集合核验，不能硬套上一批60文件或12源数量。先看材质／texture／program唯一数、GPU sampler配置、候选根／fallback、shadow工作与上传是否稳定；再在受影响普通机位做主协调授权的有限正常窗口，不用摄影shot计帧。

沿用上批边界：计数窗口内稳定、角色／相机／设置／buffer对齐，仍不保证不同加载间同资源／同热状态。若legacy A/B的triangle／geometry／program不同，如实拆开描述，不把整场景差值称作单资产净成本，不追第七窗或最好数字。暂停菜单应另核昼夜／画质生效且最终睡眠，不能用性能窗口代替。

本报告未发现需先全局降画质的证据。优先将真实PBR接进网页、修hook链、共享纹理与环境、缓存稳定表面、减少不必要上传和caster；具体成本留到艺术首样获接受后的冻结候选再验。
