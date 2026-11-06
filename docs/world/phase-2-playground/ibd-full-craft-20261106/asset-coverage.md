# 国投场景可见资产覆盖审计

2026-11-06。输入为当前共享工作树、`mechanisms.md`、`stock.md`、`truck.md`，逐项追踪 `WorldIbdYard`、`WorldIbdMechanisms`、architecture/site、拆检组件、guide/signs 和两个原生 GLB adapter。此次只读源码并写本清单，未运行测试、构建、浏览器或图片工具。主代理正在另行审阅实际日夜截图，本清单不宣称视觉验收。

普通运行选项是 `shedExpansion:true`、`rackMode:family`、`bridgeSample:true`、`crateSample:grain`。清单按真实资产族归纳，不把螺栓、重复实例或配色变体充作额外家族。状态中的“复用”表示当前运行路径保留前批原生／程序成品，不代表本轮已经重新验收。

## 主场地与建筑

| 可见资产族 | 实际绘制来源 | 本轮覆盖与保留情况 |
| --- | --- | --- |
| 三座不同高度／用途的厂棚，含墙板、屋面、门式钢架、基础、檩条、山墙、天窗／屋脊灯及檐沟 | `buildIbdArchitecture`、`CoilBayFinish` → 主静态合批与 coil-bay 材质 | 复用前批三棚精修：折板、H 型柱、膝板、真实梁板厚度、连续檩条及建筑级材质角色均在默认运行路径。此次没有另造三座替代模型 |
| 主场地铺装、边缘厚度及凹形场地边界 | `buildIbdPaving` → `aMat.w=2` → 主静态 PBR shader | 复用实际裁切／碰撞铺装；本轮主代理调整混凝土粗糙度读取。不是贴一张覆盖地面遮住旧 slab |
| 坡道、北平台、侧高廊、支柱与两侧护栏 | `buildIbdWalkSurface`、architecture gallery columns、yard geometry rail | 本轮在原五块走道顶面写入防滑制造坐标及 `-4` 材质角色，物理顶面不变；支柱和圆管护栏复用原构造 |
| 双门吊承重桥、轨道及端部支柱 | `addIbdBridgeSample` → `buildIbdArchitecture` | 复用前批双翼缘梁、腹板加劲肋、端板、承座和固定件，默认 `bridgeSample:true` 已启用 |
| 围栏、排水沟／格栅、工作区边线、斑马线、转弯标线和隔离区边界 | `buildIbdSite/perimeter`、主静态几何 | 本轮围栏补 X 撑、柱帽与脚板；排水格栅、路面涂线和区域划线保留原本应有的简洁形状，不把功能平面当未建模道具 |
| 植槽、东侧下凹绿地及植物 | `addIbdPlant` → `buildIbdSite` | 本轮以分枝和折叶替代原五边实体灌木，植槽补连续口沿；植物真正被 site 调用，未停留在未使用的生成器 |
| 高挂工矿灯、条形工作灯、台灯、车厢顶灯及灯柱 | `IBD_FIXTURES` → `buildIbdSite`，`WorldIbdLighting` 提供有界照明 | 本轮灯柱补框、底框、顶盖和地脚；吊灯／条灯／台灯复用原灯罩、悬杆和夹台支臂。所有灯具共用原工位照明定义，未逐灯新增实时阴影 |

## 物流、存储与机械

