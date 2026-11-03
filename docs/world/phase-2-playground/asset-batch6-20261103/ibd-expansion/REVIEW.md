# 国投三棚围护

钢卷棚的西侧与后围护、备件棚的东侧与后围护、装运棚的东侧按各自朝向制作。钢卷棚保留较高跨、天车和坡道，备件棚保留蓝色屋面与称重操作区，装运棚保留绿色屋面、通透后侧和车辆出入口。侧墙和后墙用 56 毫米实体折峰，屋板沿坡向排布，长檐的折边、泛水与跨间托件均可单独检查。

| 机位 | 白天基准 | 白天候选 | 夜间基准 | 夜间候选 |
| --- | --- | --- | --- | --- |
| 钢卷棚 | [基准](screenshots/coil-baseline-day.jpg) | [候选](screenshots/coil-candidate-day.jpg) | [基准](screenshots/coil-baseline-night.jpg) | [候选](screenshots/coil-candidate-night.jpg) |
| 备件棚 | [基准](screenshots/parts-baseline-day.jpg) | [候选](screenshots/parts-candidate-day.jpg) | [基准](screenshots/parts-baseline-night.jpg) | [候选](screenshots/parts-candidate-night.jpg) |
| 装运棚 | [基准](screenshots/dispatch-baseline-day.jpg) | [候选](screenshots/dispatch-candidate-day.jpg) | [基准](screenshots/dispatch-baseline-night.jpg) | [候选](screenshots/dispatch-candidate-night.jpg) |

[备件棚东檐口近照](screenshots/eave-candidate-day.jpg)

每张 JPG 同目录有现场 JSON。对照机位使用 50° FOV、固定位置与朝向、DPR 1，保留原有日夜光照与曝光。候选使用实际静态 draw 的 `ibd-industrial-v4-static:ibd-envelope-v2`，把面板、屋面、泛水、框架和内衬编码到一份 Uint8 顶点属性里。压纹及微表面粗糙度由程序生成。游戏档案与贴图请求的新增量均为零，材质仍走同一静态网格 draw。

| 模式 | 静态三角面 | 索引加顶点属性字节数 |
| --- | ---: | ---: |
| 基准 | 45,469 | 6,555,684 |
| 三棚 | 46,693 | 6,857,077 |

扩展增加 1,224 面和 301,393 字节，静态网格上限为 48,000。数字按运行时静态网格统计。包括四个备件箱与一组活动测量工装的既有代表性夹具在启用三棚后为 74,331 面，上限 75,000。对比脚本逐项核对固定碰撞、走面和地面，以及独立设备回退网格，指纹见 [geometry.json](geometry.json)。既有测试 34 项中 33 项通过；滚筒接触测试的固定碰撞数量断言在原提交与本次实现均为 256，测试期待 258。这些图录自货架开关关闭时的 QA 构建，三棚独立交付。实机验收范围为静态场景、原顶灯、牌面和货物可见性，测试另外覆盖角色、碰撞与操作契约。

本地 QA 使用 `astro.ibd-expansion.local.config.mjs`。入口 `/world/?start=ibd&craftReview=1&qa=1&quality=balanced&ibdSheds=candidate`。省略 `ibdSheds=candidate` 看基准。候选仍需 QA 参数开启。

可编辑档案含 [Blender](native/ibd-expansion.blend)、[GLB](native/ibd-expansion.glb) 和 [源网格](native/ibd-expansion.source.json)。Blender 5.1.2 重新导入 GLB，校验 17 个具名网格、4,608 个三角面，包围盒偏差 0 米。档案使用基础 PBR，米制压纹和原有夜间填光在游戏着色器执行。
