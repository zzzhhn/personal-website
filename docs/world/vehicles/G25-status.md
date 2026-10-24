# G25 方正越野 4×4 · L1 r1（2026-10-24）

- 生成：`tools/blender-run.sh vehicles tools/world/vehicles/build_vehicle.py G25 [--render]`（Blender 4.2.23）。产物 `public/assets/world/vehicles/G25.glb`（Draco，84 KB）、`tools/world/vehicles/blend/G25.blend`、`G25-report.json`、`src/components/world/WorldVehicleHulls.json` 的 G25 条目。
- 三角：车身 7,748 + 轮 1,552×4 = 13,956（修改器后 = Draco 全新场景回读，包围盒一致 [-2.04,-1.185,0]–[2.06,1.185,2.267]）。退化面 0、非流形边 0、有限坐标、正体积。规划是 ≤ 11.7k，超 2.3k；最终三车近档合计 38,074，未收回到 30k，实测视角与 LOD 建议见 `FINAL-STATUS.md`。
- 运行时：车身 1 draw call（烘成顶点色＋角色属性，共享着色器）＋四轮 1 InstancedMesh；夜间驾驶 +1 地面光斑。阴影 pass 另计。
- 碰撞：11 个凸包（tub、cabin、四个轮拱块、两侧门槛、前后杠、行李架），质量 0；原两个盒子保留为不碰撞的质量载体，质心下移 0.5 m（规格 §10.3 的机制）。

实测（4335，`?qa=1`，证据 `/Users/bobby/Desktop/3D-personal-world/evidence/vehicles/`）：

| 项 | 旧版（`qaVehicleLegacy=1`） | 新版 |
|---|---|---|
| QA 低柱/树干/墙 × 2/5/10 m/s 轮胎穿入 | 8 cm（10 m/s 三例） | 0；9/9 通过，最大上抬 4.9 cm |
| 地图 G18 树干 / 营地出口灯柱 | — | 穿入 0，上抬 ≤ 4.6 cm；车身先碰，脚本判「body-only」4 例，G16 探针未找到边界 3 例 |
| 28 kg 路障 5 m/s | 车身上抬 4.0 cm | 0.2 cm，路障抬起 22 cm |
| 18 cm 路缘/垫板/桥缝/台阶 × 5/12 m/s | — | 8/8 与旧版一致（上抬差 ≤ 0.4 cm，俯仰不增，不卡停） |
| 操控 A/B | — | 半径 −0.2%，刹车 +0.3%，响应 −0.2%，侧滑 97.8% |
| v4 drive-route 环岛 / 上山返回 | — | 2/2，无固体接触 |

看图：停放、近景（行李架＋备胎）、夜间刹车都看过；轮胎和轮毂读成圆的，前脸圆灯、护杠、门缝、后视镜在默认镜头可辨。未做：粗齿胎侧面文字、拖车钩链；前轮大角度转向时轮胎前缘可伸出轮拱块约 r·sinθ。
