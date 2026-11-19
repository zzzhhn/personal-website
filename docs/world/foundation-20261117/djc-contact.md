# DJC 舞台、泳池与近身接触

北吧高凳原来使用四个贯通座面、脚环及腿间空隙的整盒。对发布模型在凳下 30 cm 高度横向检查，可见射线穿过，Rapier 却在 0.775 m 挡住。新接触从发布近景模型的凳面、凳腿、编织座面和脚环提取，并使用同一份模板生成四个真实放置。近、远景的四个凳下开口均用实际 GLB 和 Rapier 对照。近远景仍共用一套碰撞，失败备用高凳也使用该实体外形。渲染版的吧台、贴图和 LOD 切换沿用原装配。

圆床原碰撞外沿比可见床垫提前出现，且弧切木坡已经可见，物理仍覆盖整个矩形平台。侧缘 y=1.75 m 的射线旧版提前约 21 mm。新版本从发布床垫的剖面生成接触，并用同一个 192 段弧口截断可见和物理木坡边缘。四张床各 18 个床沿与落脚射线距离的最大偏差约 3 µm。实际动态胶囊依次验证了四张圆床的八条双侧入座路线和四个泳池浅坡各两侧的离池路线。泳池水面为可穿过的水层，支撑由其独立矿物底、浅坡和围边承担。

舞池木板、舞台前后坡道、两条木步道、石铺装、泳池内衬及棚顶等保持原材质合批，在原绘制区间记录真实接触归属。本批逐三角核验 27,322 个可见结构面，石批及软叶片批已完整声明。投光只标在实际接收面上。镜球的可见球面与相机接触球拥有同一严格注册根。

Chrome `157.0.8103.79` 先验证普通 `/world/?start=club` 进入，再在同一隔离构建中为三段路线设置 QA 起点。使用真实键盘沿舞台前坡上到演员身体 Y `2.822` m，走回坡脚到 `2.011` m，两端落地。从第一张圆床的木坡走到坐姿提示，按 E 坐下并再次按 E 站回支撑面。沿西池浅坡走出，X 从 `54.503` 到 `50.886` m，Y 从 `1.668` 到 `2.185` m。页面和游戏错误均为 0，本地分析接口单独返回 404。定向 39 项通过。另在隔离目录补回 `ada5ced` 归档的缺失基线文件，北吧原有 11 项回归通过。

剩余局部部件包括 DJ 台面的小按钮、线材、屋檐小饰和舞者。石批已有完整登记，木、布、金属等合批依已确认结构面部分登记。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/{club-structure-contact,club-seating}.test.mjs
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/club-contact-browser.mjs http://127.0.0.1:4358
```

## 池灯和遮阳伞的完整注册

| 装置 | 旧接触 | 实物同源接触 |
| --- | --- | --- |
| 十盏池灯 | y=0.55 m 的立杆漏掉。头顶下探时只在 0.600 m 后命中原基座，实际灯帽在 0.230 m。 | 四个材质的真实发布网格离线降至共享 900 个碰撞三角形。十处 50 条射线最大误差 0.748 mm，灯旁空隙保持通行。 |
| 两把遮阳伞 | 可见斜边和八面旧代理的同向下探差 59.36 mm。 | 四个材质的发布伞杆、接头、布面和包边经离线处理共享 3,230 个碰撞三角形。两处对照伞杆、伞顶、伞下与边外留空，最大误差 1.94 mm。 |

主材质和实例绘制沿用已有的 GLB、实例矩阵、材质和纹理。计算简化在离线完成。实际灯和伞从加载备用形状切换到发布形状时，各可见部件使用同一分支的物理数据。每个实例的图形矩阵与放置声明由严格清单核对。两个范围内的原合批代理由新注册接管。

Chrome 157 从普通 Club 入口进入。脚本单独挂起各自的真实 GLB 请求。池灯注册数在挂起、放行和显式旧版三个阶段为 1／10／1，遮阳伞为 1／2／1。六阶段均无范围内漏项或重复。放行后，用运行时实际角色胶囊扫形命中各自第一个新实体。页面和游戏错误为 0，开发分析接口的 404 单列。

```sh
node tools/world/djc-quality-pilot/build-fixed-contact.mjs pool-lantern
node tools/world/djc-quality-pilot/build-fixed-contact.mjs umbrella
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/club-fixed-contact-browser.mjs http://127.0.0.1:4358 pool-lantern
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/club-fixed-contact-browser.mjs http://127.0.0.1:4358 umbrella
```

## 躺椅、DJ 台和音箱

| 部件 | 原接触差异 | 修复后 |
| --- | --- | --- |
| 两张躺椅 | 布面代理挡住可见的木框边。沿木框边下探提前 255 mm，布面中心提前 60 mm。 | 木框、面料围边、床面与铰链保持各自的外形，椅边空位仍能穿过。 |
| DJ 台柜体 | 东侧可见木面距探针 1.090 m，原接触漏过。 | 东侧棒条和台边具有接触，西侧操作位的开口保留。 |
| 两台音箱 | 正面两个扬声器面比可见模型落后 44.5 mm。 | 面网、柜体及隔离垫与可见模型对齐，箱侧空位保留。 |

三类发布几何从 33,280 个共享渲染三角形离线生成 5,764 个共享碰撞三角形。五个放置的 19 条 GLB／Rapier 射线对照最大偏差 1.26 mm。相同材料和绘制矩阵仍用于原实例，五个碰撞放置组成一个严格检查范围。原有三个家具代理从结构合批移出。未收到正式模型时，1,350 个三角形的程序备用绘制拥有一个同源碰撞，显式旧版使用同一备用。

Chrome 157 在同一隔离入口验证普通进入和 QA 加载。挂起实际家具请求、放行和显式旧版的注册数为 1／5／1。放行后，真实角色胶囊从东侧扫到 DJ 台柜体。页面和游戏错误为 0，开发分析接口的 404 单列。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-furniture-contact.test.mjs
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/club-fixed-contact-browser.mjs http://127.0.0.1:4358 furniture
```

