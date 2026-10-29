# v4 可乘坐轨道样板

2026-10-28，基于 `53b6cf6`。用户明确批准重新校准的 v4 图后，完成连续轨道与独立乘坐样板。当前 4341 保留 v14，本页不表示最终园区已完成。

## 当前形体

- 实际轨道长 1,898.49 m，世界坐标水平包络约 212.44 × 249.74 m，最高 y=85.34 m。站台坐标、回站方向与原路线保持一致。
- 首降最大倾角约 107.49°，确实向内扣过垂直方向。两个完整立环分开布置，避免总览重叠。巨型立环高约 50 m，第二立环倾斜，另含眼镜蛇回转、高位倒挂、连续双螺旋和贴水桶滚。
- 七个具名轨道元素产生八次倒置，双螺旋包含两次。由车体上轴跨入倒置区的实际四元数检测，非相机翻转或标签计数。内扣首降的短暂负上轴不算额外一次完整倒置。
- 全程约 111.73 s，最高速度 33.26 m/s，首降后进入大立环前的低位段最低 27.28 m/s，超过最初 7.64 m/s 的三倍。没有把更长路线强塞进旧 70 s。当前是受能量上界、曲率、翻转角速度及加减速约束的运动学样板，不是完整刚体列车动力学仿真。

## 发现并修正

1. 内扣首降跨过垂直方向时，世界竖直参照会出现 180° 翻跳。改用连续运输的坐标架，同时用于轨道、车体、座位及第一人称。
2. 第一版连接轨靠首降只有约 2.4 m，第二立环移位又带来新交叉。通过改路线、错开高程消除冲突。最终 2,400 点采样，非邻近轨道中心最小约 8.81 m，头部到另一轨道中心最小约 6.92 m。排除了沿轨距离小于 15 m 的正常相邻轨段；不是对全岛建筑或最终模型的认证。
3. 大立环顶端默认跟车镜头隔着轨道主梁看人物。首降及倒置段改从车体侧面观察，保持世界地平线。每 0.2 s 对真实样板网格检查默认跟车视线和第一人称前方 2 m，无阻挡。任意自由旋转后的所有角度仍未穷举。
4. 支架筛选从两条粗略中心线改为实际车厢角点和乘员头部扫掠。细化后再次通过 3,600 个轨道位置的接触检查。当前支架是空间验证构件，未完成参考图中的承重桁架与细节设计。

## 复现

在集成 checkout 内运行：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/attractions/coaster-thrill.test.mjs src/components/world/attractions/attraction-camera.test.mjs
node tools/world/coaster-thrill-sample.mjs /tmp/bobby-coaster-thrill-v4 --serve
```

临时入口 `http://127.0.0.1:4343/`。工具只构建一个独立静态包并监听本机，结束时停止服务；没有加入 Astro 的公开页面或 4341 的正式入口。复现前按用户规则检查资源及端口占用。

12 项定向回归通过，无跳过。严格 TypeScript 覆盖样板及其导入闭包，0 诊断。Native Node 的首次 strip-only 测试不支持参数属性，因此使用项目现有 TS loader；该失败未计作测试通过。

样板页面支持播放／暂停、总览、跟车、第一人称、鼠标自由观察、轨道段定位及时间滑块。暂停后按事件渲染，隐藏页停止播放，离开页释放几何、材质、OrbitControls 和 WebGLRenderer。没有轮询、后台 worker、音频或实时反射。

## 证据与边界

- [测量与源码散列](visual-calibration-20261027/runtime/coaster-v4-spatial-audit.json)
- [实际形体总览](visual-calibration-20261027/runtime/coaster-v4-spatial-overview.png)
- [塔顶第一人称](visual-calibration-20261027/runtime/coaster-v4-spatial-crest.png)
- [立环顶端第一人称](visual-calibration-20261027/runtime/coaster-v4-spatial-inverted-first.png)
- [原跟车遮挡](visual-calibration-20261027/runtime/coaster-v4-spatial-inverted-train-before.png)与[修正后实际倒挂车体](visual-calibration-20261027/runtime/coaster-v4-spatial-inverted-train-fixed.png)
- [手动旋转观察](visual-calibration-20261027/runtime/coaster-v4-spatial-orbit.png)
- [完整乘坐结束](visual-calibration-20261027/runtime/coaster-v4-spatial-complete.png)与[浏览器样板记录](visual-calibration-20261027/runtime/coaster-v4-browser-sample.json)

Chrome 实际从车站播放至 111.7 s，途中未拖动时间轴或跳段；结束时速度为 0，按钮恢复「开始乘坐」。本次页面 error 日志为空。第一人称倒置和跟车手动转动均另行操作并查看截图。这证明独立样板可运行，未覆盖真实角色、岛上碰撞和上下车链路。临时 4343 服务已停止，原标签恢复为暂停的 4341 v14。

浏览器局部样板共 10 draw calls、73,682 triangles。一次运行的前 30 帧预热后采 180 帧，帧间隔 p50／p95 为 16.7／18.3 ms；长帧保留在统计中，后台停顿不记作游戏推进。这不是整岛帧率或全路线性能测量。当前地面是占位平面，人物是座位净空样偶，夜间按钮只有照度预览，均不冒充最终资产。

下一步必须完成：把新轨道接入真实角色和上下车链路；扩展海岸与碰撞边界；按 v4 做主塔和立环桁架样板；把实体受光与路径照明落到模型；实际整岛日夜同机位对照和性能验证。完成这些之前不推广 4341。音乐、国投园区及其他 Goal 条目继续保留。
