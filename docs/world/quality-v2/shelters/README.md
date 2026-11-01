# 帐篷门洞返工 · quality-v2 r1

旧 C03/C04 的三角形门洞和前门中央立杆不适合现有角色直立进入，不能靠把碰撞门洞改大来掩盖。v2 保持橙色帆布、单脊屋顶、绑绳和总体 footprint，把门改为真实竖边六边开口，帘布收在两侧，门前支撑改双侧柱与屋架。

C04 保持 2.5 m 总高，檐高从 .48 改为 .68 m、脊高从 2.28 改为 2.35 m，为约 1.72 m 向导留出真实净空；C03 总高仍为 3.3 m。各 1020 三角，相对 c507506 的 792 为 1.288×；新增几何用于门边、收束帘布和实际支撑。没有全局细分。

旧生成器与证据保留在 `tools/world/camp/shelters/` 和 `docs/world/camp-slice/shelters/`。本轮源在 `tools/world/camp/shelters-v2/`；public 中同 ID GLB 已替换。最新尺寸、SHA-256、字节数和源路径以 [manifest.json](manifest.json) 为准。

## 已执行

- Blender 4.2.23 LTS：重开源 BLEND、空场景重导入最终 Draco GLB，评估三角与包围盒/材质对比通过，检查细节见 [qa_report.json](qa_report.json)。脚本没有对交付物做事后“修复再通过”。
- 真实查看最终 GLB 的两套彩色六视图：[C03](views/r1/C03_sheet.png)、[C04](views/r1/C04_sheet.png)。可见门中无落地杆，门边和收束帘布接触；侧后墙封闭。门内可见的中心杆位于后墙。
- [24 个 Rapier fixture](collision-fixture.json) 直接读取 GLB 根 extras 的实际帆布壳：物理胶囊与 1.72 m 视觉净空，两者在入口中心及左右偏移 .15 m 都可通过；后墙、左右墙阻挡。它是几何 shape-cast，不是键盘行走或最终运行时的证明。

## 碰撞契约

GLB 根 extras 的 `collisionSchema=camp-tent-shell-v2`、`collisionVertices`、`collisionIndices` 来自同一最终帆布网格，已经按米制、+Y 上、底心原点转换，和渲染共用世界实例矩阵。静态三角网格保留真实门和内腔；完整凸包会把它们封死。

闭合壳包括屋顶、前后/侧墙和收束帘布。绳、缝边、小绑带不作为障碍。布面风动为厘米级视觉形变，门边、檐、脊与支撑必须固定。碰撞不跟着微风每帧重建。

## 复现

在仓库根执行；`BLENDER` 指向已有官方 Blender，不安装依赖。

```sh
BLENDER=/Users/bobby/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" -b --factory-startup --python-exit-code 1 -P tools/world/camp/shelters-v2/build_shelters.py -- C03 C04
"$BLENDER" -b --factory-startup --python-exit-code 1 -P tools/world/camp/shelters-v2/qa_shelters.py -- docs/world/quality-v2/shelters/qa_report.json C03 C04
"$BLENDER" -b --factory-startup -t 2 --python-exit-code 1 -P tools/world/camp/shelters/render_views.py -- C03 docs/world/quality-v2/shelters/views/r1/C03 --glb
"$BLENDER" -b --factory-startup -t 2 --python-exit-code 1 -P tools/world/camp/shelters/render_views.py -- C04 docs/world/quality-v2/shelters/views/r1/C04 --glb
python3 tools/world/camp/shelters/compose_sheets.py docs/world/quality-v2/shelters/views/r1 C03 C04
node tools/world/camp/shelters-v2/collision_smoke.mjs
```

## 未验证

实际键盘进出、角色脚/头净空、相机遮挡、风动与阴影、最终游戏镜头中的观感和 Fable 复审均需集成后确认。旧设计通过已撤回，不用本轮几何检查代替样片验收。
