# GTA V 地图结构调研：可复用原则（map-v4 第 0 步）

2026-10-22，Codex 子会话。全部来源访问日期 **2026-10-22**。只拆结构原则，不复制 Rockstar 的地图、地名、地标外形或素材；本文出现的 GTA 地名只用来标明来源出处，不进入 Bobby 岛的任何命名或资产。

## 证据等级

- **一手**：Rockstar 官方页面，或 Rockstar 开发者的署名采访（Guardian、MCV/DEVELOP、BuzzFeed 采访的转载、GameSpot 转述）。本轮实际打开并读了正文的标「已读正文」。
- **二手**：社区 wiki（GTA Wiki Fandom、grandtheftwiki、thegta.wiki 等）。本轮只拿到**搜索结果摘要**（Fandom 和 gta.wiki 的页面工具打不开，返回 restricted 或 403），所以一律标「摘要」，不当作已核实正文。
- **推断**：根据上面两类材料，加上本仓库实测数据得出的设计判断，标「推断」。
- 同机另一个仓库 `personal-world-bruno`（`wt-map` 分支 `codex/wb-map-navigation`）的 `docs/workbuddy/map-navigation/research.md` 做过 GTA V 雷达和导航的实机取帧调研。本文只读过它的标题与来源列表，没有复核它的结论，所以不引用它的观察结果。

## 1. 总体：先做「城市规划」，再缩成精华

| 结论 | 等级 | 来源 |
| --- | --- | --- |
| Dan Houser：GTA「更像城市规划而不是建筑」；首版地图布局要同时保证看起来可信、好玩，还要给追车留好路；地图大约只有真实区域的二十分之一，所以要先挑出必须有的标志性东西，再用小得多的面积把那座城的精神装进去 | 一手，已读正文 | https://www.theguardian.com/technology/2013/sep/17/grand-theft-auto-5-gta-dan-houser-interview |
| 同一采访：城乡对比是 GTA V 的指导原则之一，「你需要能往不同方向走」 | 一手，已读正文 | 同上 |
| Aaron Garbut：先由 6～8 人做约 9～12 个月，得到扎实的块面地图；把城市当雕塑做，保证街道透视好看；地图要能开起来，再由关卡设计迭代；几个街区之内就能切换街区气质，现实里这种变化要跨十英里 | 一手，已读正文 | https://mcvuk.com/development-news/inside-rockstar-north-part-4-the-art/ |
| Garbut：每一盏灯都放进地图并能远距离显示，所以夜里从远处就能凭灯光读出小镇轮廓和道路走向 | 一手（BuzzFeed 采访的转载摘录），已读正文 | https://www.igrandtheftauto.com/gta5/news/buzzfeed-interviews-art-director-aaron-garbut |
| Garbut：「考虑过每一棵树的位置」，不靠复制建筑或程序化地形来凑面积 | 一手转述，已读正文 | https://www.gamespot.com/articles/rockstar-on-gtav-weve-considered-the-placement-of-every-tree/1100-6412953/ |
| 地图面积：Wikipedia 写全图 49 平方英里，Los Santos 约 75.84 km²；另有多个页面指出 Rockstar 从未公布官方面积，常见数字来自社区测量 | 二手，摘要 | https://en.wikipedia.org/wiki/Los_Santos%2C_San_Andreas 、https://gamemapa.com/en/gta-6/tools/map-size-comparison/ |

**可复用原则（推断）**：①先灰盒、先能开车，再细化，这正好对应本方案的两步走；②用「必有清单」做压缩，不按比例缩小；③密度对比（城和野）本身就是内容；④灯光同时是导航层。

## 2. 功能分区

| 结论 | 等级 | 来源 |
| --- | --- | --- |
| Los Santos 有市中心、Vinewood 山、海滩区、港口和机场等分区；市中心以摩天楼和企业建筑为主 | 二手，摘要 | https://gta.fandom.com/wiki/Downtown_Los_Santos_%28HD_Universe%29 、https://geo-heist.com/maps/los-santos |
| 港口是集装箱码头、仓库和工业区，靠高架和桥接回陆地 | 二手，摘要 | https://thegta.wiki/wiki/elysian-island/ 、https://gtadb.net/locations/port-of-los-santos/ |
| Blaine County 在土地面积上占大半，包含沙漠小镇、农业小镇、海边小镇、大山和内陆湖 | 二手，摘要 | https://gta.fandom.com/wiki/Blaine_County 、https://geo-heist.com/maps/blaine-county |
| 海边小镇被沿海公路从中间穿过，背靠森林和山 | 二手，摘要 | https://gta.fandom.com/wiki/Paleto_Bay |