| 可见资产族 | 实际绘制来源 | 本轮覆盖与保留情况 |
| --- | --- | --- |
| 装车卡车：驾驶室、六轮、货厢、底盘、坡道 | `buildIbdTruck` → 主静态合批 | 本轮整体构造升级，见 `truck.md`：真通孔轮圈、冲压轮辐、木质耐磨板、车端门锁、折板、纵梁／横梁／弹簧。保留装车洞口和碰撞契约 |
| 四组辊道及承托结构 | `rollerBar`、`addIbdRollerFrame` → 主静态合批 | 本轮补槽钢侧架、立腿、脚板、膝撑、轴端和轴承；原滚筒及行走断口保留。裸钢制造坐标进入实际 IBD 材质 |
| 门吊小车、轨轮、双卷筒、马达及传动链 | `buildIbdCrane` → `WorldIbdMechanisms` moving 网格 | 本轮补马达承梁、安装垫和传动箱，复用前批开放机架、轨轮及卷筒 |
| 吊梁、夹爪、销轴与两条吊索 | `buildIbdHook/buildIbdCables` → moving 网格 | 本轮补闭合膝板并把方索改为八边圆索；夹鞋、吊索中心线和伸长机制保留 |
| 两件任务钢卷、缺陷区、编号牌、木楔与随动托架 | `addWoundCoil`、`buildIbdCoil` → moving 网格 | 复用前批真实卷层、内孔、缺陷面和相切木楔，仍作为独立货物被吊运／检查。此轮没有退回背景单环模型 |
| 后场三件静态钢卷及黄色托座 | `buildIbdStores` → 主静态合批 | 复用前批空心回转卷体、边缘收口、两条束带及 `-1/-2` 钢卷／裸钢响应。它们与两件编号任务样品是不同用途的可见族 |
| 三座深储物货架 | `addIbdStockRack(..., family)` | 本轮方柱改 C 型折弯开口柱，脚板贴地；既有折边层板、承梁、琥珀前缘保留；镀锌板与漆面分开响应 |
| 货架上的全部静态木箱 | `buildIbdStores` → `addIbdStockCrateSample`＋`woodFinish` | 本轮主代理将先前的单个精修样板扩展到全部木箱。板条、角柱、横档、绑带、标签和托脚进入默认 grain 路径；中心高改为 `1.42/3.52`，使底脚接触 `.49/2.59` 层板顶面。前台活动 GLB 箱不经过此替换 |
| 后架油桶及切管／管材堆 | `buildIbdStores` | 本轮油桶增加滚筋、卷边和两种注口，管材增加真实内孔、倒角和较平顺截面；仍落在原后架保护区 |
| 前台货箱、库存备箱、备用／退回箱及各自箱盖、脚轮、扣带 | `WorldIbdCratePart` → `crate-v1.glb` 的 Shell/Lid | 复用前批原生板条、角件、脚轮、铰轴及 AO；本轮补共享 PMREM 和实例拥有的夜间材质克隆。UV0、AO UV1、贴图、源几何和箱盖轴不变。替换、备货、隔离状态均调用此 adapter |
| M6／M8 螺栓、叉托、活动卡尺及伸缩演示机构 | `WorldIbdPackInspection` → `buildIbdPackParts` | 本轮分离六角头和回转轴、补倒角／梯形环状螺纹及固定件；四槽数量、真实轴径、夹口／拇指接触、叉道和转运轨迹保留 |
| 出货卷帘及防撞条 | `buildIbdShutter` → kinematic moving 网格 | 本轮实心条改有厚度折边板，增加相邻卷接缝及防撞条连接件，复用原升降框架 |
| 两座检查台、收货工作台、工具工作台、十座控制柜 | `WorldIbdStaticCraft` → `static-craft-v1.glb` → 六材质合批 | 复用前批原生承台、厚板、支架、支脚和检修门；本轮补共享 PMREM，并保留原静态灯具夜间补光。原生输入和全部贴图不变 |
| 称重／出货显示器、按钮、转向轮、装车手柄及门吊双操纵杆 | `addYardControl`＋`WorldIbdCraneLevers` | 复用既有按任务区分的控制件；柜体由上述 GLB 替换，但实际按钮、显示器和活动手柄仍独立存在，未被静态 GLB 烘死 |
| 手持检查手电及微弱光束 | `WorldIbdCoilInspection` → `buildIbdTorch` | 本轮灯圈补内侧返边，裸金属使用实际 moving IBD 材质；光束仍为原有界、低透明度提示，不新增实时灯 |
| 维修房／通风与设备门 | `buildIbdStores` 维修角 | 本轮主代理补了门框、凹入门板、把手和铰接部位；原墙体、屋顶及百叶保留 |

## 物理提示及有意保留的简单构件

