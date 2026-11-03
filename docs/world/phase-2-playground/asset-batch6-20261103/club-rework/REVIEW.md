# DJC 主亭与实体池岸验收

基线 `bdd9d2e`，材质候选 `a464f85`，默认启用范围 `422072e`。共享兼容补丁原提交 `5983700`，在本支为 `a3b058c`。生产改动为主亭与池岸装配、独立表面着色器和三个绘制批次的局部绑定。

| 设施 | 原版白天 | 返修白天 | 原版夜间 | 返修夜间 |
| --- | --- | --- | --- | --- |
| D-pavilion | [图](structure-stage/pavilion-baseline-day.jpg) | [图](screenshots/pavilion-candidate-day.jpg) | [图](structure-stage/pavilion-baseline-night.jpg) | [图](screenshots/pavilion-candidate-night.jpg) |
| D-basin | [图](screenshots/basin-baseline-day.jpg) | [图](screenshots/basin-candidate-day.jpg) | [图](screenshots/basin-baseline-night.jpg) | [图](screenshots/basin-candidate-night.jpg) |

主亭对照取自结构阶段的原版构建与最终水兼容构建。两次构建的相机位置和四元数、FOV、DPR、曝光、画布、天气时刻及稳定阴影按记录逐项匹配。池岸两版取自同一轮最终石材构建。两族白天为 12:00，夜间为 00:00，画布 1710 × 931，DPR 1，曝光 1，balanced。

主协调接受 D-pavilion 的普通视距材质方向，交付默认启用。D-basin 修掉了 R1 的规则孔点，R2 的普通视距质感提升仍偏弱，作为后续候选保留。默认 stone 的几何、颜色、法线、属性和水面输入与 bdd9d2e 逐字节一致。最终开关拆分做了源码和回归验证，游戏截图来自拆分前的同一候选数据。

## 屋面与竹架

[第一版预览](structure-stage/sample-r1-candidate-preview-day.jpg) 的屋底色带和小承托块不足以改变普通视距下的观感，几根斜撑仍停在屋底下方。[第二版预览](structure-stage/sample-r2-pavilion-preview-day.jpg) 加上七道曲面椽条，原斜撑与立柱继续延伸到现有檩条，竹拱上方以六个短承托连接。茅草搭接沿屋坡横向展开，原 15 厘米闭壳仍提供全部相机碰撞。两张预览带当时的加载状态，只用于解释样板迭代。[材质样品](screenshots/material-sample-pavilion-preview-day.jpg) 让屋底编织与竹杆顺纹在同一普通机位可见，最终把屋底纬向纹理拉长、减弱横线。杆轴坐标来自实际竹杆柱面 UV，纹理对粗糙度与光照法线同时起作用。[慢转](screenshots/pavilion-slow-pan-1.jpg) [抽样](screenshots/pavilion-slow-pan-2.jpg) [三帧](screenshots/pavilion-slow-pan-3.jpg)未见明显纹理跳变。采样覆盖同一个普通机位约 7.3° 的摆幅。

## 实体池岸

暖石压顶、浅色铺石、斜岸和水下衬壁分别着色。现有错缝石板、嵌缝和木接驳使用原裁切面，地面高度与碰撞保持逐字节一致。新增 68 段内侧衬壁，接到旧压顶底面，并延伸至池底边缘以下 6 毫米。28 个原缓坡扇段留空。池底保持同一矿物基色，保留低频石材明暗。干铺石、砂浆、压顶和湿衬壁以米制坐标分别计算颗粒、孔隙、粗糙度和微起伏。衬壁沿池缘展开坐标。[淘汰的第一版](rejected-stone-r1/basin-candidate-day.jpg)在前景形成等距圆孔。第二版把大面交给不规则矿物云斑和真实接缝，细纹由约 10.5 毫米的非正交采样单元产生更小的稀疏斑点，法线高度幅度为 0.3–0.55 毫米，随屏幕覆盖过滤。原水体接口继续保留。现有焦散和水下地砖 hook 挂到实际绘制的 stone 克隆，程序键由表面键与焦散键组合。

## 资产与资源

| 原批次 | 三角面原版 → 返修 | 属性字节原版 → 返修 | 游戏粗糙度 |
| --- | ---: | ---: | ---: |
| fabric | 3120 → 2896 | 374400 → 451776 | 0.94 |
| wood | 23507 → 25287 | 2820840 → 3944772 | 0.85 |
| stone | 14324 → 14460 | 1718880 → 2255760 | 0.95 |

两族都启用时，三批次净增 1692 个三角面、1738188 字节，其中原有顶点属性增加 203040 字节，新的坐标与角色属性增加 1535148 字节，仍在原测试的 68000 三角面预算下。正式默认只启用主亭，净增 1556 个三角面、1201308 字节，其中 1014588 字节为新增表面坐标与角色属性。两种模式都复用现有绘制批次，实际管线为局部装配 → `aDjcFinish` 米制坐标与角色 → 原 MeshStandardMaterial 克隆 → 原色、粗糙度与法线阶段。角色 0 走原响应，基础材质仍用于其它部件。木、茅草和石材克隆都只改表面，按共享兼容接口保留静态水线剔除。无新增贴图。浏览器记录实际角色、着色器编译标记、属性字节、顶点色、批次几何量及整场绘制计数。[成对渲染实录](render-record.json)记录截图哈希。整场计数随取景和阴影改变，本轮未测帧耗时。

## 水捕获

池岸正午固定相机位置，暂停时钟，持续 12 秒小角度转头，目标为 640 × 348。原版 483 次折射捕获，提交 14490 次调用和 348608631 个三角面。两族候选 481 次折射捕获，提交 14430 次调用和 348086713 个三角面。两组均为 30 次调用/捕获。每次捕获的三角面从 721757 增至 723673，增量 1916，对应 +1780 木架和 +136 池岸，茅草批仍受水线剔除。两组焦散更新次数均为 0。这段采样说明相机驱动的折射提交量，未测正常游玩帧耗时、焦散更新频率或每像素成本。石材实际程序键含 `djc-facility-finish-r1` 与 `club-basin-caustics-v1`，白天图仍可见水下原砖线。

[native](native/) 下的两份 Blender、GLB 和压缩源数据来自游戏实际构造函数，分组保留屋面、竹拱、檩条与檐口，及池底、压顶铺装衬壁、水下坐沿。源数据保留局部原点、实际三角面、法线、线性顶点色与着色坐标/角色，GLB 用 Blender 5.1.2 新场景回读。原点是主亭世界 [38, 0, 55]、池岸世界 [68, 0, 55]，单位为米。GLB 保留顶点色、局部几何、米制 UV 及自定义角色属性。程序着色在游戏中执行，Blender/GLB 预览为顶点色与基础粗糙度。

从仓库根目录复核。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-geometry.test.mjs
node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/djc-pavilion-basin/check.mjs
node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/djc-pavilion-basin/check-contacts.mjs
node tools/world/djc-pavilion-basin/verify-review.mjs
```

本地 QA 配置是 `astro.djc-pavilion-basin.local.config.mjs`。从 `/world/?start=club&craftReview=1&qa=1&quality=balanced` 进入默认主亭。追加 `&djcPavilion=baseline` 回退主亭。池岸默认沿用 bdd9d2e，追加 `&djcBasin=candidate&clubReview=basin` 单独开启池岸候选并直接跳到它的取证机位。