## 圆床靠背、石身和灯

原靠垫正前方命中比实物晚约 203 mm，另一条小靠垫探针漏掉实体。灯帽下探要晚约 326 mm 才碰到原托盘，石身的一处接缝提前约 25 mm。四张圆床现在直接从发布 GLB 的八个材质生成固定接触。主床垫保留发布版原三角形，床缘继续与 192 段木坡弧口齐平。请求未完成时，程序备用床垫使用同一弧口，整套备用由其可见三角形生成物理形状。

床体共用 10,022 个离线处理后的碰撞三角形。四个放置的 44 条实物对照探针最大偏差 2.881 mm，另外 72 条床缘和木坡接缝探针的偏差小于 1 µm。真实动态胶囊通过正式和挂起备用两套模型各八条入座路线，以及四条泳池浅坡各两侧的离池路线。

Chrome 157 从普通 Club 入口进入，单独挂起并放行真实圆床请求。挂起、正式及显式旧版依次注册 1／4／1 个形状，放行后角色胶囊命中新床体。复跑舞台上下坡、圆床 E 坐下和站起、西池浅坡离水。页面和游戏错误为 0，开发分析接口的 404 单列。

```sh
node tools/world/djc-quality-pilot/build-fixed-contact.mjs daybed
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/{club-daybed-contact,club-seating,club-structure-contact,djc-daybed-visual}.test.mjs
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/club-fixed-contact-browser.mjs http://127.0.0.1:4358 daybed
```

## 北吧走面、柱、柜体和花槽

原接触在背吧后方提前 540 mm、在一根柱正面提前 58 mm、在花槽斜边提前 135 mm。原两个花槽方盒挡住可见外角空气，前沿木板的一处倒角也没有对应接触。近远两份发布模型现在共用由实物抽取的承重面和外壳。椅腿间继续留空。近景棚底的织边及酒瓶、植物等视觉细节按各自用途登记。载入备用模型时，原方盒、棚顶和高凳分别使用备用画面的结构和形状。

42 条近远实物／Rapier 探针最大偏差 8.088 mm，涵盖前沿木板、台面倒角、柜体侧面、棚顶上下两面和花槽边。主结构为离线生成的 22,732 个三角形，在北吧开始请求模型时再载入碰撞数据。原材质、贴图、近远距离及高凳的四个独立碰撞沿用既有配置。

Chrome 157 普通入口通过。QA 挂起实物请求、放行近景和独立载入远景均注册六个形状。放行前后，四个高凳的物理句柄相同，实物近远景的六个形状边界相同。真实角色胶囊命中东花槽。角色以键盘走出木地板、重新上到板面并走回斜坡，三站均保持落地，身体 Y 分别约 1.914、2.023 和 1.910 m。

```sh
node tools/world/djc-quality-pilot/build-bar-contact.mjs
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-north-bar-contact.test.mjs
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/club-north-bar-browser.mjs http://127.0.0.1:4358
```

DJ 控制台托架和两个转盘的可见面原先全部漏掉。结构形状现直接使用原绘制几何，四条侧面和上表面探针误差小于 1 mm，西侧操作通道保留。Chrome 运行时以角色胶囊从东侧命中托架，并复跑舞台上下坡、圆床 E 坐站和泳池离水。控制台新增 524 个同源三角形，结构原材质合批现共 27,846 个已核实有真实碰撞的三角形。本轮未重新采集正式设备的帧率。