| 可见资产族 | 实际绘制来源 | 覆盖边界 |
| --- | --- | --- |
| 入口门架、各棚牌底板、货架牌底板、局部提示支架与钢卷作业护挡 | `buildIbdStatic` 中的原有构件 | 保留已有支架及保护体量；文字由下列 sign atlas 覆盖。它们仍是简洁的杆／板构造，本轮没有逐一重做接头。不能将其列为“本轮全部新建” |
| 中英双语实物标牌、工位牌及活动货物标识 | `WorldIbdSigns` → `createIbdSigns` 单 atlas | 保留实际运行的标牌系统及当前站点映射；未重绘文字风格。标牌是功能牌面，平面本身不是遗漏几何 |
| 清单夹、纸张、收货印记、货物状态环、站位环、路线箭头及悬浮下一步标签 | `WorldIbdGuide/workObjects`、guide 材质与 canvas | 保留原提示语义和简洁造型。本轮未重做夹板外形；状态环、箭头和标签属于操作提示，不要求伪装为写实道具 |
| 原生 GLB 的远处、加载中、错误及显式 QA legacy 分支 | `WorldIbdStaticCraft/WorldIbdCratePart` fallback | 保留程序几何作为回退，正常近处优先原生包。回退没有被包装成新的精修成果；普通玩家路径应由主代理继续确认加载／切换状态 |

## 发现的明确缺口

截至本次源码读取，尚不能声称“剩余全部资产均已完成精修”。以下两项已单独通知主代理，此审计不擅自改源码：

1. **工具台上的整套可领取工具仍被普通统一材质压平。** `WorldIbdGuide` 的 `ibd-takeable-tools` 使用 `props.material`，即 `MeshStandardMaterial({vertexColors:true, roughness:.8, emissive:..., emissiveIntensity:.2})`。`buildIbdTools/addInspectionTools` 本轮虽写入 `aMat/-2/aSuv`，这个实际 draw 不调用 `createIbdMaterial`，因此裸钢／橡胶的 roughness、metalness 和 milled finish 没有落到桌上的工具。活动拆检卡尺和手持手电使用的是另一条正确 moving 路径。建议仅为台面工具接入现有 IBD 材质，保留纸张等提示物的独立材质选择。
2. **维修房旁绿色矮物资箱仍是单块方盒。** `buildIbdStores` 的 `cube([-27.1,.7,16],[2.2,1.4,1.5],P.green,true)` 没有独立箱盖、门缝／搭接、把手或支撑构造；旁边维修房新增设备门并未改变这件矮箱。它是当前清单中明确仍保留的单块实体道具，建议在原保护体量内补一个连贯的开合／承重构造。

其余已发现的主要可见物都有上述本轮修改、前批成品复用或明确的功能简化归属，没有发现另一条大规模未接入的替代资产族。但“源文件有覆盖”和“普通画面达到所需质量”是两件事：护栏／支架、后场钢卷、屋顶灯具、植物以及新车轮在普通距离是否仍显得粗糙，应依据主代理正在检查的日夜画面判断，不能由本清单代签视觉通过。

声音、HUD 文本、交互状态和物理代理不属于可见 3D 资产族，未拿它们补充覆盖数量；本轮工作流／合同测试的状态由 `contract-audit.md` 单独记录。

## 主代理集成回执

上述两项在最终构建前均已处理：`WorldIbdYard` 将已有 moving material 传给 `WorldIbdGuide` 的实际 `ibd-takeable-tools`，工具与纸张不再混用材质，且没有新增 material／PMREM；维修矮箱已拆成原保护体量内的箱身、盖板、接缝、支脚、搭扣与侧把手，原 collider 对象不变。

追加返修包括：车厢连续木板移除共面装饰线、使用有过滤的非周期木纹；两块装车斜板复用原顶面防滑响应；植物增加成对折叶并收细茎；标牌单图集横向改为 2048，以免宽棚牌在普通距离糊成一片，保留 1024 高度和单次绘制。新增贴图显存约 5.33 MiB（RGBA8＋完整 mip 估计），未增加下载纹理。完整视觉／性能结论以本目录最终 README 为准。