**原则（推断）**：每个分区要有一种可以一句话说清的气质，外加一种主要地面材质；分区之间用路或地形做边界（Lynch 的 edge），不用空白。

## 3. 道路层级

| 层级 | GTA V 观察 | 等级 | 来源 |
| --- | --- | --- | --- |
| 高速／州际 | 有 4 条州际高速；市中心那条全程不少于 6 车道；另一条在市中心段是全高架，每向 4 车道 | 二手，摘要 | https://gta.fandom.com/wiki/Numbered_Highways_in_GTA_V 、https://www.grandtheftwiki.com/Interstate_2 、https://gta.fandom.com/wiki/Interstate_4 |
| 乡间高速 | 出城后收窄成四车道乡间高速，连起沙漠、农业小镇和北部海边小镇 | 二手，摘要 | https://gta.fandom.com/wiki/Senora_Freeway 、https://gta.fandom.com/wiki/Los_Santos_Freeway_%28HD_Universe%29 |
| 沿海公路 | 一条从城市西侧沿整条西海岸和北海岸走的公路，连接海边小镇 | 二手，摘要 | https://gta.fandom.com/wiki/U.S._Route_1 、https://gta5wiki.com/places/landmarks/great-ocean-highway/ |
| 双车道乡道 | 东西向双车道乡道穿过沙漠小镇，同时是两个县的分界 | 二手，摘要 | https://gta.fandom.com/wiki/U.S._Route_68 |
| 土路 | 山与湖之间有双向土路 | 二手，摘要 | https://gta.fandom.com/wiki/North_Calafia_Way |
| 山路、步道 | 主峰有标示的登山步道，可以从缓坡一侧把车开上山顶；越野路线分初、中、高、极限四级 | 二手，摘要 | https://gta.fandom.com/wiki/Mount_Chiliad_%28HD_Universe%29 、https://gta.fandom.com/wiki/Mount_Chiliad_Tourist_Trail 、https://gamers.wiki/en/games/grand-theft-auto-v/guides/gta-5-mount-chiliad-guide-tram-trails-and-ufo |
| 街巷 | 城市内的街巷网格、人行道和停车场的设计原则 | — | 这几次搜索没命中能直接引用的来源 |

**原则（推断）**：层级要能**一眼读出来**，靠宽度、路肩、灯距、护栏和材质区分，不靠文字；而且至少要有**一个闭合环**，让玩家能「换个方向走」。

## 4. 密度梯度

- 市中心高密度，有玻璃塔楼、市政建筑和高速立交（二手，摘要：https://geo-heist.com/maps/los-santos ）。乡村是小镇、农场、营地、拖车公园和零星设施（一手，已读正文：BuzzFeed 采访转载）。
- Garbut 说「几个街区之内切换气质」（一手，已读正文：MCV）。
- 关于道路边建筑数、路口间距的定量数据：这几次搜索没命中 GTA V 的测量值。本方案的密度目标是推断值，参考真实城市规范：路灯间距约为灯高的 2.5～4 倍，https://globaldesigningcities.org/publication/global-street-design-guide/utilities-and-infrastructure/lighting-and-technology/lighting-design-guidance/ 、https://solmast.com/insights-street-light-pole-height-spacing.html ；步行友好的街区边长 60～120 m 起，https://www.mdpi.com/2075-5309/15/18/3393 。游戏里会再压缩。

## 5. 地标与视线引导

| 结论 | 等级 | 来源 |
| --- | --- | --- |
| 市中心最高的塔楼是城市天际线的锚点，在市中心大部分地方都看得见 | 二手，摘要 | https://gta.wiki/w/Maze_Bank_Tower 、https://www.viceatlas.com/v/locations/maze-bank-tower |
| 山上的大字招牌和天文台从城市多数位置都能看见 | 二手，摘要 | https://gta5wiki.com/places/landmarks/vinewood-sign/ 、https://thegta.wiki/wiki/galileo-park/ |
| 最高峰占据北部，是全图的方向锚 | 二手，摘要 | https://geo-heist.com/maps/blaine-county 、https://gtacore.com/database/locations/mount-chiliad |
| Lynch 的五要素：路径、边界、区域、节点、地标；地标从多方向、远距离可见时更有用；决策点和节点重合时节点更受注意 | 一手（原书 PDF 摘录） | https://www.miguelangelmartinez.net/IMG/pdf/1960_Kevin_Lynch_The_Image_of_The_City_book.pdf 、https://en.wikipedia.org/wiki/The_Image_of_the_City |
| 主题公园的「weenie」：每个主题区围绕一个高大醒目、有长视线的地标 | 二手 | https://book.leveldesignbook.com/studies/irl/disneyland |

