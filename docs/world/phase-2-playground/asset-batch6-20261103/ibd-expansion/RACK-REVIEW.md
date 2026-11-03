# 备件棚中间货架返修样板

原样板把镀锌色覆写到通用静态材质，再把金属度设到 .68。该材质没有环境反射图，棚内白天直射较少，亮面主要靠被金属度削弱的漫反射。原折边又与梁翼缘在前缘相距约 4 毫米，普通机位容易读成一条线。

返修把层板改为实际带厚度的折板。保留原载货面标高、黄色防护条及货物，镀锌面沿上口斜下、垂直下翻，再向内回折，落在梁上翼缘。退后的深色梁腹板与上下翼缘分别建模，梁端与原宽度连接片贴合。改用通用 PBR 原本消费的顶点粗糙度、金属度与线性色，镀锌取粗糙度 .58、金属度 .29，漆钢取 .56、.13，沿用现有日夜光照，不引入反射贴图或自发光。

运行时只开中间一架。三棚基线 46,693 面，样板 47,017 面，索引与顶点属性增加 51,192 字节。同样板对照图使用同一三棚围护，目视判断只比较货架。固定碰撞、走面和地面与三棚基线逐项相等。

| 光照 | 同围护基准 | 中间单架返修 |
| --- | --- | --- |
| 白天 | [基准](screenshots/rack-shed-control-day.jpg) | [样板](screenshots/rack-v2-day.jpg) |
| 夜间 | [基准](screenshots/rack-shed-control-night.jpg) | [样板](screenshots/rack-v2-night.jpg) |

[连接近照](screenshots/rack-v2-joint-day.jpg) · [第一版白天](screenshots/rack-sample-day.jpg) · [第一版夜间](screenshots/rack-sample-night.jpg)

回边和承梁接触点由游戏构造网格射线核对，梁腹板比折边前缘退后 115 毫米。固定碰撞、走面、地面及中间架范围外顶点属性检查见 [rack-v2-geometry.json](rack-v2-geometry.json)。本地 QA 参数 `ibdSheds=candidate&ibdRack=sample-v2`；单架样板独立于三棚提交。

[Blender 档案](native/ibd-rack-v2.blend) · [GLB](native/ibd-rack-v2.glb) · [源网格](native/ibd-rack-v2.source.json)。以游戏货架构造函数导出整座中间架，Blender 重新导入 5 个具名网格、804 个三角面，包围盒偏差 0 米。
