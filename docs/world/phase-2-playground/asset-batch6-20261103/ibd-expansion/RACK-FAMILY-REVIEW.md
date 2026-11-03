# 备件棚三架候选

本地 QA 参数为 `ibdSheds=candidate&ibdRack=family-v2`。三架沿用已审单架面向操作区的五段折板、黄色防护条、退后的深色承梁与原宽度连接片。背侧简化为三段折板，厚度和承托回边标高沿用样板。承梁剔除贴合面和被立柱挡住的端面，保留外露翼缘端面。四柱与四底座剔除铺地以下的底面。

每架减少 112 个三角面。三架候选的静态网格为 47,329 面、6,957,565 字节。包含四个备件箱与一组活动测量工装的代表夹具为 74,967 面，上限 75,000 面。每只脚对原铺地作九点射线检查，12 只脚共 108 点均命中标高 0.085 米。三架每层前后承托点均命中，候选与基准的固定碰撞、走面、地面和架区外网格检查一致。

同一次本地 Astro 构建取证。隔离工作区的静态资源覆盖缺少部分 GLB，已从当前提交补到临时预览目录，并以 HTTP 200 的设备及货箱重新拍摄两组对照。隔离预览仍有俱乐部及营地的贴图缺失记录，评审范围限于两处国投机位。基准和候选都使用已通过评审的三棚围护。两处机位分别固定位置和朝向，FOV 50°，曝光 1，DPR 1，画布 1710 × 931。截图前后阴影队列均为空。实机记录确认三架候选为 47,329 面。

| 机位 | 白天基准 | 白天候选 | 夜间基准 | 夜间候选 |
| --- | --- | --- | --- | --- |
| 三架作业视角 | [基准](screenshots/rack-family-control-day.jpg) | [候选](screenshots/rack-family-final-day.jpg) | [基准](screenshots/rack-family-control-night.jpg) | [候选](screenshots/rack-family-final-night.jpg) |
| 中间架原机位 | [基准](screenshots/rack-middle-control-day.jpg) | [候选](screenshots/rack-middle-final-day.jpg) | [基准](screenshots/rack-middle-control-night.jpg) | [候选](screenshots/rack-middle-final-night.jpg) |

三架视角的前景工作台挡住左右架下层，中间架原机位可核对完整三层及梁柱连接。每张原图同目录附运行 JSON。[网格与铺地检查](rack-family-geometry.json)
