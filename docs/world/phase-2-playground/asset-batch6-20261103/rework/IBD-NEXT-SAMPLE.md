# 国投厂棚与货架的下一张样板

以集成根 `f833be9ee0b0e5f7c2ae510781e8ad1b448d5126` 为准。批准依据是 `visual-calibration-20261027/ibd.json` 的 v1 昼夜参考，目标是三种仍可辨的开放式钢构厂棚。队列 `REWORK-QUEUE.json` 的 `cab-handoff.md` 只验过货车驾驶室，不能作为厂棚验收。厂棚另对读历史 `visual-calibration-20261027/runtime/world-v18-ibd-coil-day.png`。货架对读 `ibd-stock-craft-20261029/handoff.md` 和 `qa-20261029/ibd-stock-v42/stock-night.png`，v42 已打开侧面、补足层梁；v40 日图的整片侧板是旧状态。下述差距是历史原图与当前源码的交叉判断，制作窗口先拍当前集成版基线。

| 对象 | 优先改动 |
| --- | --- |
| **I-shed** | 侧墙和背墙的平板及交替浅色在普通距离像大块拼色。改为从落地基座到檐口连续的竖向折板节奏，保留局部收边和现有墙梁，把细压筋放进方向法线。屋面已有顺坡立缝、檩条、檐口和采光带，样板重点让漆面屋皮、镀锌折边与暗色承重构件在同一光线下分开。把一处现有檐口内侧做成可读的屋皮、折边、檩条连续接合。 |
| **I-rack** | 现有开放侧面和腹板保留。历史 v42 夜图中三层易读成近黑横线，台面、漆钢主梁和黄边之间缺少可见层次。用一块可辨厚度的镀锌层板折口压住原承梁，保持原顶面，并让前角能看出层板落梁、梁接柱的顺序。漆柱、镀锌层板、黄边分别响应现有灯光，箱、桶、管材不参与重做。 |

## 实际入口与样板

源码根为 `src/components/world/attractions/`。厂棚从 `ibd-yard-architecture.ts::buildIbdArchitecture` 进入；三座货架由同文件 `buildIbdStores` 调 `ibd-stock-craft.ts::addIbdStockRack`，中心 x 为 5、13、23。两族均经 `ibd-yard-geometry.ts::buildIbdStatic` 合批、`bakeIbdLight` 写入 `aIbdBake`，最终由 `WorldIbdYard.tsx` 的 `ibd-three-sheds-static` 使用 `ibd-yard-lighting.ts::createIbdMaterial(true, uniform)` 绘制。现有 `aMat` 控制粗糙度、金属度等；地坪有自己的表面分支，`aSuv` 是标牌坐标，普通面为零。另一路 `WorldIbdStaticCraft` 的 GLB 只替换检查台、工作台和操作柜。

首件选 **coil 棚前部一跨**，做内侧围护、对应屋皮和一处檐口。下一制作步拟由独立 IBD 围护表面适配器为样板指定米制坐标和漆板／镀锌角色，接到现有静态材质的颜色、粗糙度与法线阶段，保留原夜间填光和地坪分支。先检查 `ibd-static-craft-visual.ts::createIbdStaticCraft` 已消费的 `public/assets/world/ibd/static-craft/static-craft-v1.glb`，优先借用其项目自制的 512² 金属法线、金属粗糙度或涂层粗糙度，来源及哈希见 `ibd-static-craft-20261101/manifest.json`。同一纹理可借用时由 loader/cache 持有，样板只拥有局部几何、材质和绑定。既有贴图只承担微表面；若不足以表达顺坡压筋或竖向折板，再给样板自制可平铺方向图并记录来源、尺寸、字节和归属。

**唯一判断机位**为 I01 南入口往钢卷棚斜看。先用场地局部眼位 `[-6, 1.9, 13]`、目标 `[-18, 7, -6]`、FOV 50° 作取景种子，确认落在通路且同屏看见围护、屋底和檐口后冻结。正常视距下，正午应能读出压板方向和接合顺序，午夜在原灯光下仍能分出漆面与镀锌边。样板有清楚收益再扩至其他棚和货架。

**最小验证**为冻结前后同机位正午／午夜原图，读回实际 mesh 的角色、米制坐标、纹理身份和原填光，并记录三角面、绘制批次及资源字节差。比对原 solids、walkSurface 和可交互资产，跑现有 `ibd-yard-art`、`ibd-yard-geometry`、`ibd-stock-craft` 及货物安全短测。保持三棚轮廓、开放面、吊运净空、高廊、装卸与出口、货架承托高度和碰撞盒、库存内容及数量、箱盖与取样、台位和提示。D-basin 池岸仍是独立欠账。本步仅写方案。