**原则（推断）**：分三层地标，一个全岛级、每个分区一个、路口一个；直路的尽头放对景；路口放在地标的视线上。

## 6. 海岸线、沙滩与栈道

- 海滩旁有一条长步道，内侧是商铺；码头把两段海滩隔开（二手，摘要：https://gta.fandom.com/wiki/Vespucci_Beach_Sidewalk 、https://gta.fandom.com/wiki/Del_Perro_Beach ）。
- 沿海公路两种段落都有：贴海走，以及穿过海边小镇中间（二手，摘要：见第 3 节的 U.S. Route 1、Paleto Bay 条目）。
- **原则（推断）**：海岸至少要有三种段落，开阔沙滩、硬质海堤和岩台；沿岸步道和车行道分开；码头或栈道当作海岸的「节点」。

## 7. 桥、高架与高差

- 港区有一座拱桥和一座悬索桥，高架高速直接飞跨过港区（二手，摘要：https://thegta.wiki/wiki/elysian-fields-freeway-bridge/ 、https://grandtheftauto6wiki.com/wiki/miriam-turner-overpass/ ）。
- 乡村有跨河的桥，桥上有道路分隔柱，Rockstar 后来把这些柱子改成一撞就断（二手，摘要：https://gta.fandom.com/wiki/Zancudo_Bridge ）。
- 主峰西侧极陡，东侧较缓，可以开车上去；山里还有一段铺装、带照明、高速公路规格的隧道（二手，摘要：https://gta.fandom.com/wiki/Mount_Chiliad_%28HD_Universe%29 、https://gta.fandom.com/wiki/Chiliad_Mountain_State_Wilderness ）。
- **原则（推断）**：高差要能拿来玩，比如一侧陡（看景）一侧缓（开上去）；桥是分区之间的门；高架和立交的成本最高，小岛上可以先不做。

## 8. 街道家具

- 二手（Fandom「Street Accessories」摘要）：游戏里有 11 种红绿灯模型；车可以撞倒小配电箱并冒火花；路灯被撞倒后还会亮几秒。https://gta.fandom.com/wiki/Street_Accessories
- 二手（同主题镜像站的图片标题）：消防栓、高速门架、转弯标、邮筒、停车让行标、路灯、电话亭、报刊箱、悬臂红绿灯、金属长椅、公交站、纸箱、配电箱、大型垃圾斗。https://grandtheftauto6wiki.com/wiki/street-accessories/
- 停车位和人行道的布局规则：这几次搜索没命中可以引用的来源。
- **原则（推断）**：家具**按道路等级和分区配套**，比如城区有红绿灯、消防栓和公交站，海岸路有分隔柱、护栏和弯道标，山路有木桩和弯道标；小件做成可撞倒的刚体（PRD §4.3 已锁）。

## 9. 小地图风格

- 雷达会旋转，让角色朝向始终在正上方，N 标记表示北（二手，摘要：https://www.gtabase.com/articles/grand-theft-auto-v/gta-5-features-guide-gameplay-hud-combat-money ）。
- GTA V 在 2015 年的 HUD 改版中把地图改成灰阶（二手，摘要：https://thegta.wiki/wiki/radar/ ）。
- 目标点在高处或低处时，圆点里会有小箭头（二手，摘要：https://gta.fandom.com/wiki/Radar ）。
- GPS 路线：任务是黄色，玩家自设的路点是紫色（二手，摘要：https://gta.fandom.com/wiki/GPS ）。
- 第三方小地图设计建议：地面低对比，让图标和路线浮在上面（二手：https://fivem-minimaps.com/for/fivem-radar-minimap ）。
- **原则（推断）**：小地图底图低对比，道路按层级给不同的宽度和亮度，路线用一种全图独有的强调色；具体交互（旋转、缩放）不在本次布局范围内，留给 HUD 会话。

## 10. 不复制的东西

不用任何 GTA 地名、路名、编号、品牌或标志物外形，不用 GTA 的地图图片、贴图或配色文件，也不做「一比一缩小 Los Santos」。Bobby 岛的地标全部来自已有内容和 Art Lock 资产：风车 G29、混元楼发光环、篝火、传送门 G28、园区总牌。
