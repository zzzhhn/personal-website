# 整合时排除的旧视觉

本包不修改现有函数。主 session 接入 `<WorldCoasterStationCraft detailed={...}/>` 时，按下列边界只排除旧 `steel` 部件。原碰撞 push、地面、glow、文字 atlas 和交互仍由旧 consumer 提供。

| 函数与位置 | 排除的视觉 | 必须保留 |
| --- | --- | --- |
| `addArchitecture`，`COASTER_BOARDING.stairs/threshold` 循环 | 原踏步 box、标记、金属 lip box/标记 | 七个 collider 的原 position/half/rotation/surface；所有脚路、地面 probe |
| `addCoasterStationRoof` | 旧屋顶整块 ExtrudeGeometry | 屋顶 collider `[-2,6.8,41.5]`、half `[9,.6,11.5]` |
| `addStationStructureDetail` | `stationStructureMembers` 的旧 steel box | 同一 members 的全部 collider push；`COASTER_STATION_EDGE_LIGHTS` 的 glow |
| `addArchitecture`，柱线 x=-10/6 | 四个 `housing([x,3.1,z],[1.1,6.2,1.1])` 的 steel 视觉 | housing 原来负责的四个 collider；四处柱面暖灯 |
| `addArchitecture`，东/西楼 | `housing([10,3.1,43],[5.5,6.2,14],...,true,.06)` 与 `housing([-14.5,2.7,35],[5,5.4,8],...,true,.06)` 视觉 | 两个原全尺寸 collider，不可换成 inset 后尺寸 |
| `addArchitecture`，四块候车侧板 | `box([7.17,2.7,z],[.15,1.6,2.8])`，z=34/39/44/49 | 原侧板青色灯面 `light([7.06,3.25,z],...)`；屋底四行暖灯 |
| `addArchitecture`，站房屋面设备 | `box([-2,7.55,40],[9,.3,6])` 与 `housing([10,6.6,43],[3.8,.8,8],...,false)` | 其它塔楼/设备楼结构及其 collider/glow |
| `addArchitecture`，gate 段后的 `if(detailed)` 第一行 | 六根 `box([8.5+i*.6,6.9,43],[.25,.35,5.5],P.rail)` 东附楼屋面 vent | 紧跟的设备楼梁、服务梯/门等所有内容。本包 Near/Far/Shadow 均覆盖这六根 vent 的原位置和尺寸 |
| `addCoasterBuildingArt`，函数开头至 `// Equipment buildings...` 之前 | 站房柱脚/柱头/斜撑、横向 ledger、屋顶铜边、檐梁/承板、front fascia、东附楼门窗与西服务屋板件/百叶 | 后面的 `equipment` helper、维修楼和后电力楼全部内容 |
| `addCoasterBuildingArt`，末尾 `if(detailed)` 的两个循环 | 东楼贴件紧固点与 front fascia 的旧短梁 | 函数中所有其它非站房内容 |

由于旧的 `housing/box` 包装同时写 steel 与 collider，不能直接删除整条调用后丢掉物理。在主函数增加纯视觉选择或显式保留原 collider 均可，但不可用新 GLB 自动生成的壳代替物理代理。

不排除：站房地坪 `[-2,.04,41.5]`、入口广场/通道；门柱/门楣族15；设备楼族25/26；轨道、栏杆、服务结构。标识族40只替换车站实体背板/框，三块动态文字平面和 atlas 的语言/进度/UV 一律保留。新车站框的内开口与原 `[-2,6.7,53.1]`、`[8.5,.95]` 文字面配套，没有烘死文字。
