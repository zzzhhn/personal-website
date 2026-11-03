# 近侧桥梁与后库木箱样板

基准运行源码 `bcf4f66fc9e72ca4f828956df4704e5bc07b3563`。国投风格沿用 [2026-10-27 校准](../../visual-calibration-20261027/ibd.json) 的黄漆机械、切面结构、暖色作业灯和冷色阴影。三棚围护及三架以已审 QA 模式开启。

| 样板 | 普通机位要读到的结构 | 样板边界 |
| --- | --- | --- |
| 近侧静态桥梁 | 箱体腹板夹在上下翼缘之间，承压板将梁的厚度落到既有柱头 | 一根梁，沿用旧轨面与固定碰撞 |
| 中间架右下木箱 | 横板有实缝，板端在角柱后封合，顶板按自身跨度排布 | 一只静态箱，沿用货位、绑带、标签与叉脚 |

近侧桥梁以箱体腹板、上下翼缘和柱头承压件分开建模。既有暗色轨面标高沿用原值，承压板、封板和加劲肋在柱头相接。木箱以四层 32 毫米横板围合，板缝约 16 毫米，角柱包住正面和侧板的板端。顶板顺自身长向排布。板面的长向色差直接写进游戏顶点颜色，粗糙度和金属度走原静态 `aMat`，沿用原日夜光照及静态合批。两件均使用程序生成的表面，没有新增纹理请求。

| 组合 | 静态三角面 | 索引与顶点属性字节 |
| --- | ---: | ---: |
| 已审三棚及三架 | 47,329 | 6,957,565 |
| 仅桥梁 | 47,417 | 6,970,885 |
| 仅木箱 | 48,297 | 7,118,101 |
| 两件 | 48,385 | 7,131,421 |

含四件备件箱与一套展开量具的现有代表夹具为 74,967 面，加入两件的静态差额后为 76,023 面。两件组合超过现行静态 48,000 面和代表夹具 75,000 面预算。这版用于普通视距样板评审。碰撞、走面和铺地的 SHA-256 与基准相等，见 [网格与接触记录](geometry.json)。

| 样板 | 白天基准 | 白天候选 | 夜间基准 | 夜间候选 |
| --- | --- | --- | --- | --- |
| 近侧桥梁 | [基准](screenshots/beam-baseline-day.jpg) | [候选](screenshots/beam-candidate-day.jpg) | [基准](screenshots/beam-baseline-night.jpg) | [候选](screenshots/beam-candidate-night.jpg) |
| 静态木箱 | [基准](screenshots/crate-baseline-day.jpg) | [候选](screenshots/crate-candidate-day.jpg) | [基准](screenshots/crate-baseline-night.jpg) | [候选](screenshots/crate-candidate-night.jpg) |

每组锁定机位、50° FOV、1710 × 931、DPR 1、曝光 1，记录截图前后的稳定条件。普通视距能辨出梁的连续翼缘和木箱四道横板，梁端封板午夜仍暗，接合靠 [柱头近照](screenshots/beam-joint-day.jpg) 补证。木箱侧端有一部分被货架立柱遮挡，原机位仍能看见板缝转入角柱。板面方向由构造主导，细木纹在午夜较弱。两次隔离构建均补齐国投静态设备和交互箱原资源，场外部分营地及木屋模型请求仍返回 404。

Blender 5.1.2 重新导入 GLB，桥梁 3 个具名网格、132 面，静态箱 5 个具名网格、1,234 面，两者包围盒偏差均为 0。桥梁档案覆盖新梁和承压件，既有柱与轨面可在运行场景查验。程序顶点颜色与 PBR 参数随 GLB 保存，游戏夜间补光属于现场着色。[桥梁 Blend](native/bridge.blend) · [桥梁 GLB](native/bridge.glb) · [木箱 Blend](native/stock-crate.blend) · [木箱 GLB](native/stock-crate.glb) · [源码和模型哈希](SOURCE-SHA256.txt)

本地样板参数为 `ibdSheds=candidate&ibdRack=family-v2&ibdBridge=candidate&ibdStockCrate=candidate`，两个样板各有独立开关。27 项定向测试通过，包含吊具接触、后库及储备箱夹具、几何和货场安全。
