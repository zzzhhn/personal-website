# Bench／bin 原生导出

2026-11-03，使用 Blender 5.1.2，在共享重任务锁下串行执行 `build_bench_bin.py`。输入来自当前实际 TS Builder 提取数据，不从浏览器截图反推几何。

| 族 | 三角数 | fresh-import 包围盒最大偏差 | 命名网格 | 内嵌图片 |
| --- | ---: | ---: | ---: | ---: |
| bench | 1328 | 0 | 11 | 3 |
| bin | 2180 | 0 | 4 | 0 |

可编辑 `.blend` 位于 `tools/world/facility-craft/batch6/native-bench-bin/`；portable GLB 和逐族导出报告位于 `public/assets/world/craft-batch6-bench-bin/`。木材包含 COLOR_0、制造 UV、共享颜色／粗糙度／法线图，法线强度 .18。bin 的内腔挡板继续使用原暗哑材料。

运行时继续使用原程序几何与 R2 共享 surface pack，本目录的 portable 不被游戏加载。原生／portable 的静态 PBR 档案不代表游戏的夜间系数、环境缓存、淡出或轻微漆面变化。fresh-import 只验证导出结构和边界，普通视角实拍单独归档。

两族 source JSON SHA-256 分别为 `f33028270ef0fd10e18463f887b1fec3e6b3f78922c1d8cbe5012696a4862ea2`、`c01617f8e1883c748df7e0ec7c039ea2683a960b55330e0aad5a03e954ddce27`。
