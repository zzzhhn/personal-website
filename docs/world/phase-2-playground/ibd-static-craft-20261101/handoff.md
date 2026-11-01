# IBD 静态三家族交付

2026-11-02，branch `codex/world-craft-batch3`，起点 `0118dfccc5ab9942adc7b317c09fb0d1f98f66d3`。完成原生建模、portable GLB、14 个既有落点的运行时接入、实际 GLB 重导入与三类几何灰模检查。未运行 browser／build；这两项由 root 串行整合检查。用户尚未验收本批实际运行画面。没有 commit／push。

## 交付文件

- 原生编辑源：[static-craft-editable.blend](static-craft-editable.blend)，2,294,481 bytes，118 个具名可编辑网格件。
- 单一运行包：[static-craft-v1.glb](../../../../public/assets/world/ibd/static-craft/static-craft-v1.glb)，2,962,376 bytes。严格三个 identity 顶层根：`InspectionBench`、`UtilityBench`、`ControlPedestal`；后两根各有两个原生高度子型。
- 可复现脚本：[build.py](../../../../tools/world/ibd-static-craft/build.py)、[run.py](../../../../tools/world/ibd-static-craft/run.py)、[actual baseline capture](../../../../tools/world/ibd-static-craft/capture-baseline.mjs)。完整尺寸和语义边界见 [construction-map.md](construction-map.md)。
- [manifest.json](manifest.json) 记录实际源／fresh 三角形数、每个子型、PNG 尺寸／hash、材质、CC0 来源、原生源／GLB／所有 PNG hash。

## 实际审图

以下为同一 neutral rig、相机、AgX、24 Cycles samples、960×768、最多 3 threads 的图。不是生产截图。

| 家族 | 真实原始 builder | 新几何灰模 | 实际 GLB fresh import |
| --- | --- | --- | --- |
| 检查台 | [before](InspectionBench-before.png) | [clay](InspectionBench-clay.png) | [fresh](InspectionBench-fresh.png) |
| 工具台 | [before](UtilityBench-Tools-before.png) | [clay](UtilityBench-Tools-clay.png) | [fresh](UtilityBench-Tools-fresh.png) |
| 收货台 | [before](UtilityBench-Receiving-before.png) | [clay](UtilityBench-Receiving-clay.png) | [fresh](UtilityBench-Receiving-fresh.png) |
| 标准操作柜 | [before](ControlPedestal-Standard-before.png) | [clay](ControlPedestal-Standard-clay.png) | [fresh](ControlPedestal-Standard-fresh.png) |
| 吊机操作柜 | [before](ControlPedestal-Crane-before.png) | [clay](ControlPedestal-Crane-clay.png) | [fresh](ControlPedestal-Crane-fresh.png) |

实际打开检查了五张 fresh、代表性的三类 clay、三类 before。可见承梁、腿和足板、下方斜撑、分板厚木台面、柜门内缩、五金和折钢边。检查台工作面保持清空，控制柜顶面的按钮／屏幕等由原游戏叠加，本包没有重建。未发现需要改动交互合同的结构问题。离线审图不替代运行时光照／接触和用户接受。

真实 baseline capture 先加载 `git show 0118dfc:.../ibd-yard-geometry.ts`，逐字节比较默认输出所有 attributes 和 index，匹配后提取原外壳的原顶点、法线、色值与物理材质值，未凭记忆重建旧模型。

## 验证与性能边界

`node --experimental-strip-types --test src/components/world/attractions/ibd-static-craft-visual.test.mjs`：**5/5 通过，无 skip**。覆盖原碰撞与 ground／walk／roller 数组逐字节保留、全部原顶点的完整分解、14 处落点、六物理材质合批、贴图借用、销毁幂等、实际 StaticAsset StrictMode cleanup/replay、三个导出根、工作面／柜盖真实高度、边界、木贴图白色因子、实际 GLB 资源拥有关系。

源与 fresh GLB 均为：InspectionBench 2,888 triangles；UtilityBench 两型各 2,024；ControlPedestal 两型各 2,024；所有 nonfinite／degenerate 计数为 0。实际 14 处合计 **30,064 triangles／6 material draws**。原 static 47,669；剔除本批旧外壳 2,200 后保留 45,469；新 static 总计 **75,533 triangles**，实际浏览器性能待 root 测量。没有把默认 builder 的旧三角预算冒充新运行时成本。

`?qa=1&ibdStatic=legacy` 切回原始外壳。约 100 m 内懒加载，115 m 外卸载合批 clone 并回到原外壳；loading／error／远处始终只显示一种外壳。原 fixture 静态夜间采样用于克隆 PBR 材质，不增加实时灯。R3F StrictMode 用 users＋microtask 延迟释放，自有 geometry／material 销毁幂等，源贴图和 loader 缓存不销毁。

六材质为 paint、amber、galvanized、brushed、rubber、wood；前三张程序贴图为 512²，三张木贴图为 1024×512。木图复用获准 crate 的 Poly Haven Coated Pine CC0 派生图，连接 base map 时强制白色 factor，防止重复染色。

Blender 最初在任何导出／渲染前遇到空场景 `world=None`，已定点创建 review world 并重启尚未渲染的任务；随后单进程完成既定 20 张图，没有重跑完成的图。launcher 设 `--python-exit-code 1`，退出后释放自身 PID＋token atomic lock。最终 resource pressure 2，free disk 6.31 GiB；无任务拥有的 Blender／browser／server 留存。
