> Integration update (2026-10-21): Fable has reviewed and passed all 16 final assets, including the final Draco GLB colour views. Group-local runtime/unreviewed statements below describe the production handoff; current integrated results are recorded in [the camp slice report](../README.md). Bobby has not accepted the sample yet.

# 营地样片 · shelters 组（C03–C06）

2026-10-21，Blender 4.2.23 LTS，模型会话 opus55-fast。r3 是最终轮（上限三轮）。**机器检查全部通过不等于美术通过**；Fable/Bobby 看图验收、运行时黄昏/夜档、碰撞接入都还没做。

## 产物

| ID | GLB（Draco） | 实测 x×y×z 米 | 目标 | 三角（评估后 = GLB 回读） | 相对旧估算 | 实例 |
| --- | --- | --- | --- | --- | --- | --- |
| C03 大帐篷 | `public/assets/world/camp/C03.glb` 14.4 KB | 4.113×3.300×5.419 | 4.2×3.3×5.5 | 792 | 0.79×（≤1k） | 1 |
| C04 小帐篷 | `public/assets/world/camp/C04.glb` 14.4 KB | 3.313×2.500×4.319 | 3.4×2.5×4.4（Fable 改） | 792 | 0.79× | 2 |
| C05 火坑与柴 | `public/assets/world/camp/C05.glb` 11.5 KB | 3.199×0.571×3.199 | 3.2×0.6×3.2 | 576 | 0.58× | 1 |
| C06 原木长凳 | `public/assets/world/camp/C06.glb` 4.8 KB | 0.760×0.600×4.800 | 0.8×0.6×4.8 | 240 | 0.48×（≤500） | 4 |

唯一三角 2,400；按实例同屏 3,912。帐篷 footprint 含绳桩，绳桩距声明边界至少 4 cm。尺寸、三角、材质以 `manifest.json` / `qa_report.json` 为准。

导出契约：米、+Y 上、+X 正面（帐篷门、长凳侧面朝 +X；长凳长轴 +Z）、y=0 接地、根在水平包围盒中心。每个 GLB 只有根 empty `<ID>`（extras: assetId/front/units）和一个按材质分 primitive 的 mesh `<ID>_geo`；无相机/灯/动画/贴图。Draco：level 6，position 20 bit，normal 10 bit，`KHR_draco_mesh_compression` 在 extensionsRequired 中，所有 primitive 均已压缩。

## 复现

```sh
B=/Users/bobby/Applications/Blender.app/Contents/MacOS/Blender
cd tools/world/camp/shelters
$B -b --factory-startup -P build_shelters.py            # 写 blend/<ID>.blend、GLB、ledger_<ID>.json
$B -b --factory-startup -P qa_shelters.py -- ../../../../docs/world/camp-slice/shelters/qa_report.json
$B -b --factory-startup -P render_views.py -- C03 <out>/C03 --glb   # 彩色六视图：空场景 fresh import 最终 Draco GLB，写 source.json（sha256）
$B -b blend/C03.blend -P render_views.py -- C03 <out>/C03_clay clay   # 仅灰模，来源是 native .blend
python3 compose_sheets.py <out> C03 C04 C05 C06
$B -b --factory-startup -P render_overview.py -- <out>/overview_from_glb.png   # 从最终 GLB 回读
python3 write_manifest.py
```

本组脚本自包含；`vendor_inspect_connectivity.py` 是 skill 脚本的原样拷贝。

## 六视图来源

- 彩色 `views/r3/<ID>_sheet.png`：**最终 Draco GLB 在空场景中 fresh import 后渲染**，标题写有 `source=final Draco GLB fresh import <ID>.glb sha256=…`，完整哈希在 `views/r3/<ID>/source.json` 和 manifest `assets[].views`，并与 `glb_sha256` 比对一致。
- 灰模 `<ID>_clay_sheet.png`：来自 native .blend（材质被临时覆盖），不是 GLB 证据。
- `overview_from_glb.png`：四个最终 GLB 回读后的同比例总览。

## QA（r3，针对最终 Draco GLB 的 fresh import）

- 回读三角数与源一致；包围盒最大误差 0.0 m（20 bit 量化误差低于报告精度，声明容差 2 mm）；材质清单一致，materialRole 写在 GLB material extras 中。
- 原生源：min z=0，XY 中心=(0,0)，物体原点都在 (0,0,0)；坐标有限；boundary 边、非流形边、非流形顶点、绕序不一致、负体积、零面积、重复三角均为 0；`Mesh.validate` 在拷贝上不需要修复。
- 壳数（都是有意分件，不是焊接）：C03/C04 53 个封闭壳 = 屋顶、4 面墙、10 条包边 + 脊盖 + 8 条缝线、2 门帘 + 6 条门帘包边 + 2 根系绳、后窗片、地布、脊杆 + 2 立杆 + 2 顶针、4 桩 + 4 桩帽 + 4 拉绳；C05 20 = 12 石 + 灰床 + 5 柴 + 2 引火枝；C06 4 = 座木 + 枝桩 + 2 垫木。分件之间靠埋入/叠压接触（墙顶埋入屋顶 3 cm，座木埋入垫木约 10 cm 等），见 `ledger_<ID>.json`。
- **未证明**：分件之间的穿插和内表面（有意埋入会产生内部面，没跑 winding 探针）、运行时 three 的 Draco 解码（由主会话验证）、碰撞体。

## 看图后的修正（r1→r3）

1. r1：C05 灰床用了契约色板里的石板蓝 #4E647D，中性光下读成一池水。**这是我选的基础材质色，不是环境光污染**；r2 改为派生炭灰 #5B5650（由石材 #8C8276 压暗）。
2. r1：帐篷前后各三根绳桩，正视像栅栏；改为四角各一根，并收进 footprint。
3. r1：火坑柴是平铺的放射辐条；改为参考图那样的 teepee 斜靠，顶端留出 r≈0.15 m 火焰空间，每三块石头有一块用深石色。
4. r1：长凳下的整根八角垫木在正视图像轮子；改为平底半圆垫木。
5. r2 QA：门帘旋开后角点低于地面 2.6 cm，把整顶帐篷抬高了；门帘、包边和桩脚钳到 z≥0 后，帐篷高回到 3.300/2.500。
6. r2 看图：侧面看屋顶是一整块橙色平板；加脊盖和两条沿下垂坡面的缝线（+108 三角）。

## 待主会话/Fable 判断

- 色板外的派生色：帐篷包边 #B9602A（营地橙压暗）、灰床 #5B5650；地布用木干色 #5A4634，role=canvas。如果 Fable 要求只用锁定色，改 `PALETTE` 后重跑即可。
- 参考图里的帐篷是更陡的单脊 A 字，我做的是带矮侧墙的 wall tent（门帘、立杆、绳桩更好读）；如需更贴参考，可以把 `hw` 降到约 0.2。
- 拉绳截面约 3 cm，游戏镜头远景下可能闪烁或看不见，需要在运行时三档缩放里确认。
- 本组没有定义物理碰撞。帐篷 footprint 包含拉绳和桩，不建议直接用包围盒做碰撞。
