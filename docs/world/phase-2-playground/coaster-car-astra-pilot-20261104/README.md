# 过山车车厢：主 session 单件精修小样

2026-11-04。用户认为上一轮场景提升不明显，要求主 session 亲自精修一件资产并展示成果。本轮只做列车车厢，不扩展其它资产，也不替换 4341。

## 实际变化

| 部件 | 构造与材质 |
| --- | --- |
| 车体 | 连续收底、卷边和内嵌脚踏；铜色清漆外壳与深蓝绿侧板分离，橡胶隔缝解释部件连接 |
| 座椅 | 承托盘、带冠形的软垫、侧撑、腰垫、包边和连续缝线；细皮纹由独立法线/粗糙度表达 |
| 安全扶手 | 弯管、铰轴座、握把包胶、锁定指示，金属和橡胶分别响应环境光 |
| 轮组 | 轮胎侧壁、内凹轮毂、同心加工边、轴承盖和紧固件 |

旧版经过 `CoasterBatch` 合并，UV 被移除；`WorldIntentSurface` 的反射条件还会把涂装和橡胶角色的环境反射置零。新小样保留 GLB 的法线、UV、8 种物理材质与 clearcoat，复用现有 PMREM 环境缓存，避免把新资产重新压回旧着色器。

本轮已修正首版发现的侧面编号反向与脚踏共面问题。夜间使用已有家具适配器的 0.5 环境响应下限；全场光源、曝光、色调映射和画质未改。

## 交付

- `coaster-car-editable.blend`：138 个具名可编辑部件，米制；Blender 原生 Z 向上。
- `coaster-car.glb`：+X 向前、+Y 向上，21,772 三角面，8 个材质批次，1,381,836 字节。
- 三张原创 512px 物理材质贴图随 GLB 内嵌，不是扫描材质。
- `index.html`：三组未后期处理的真实网页截图滑杆对照。
- `export-check.json`：索引、有限坐标、法线、UV、外包络与便携材质验证。

## 验证边界

正式构建通过；浏览器没有捕获到 error。截图包含固定机位、FOV 50、1710×931、DPR 1、balanced、晴天、曝光 1，正午 720 或深夜 0 分钟；每张图有单独的运行读回 JSON。主 session 已实际查看日景近景、常规距离与夜景。

这是视觉校准小样，尚未经过用户视觉验收或整列车性能验收。单车从旧版 2,466 面增至 21,772 面，材质批次由 1 增至 8；相同近景的渲染提交量也增加。没有据此声称性能通过，没有更改项目现有预算门槛。正式集成前须制作远景 LOD，验证乘坐姿态、运动中的材质和实际帧时间。

六个 `COASTER_CAR_PANELS`、列车根变换、座面高度 .72m、背板最高 1.475m、负 Z 登车开口、物理与上下车代码保持原样。鼻部标牌凸出旧外包络约 9mm，是视觉表面，不是碰撞体。

## 复现

先运行资源检查，按资源状态串行执行。原生生产脚本：`tools/world/coaster-car-pilot/build.py`；导出验证：`tools/world/coaster-car-pilot/verify.py`。使用已安装 Blender 5.1.2 的 background、factory-startup、2 threads，并设置 150 秒任务超时。

真实网页 A/B 由 `tools/world/coaster-car-pilot/review.config.mjs` 注入。它只替换列车内部视觉节点，原版与候选共用其它源文件。生产配置不会挂载此小样。构建前需要可用的公共资产目录；本次借用已验证的 4341 只读资产根，不复制完整历史资产。

```sh
COASTER_REVIEW_SOURCE=astra-car-pilot-v5 COASTER_CRAFT_EMPTY_PUBLIC=/tmp/bobby-car-pilot-empty-public npm run build -- --config tools/world/coaster-car-pilot/review.config.mjs --outDir /tmp/bobby-car-pilot-review-build
```

基线运行版本：`45ce8e4322f03db1ffe5ec43016c774771c8cc55`。日景图片初次由 v4 审阅构建记录，v5 只改变夜间环境强度，日景响应和几何完全相同；图片的实际来源以各自 JSON 为准。
