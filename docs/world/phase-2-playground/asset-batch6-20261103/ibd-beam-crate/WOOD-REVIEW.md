# 单只静态木箱方向纹理复验

源版本 `32bec60`。同一次本地构建只切换 `ibdStockCrate=candidate` 与 `ibdStockCrate=grain-v2`，桥梁开关关闭，三棚和三架使用相同背景。普通作业机位固定，画布 1710 × 931，FOV 50°，DPR 1，曝光 1，balanced，分别固定 12:00 和 00:00。截图前后阴影队列均为空，加载已完成。国投静态设备和交互箱原资源返回 200／304，候选页未见控制台错误。

| 时间 | 同构造旧材质 | 方向木纹 |
| --- | --- | --- |
| 白天 | [原图](screenshots/wood-reference-day.jpg) | [原图](screenshots/wood-grain-day.jpg) |
| 夜间 | [原图](screenshots/wood-reference-night.jpg) | [原图](screenshots/wood-grain-night.jpg) |

白天能在板缝之间分辨横向木纹，角柱纹理沿竖向，叉脚和上沿可见较密端纹。夜间正面仍有长向纹理和板间层次，侧面因光照较暗又被架柱部分遮挡，木纹弱于正面。日景端纹比板面醒目，普通机位已能判断方向。四张原图均附同名 JSON。

实际静态材质键为 `ibd-industrial-v4-static:ibd-envelope-v2:stock-wood-v2`，两张候选图均读回木纹着色器已编译。木纹角色 7 至 12 仅在目标箱，1,920 个顶点，场地局部包围盒为 [13.4, 0.37, −23.9] 至 [15.6, 2.108, −22.1] 米。旧材质记录没有木纹角色。沿用原顶点属性和静态材质，少 210 个三角面与 33,180 字节。候选的 48,087 静态面仍超过现行 48,000 面预算。箱外属性、固定碰撞、走面和铺地由候选专用脚本逐项核对。上一轮的 27 项测试属于旧路径回归。[角色与几何检查](wood-consumption-preflight.json)

已有木箱 Blend／GLB 仍是上一版的基础 PBR 档案。方向纹理在游戏片元着色器执行，实际纹理由 [运行源](../../../../../src/components/world/attractions/ibd-stock-wood-material.ts) 和本组 WebGL 图证说明。[证据哈希](WOOD-SHA256.txt)
