# G24 向导 L1 候选 · 最终交付（2026-10-21）

**结论：** 一个可用的、带真实骨架和蒙皮的 L1 角色候选，已有 Idle/Walk/Run/Jump/Land 五段 in-place 动作。机器检查大部分通过，有一项接触指标没过（Jump 起跳滑动，见下）。**Fable 和 Bobby 都还没验收**；我自己看图的判断是「比旧占位好、可接入」，不是美术通过。WorldGuide.tsx 和演员接入由主线程负责，本会话没写运行时代码。

## 文件

| 用途 | 路径 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| 运行时最终（Draco） | `public/assets/world/guide/G24.glb` | 299,288 | `d3ccc5919af10f6614e91c3d31d548c6135bb4c0ba29dbaca6da558c0ac89357` |
| 未压缩 skin 证明版 | `tools/world/guide/out/G24_uncompressed.glb` | 455,572 | `0205f6258a031ef4b2d1849087393bbea3728c604f57296a37cda2dcb5bfa22f` |
| 可编辑源 | `tools/world/guide/blend/G24.blend` | | |

**哈希变更说明：** 主线程 motion-r3 测的是 `ed46b73b4b8a…`。之后我按主线程要求核实了腕部，发现手套和袖口确实断开（见「腕部」一节），所以重建了手套。最终版是 `d3ccc5919af1…`，主线程已用它跑过 motion-r4：4/4 通过，超过 10 秒真实键盘操作，接地采样靴底下沉 0。骨架、骨名、clip 名、时长和接口都没变；变化只在手套几何（三角数仍为 2,006）。

## 契约

- 米制，glTF +Y 上，**+X 为前**，+Z 为角色右侧（腰包和青点在右侧，按文字锁）。鞋底 local y=0，根在脚下原点。
- 运行时偏移：父 group 放在 `-(PLAYER_RADIUS + PLAYER_HALF_HEIGHT) = -0.82 m`。
- Clip：`Idle`（2.4 s 循环）、`Walk`（0.6 s 循环，设计速度 1.5 m/s）、`Run`（0.4 s 循环，设计速度 4.2 m/s）、`Jump`（0.5 s 单次，停在空中姿态末帧）、`Land`（0.4 s 单次）。全部 in-place，每秒 60 个关键帧，线性插值。
- 实际尺寸：A-pose rest 为 x×y×z = 0.606×1.708×0.957 m（宽度包括张开的双臂）；Idle 全程包络 0.614×1.697×0.718 m。头盔顶 1.708 m（目标约 1.72）。
- 骨架 18 根，17 根变形骨（root 不变形）。没有 IK/FK 控制 rig：动作是脚本里的解析两段 IK 烘焙成的逐帧变形骨关键帧。**不是 Mixamo。**

## 三角数和材质

- 原生 2,006 = 未压缩 GLB 2,006 = Draco GLB 回读 2,006。方案里声明的预算是 3,000–5,000；实际更低，没有为了凑数加面。
- 基线：c507506 版 WorldActors 里的旧占位（胶囊 + 球 + 3 个盒子），主线程用同版 three 重建后实测为 348 面。新版 2,006 是它的 **5.764 倍**。这个基线是运行时的基本几何体，不是旧 GLB。
- 构成：1 个连续蒙皮的身体壳（躯干、双臂到袖口、双腿到靴内），加 10 个刚性部件，每个部件只挂一根骨头、权重为 1：头盔、面罩、青点、双靴、双手套、腰包、包盖、拉链条。
- 材质：夹克 paint #4E647D、奶白袖 canvas #E6DCCB、裤 accent #3A3F47、手套和靴 accent #4E647D、腰包 accent #E8803A、头盔 metal #E6DCCB（metallic 0）、面罩 glass #4E647D（不透明）、青点 light #4FD1C5（emission 1.5）。原生和两个 GLB 回读后的 base color、roughness、metallic 一致。

## 已执行的检查

| 检查 | 结果 | 状态 |
| --- | --- | --- |
| 权重：非负、无未加权顶点、每点最多 2 个影响、和为 1 | 最大和误差 3.0e-08，左右肢体混合 0 | executed_pass |
| Rest 变形是否为恒等 | 1.2e-07 m | executed_pass |
| 原生拓扑 | boundary 0、非流形 0、零面积 0、11 个壳 | executed_pass |
| rig 类型 | custom-L1（manifest `rig.type`） | — |
| skill `inspect_glb_rig.py`（未压缩版） | 通过：1 个 skin、18 个关节、5 段 clip、最多 2 个影响 | executed_pass |
| skill `inspect_glb_rig.py`（Draco 版） | 报 `Draco compression unsupported` | not_tested（这个工具不能检查 Draco；改用下面的回读对比） |
| 新 Blender 进程回读，关节位置，整帧 / 半帧 | 未压缩 7.2e-07 / 1.8e-05 m；Draco 7.2e-07 / 1.8e-05 m | executed_pass（阈值 1e-4 m） |
| 回读后变形顶点双向最近点 | 未压缩 6.3e-07 m；Draco 3.4e-06 m（18 bit 量化） | executed_pass |
| 回读三角数和材质参数 | 一致，材质 0 项不匹配 | executed_pass |
| 循环首尾位置 | 三段循环 clip 都是 0 | executed_pass |
| 腕部连接（新）| 见下 | executed_pass |

**接触和穿地**（原生，每秒 60 帧全部采样加半帧）。阈值是 rig skill 建议的 smoke gate：穿地不超过身高 0.25%（4.30 mm），漂移不超过身高 1%（17.20 mm）。这不是官方标准。

| clip | 时长 / 帧数 | 设计速度 m/s | 最深穿地 | 触地顶点累计滑动（已加回虚拟根速度） | 鞋底质心漂移 | 身体壳 BVH 重叠候选对（最大） |
| --- | --- | --- | --- | --- | --- | --- |
| Idle | 2.40 s / 144 | 0.0 | 0.00 mm | 0.00 mm | 0.00 mm | 10 |
| Walk | 0.60 s / 36 | 1.5 | 0.57 mm | 7.83 mm | 4.58 mm | 10 |
| Run | 0.40 s / 24 | 4.2 | 3.22 mm | 0.13 mm | 2.66 mm | 20 |
| Jump | 0.50 s / 30 | 0.0 | 0.02 mm | 35.02 mm | 0.00 mm | 12 |
| Land | 0.40 s / 24 | 0.0 | 1.38 mm | 0.00 mm | 0.00 mm | 10 |

- **Run 穿地 3.22 mm，在 4.30 mm 阈值以内：executed_pass，但余量很小。** 出现在快速摆腿的帧之间；从 30 改成 60 关键帧/秒后从 1.0 cm 降到 3.2 mm。这是 clip 本身的数值。运行时动作混合引起的额外下沉由主线程处理；motion-r4 实测靴底下沉为 0。
- **Jump 起跳累计滑动 35.02 mm，超过 17.2 mm 阈值：离线 executed_fail，保留。** 这是原地 clip 里的局部滑移：起跳时脚尖蹬地、脚掌翻转，触地的顶点会换，不是锁定在一点上的 toe roll。但主线程 motion-r4 的实测（`docs/world/quality-v2/playtest/motion-r4/jump-contact-interpretation.json`）显示：运行时物理在按下跳跃时就已起跳，20 个实际 Jump 采样全部离地，靴底最低点比真地面高 25.8 cm。所以这个离线失败不能直接称为游戏中的「滑脚」。
- Walk 滑动 7.83 mm、穿地 0.57 mm；Land 和 Idle 都低于 1.4 mm：executed_pass。
- 循环 clip 首尾速度跳变：Walk 0.54、Run 1.19 m/s/帧，都低于各自 clip 内部的最大值（1.81 / 3.80）。也就是说，循环接缝不比 clip 中段更突兀。没有设定独立阈值。

## 腕部（主线程提出的疑问）

主线程问的是「手套和袖口之间有缝」。我核实后发现**确实断开**：ed46b73 那版的手套根部只碰到袖口圆头，在 Idle rest 姿态下 224 个手套顶点全部在袖子外面，最近的距离 0.77 mm，嵌入长度为 0。这是真实的悬空，不是暗部造成的错觉。

修正：手套根部改为一个半径 4 cm 的节点，向前臂方向埋进袖口 5 cm。最终版 `d3ccc591…` 回读后，按「手套顶点相对身体壳最近面法线的符号」分类：

- Rest：每只手 23 个顶点在袖子内，最深 25.74 mm，沿手骨方向的嵌入长度 17.96 mm。
- 五段 clip 的每一帧都检查过：最少仍有 23 个顶点在袖内，最短嵌入长度 17.96 mm（出现在 Jump_G24@3.L）。手骨相对前臂没有转动，所以嵌入长度在动作中保持不变。
- 近景图：`final/G24_wrist_closeups_final.png`（右腕，Idle、Run、Walk 各取正面和侧面）。近景里看得到深蓝手套从袖口里伸出来，没有可见空隙。
- 有一次失败的尝试：在手套里多加一个中间节点，会让 Skin 修改器产生 28 条 boundary 和 32 条非流形边。这一版没有采用。

## BVH 相交计数是什么意思（不是 0 穿插的证明）

`body_shell_self_crossing_pairs_max` 的含义：把身体壳当前姿态的三角形放进 BVH，统计「包围盒重叠、且不共享顶点的三角形对」的数量。它**不是**精确的三角相交测试，只是 broad-phase 候选；也只看身体壳自身，不看刚性部件。

- **rest 时就有 10 对。** 定位在腋下：A-pose 的上臂根部和躯干侧面在 Skin 修改器生成的网格里本来就贴得很近，相邻的三角包围盒互相重叠。这是候选，不是已确认的穿插。
- 动作中的最大值：Walk 10、Run 20、Jump 12、Land 10。多出来的几对出现在 Run 深屈膝的膝窝和屈肘的肘窝，位置和前面的 skin 定位一致。
- **我没有对这些候选做精确的三角-三角相交确认，所以不能说是 0 穿插，也不能确认是真实穿插。** 近景图和姿态图里没有看到皮肤翻出或破面，但这只是视觉检查。
- 刚性部件和身体之间（`part_pairs_exceeding_rest`）同样是包围盒重叠计数。靴子、头盔、腰包、手套是有意埋进身体的（例如靴筒包住裤脚、头盔扣在领口上），所以 rest 时就有重叠。动作中超过 rest 的部分来自刚性件和摆动的肢体：靴子对小腿、腰包对大腿。腰包已经从髋关节挪到了夹克下摆的后侧，对手臂的重叠已降到 0；对大腿仍有候选，没有精确确认。

## 看图修正记录（三轮）

- r1：头盔下露出一截细脖子；腰包在髋关节上，下垂的手压在包上；拉链条浮在胸前；起跳时手臂僵硬平举。
- r2：Skin 修改器在手部和肩部产生了非流形边，定位后改为：手套做成刚性件，rest 手臂改直（肘部铰链轴在 solve_pose 里显式指定）。脚接触改为以靴子真实顶点为支点，并限制所有靴顶点不低于地面。关键帧从 30/s 提到 60/s。肘部摆动曲线改平滑（原来 `max(0, sin)` 有折角）。权重在剔除小影响后重新归一（误差从 4.9e-4 降到 3e-8）。
- r3：腰包移到下摆后侧；肘、膝的权重过渡加宽；调低 Run 手臂的内收角，前臂不再扫过腰包；起跳时肘部先动；腕部重新连接。

## 证据（全部来自最终 Draco GLB 回读，每个目录的 source.txt 写有 sha256）

- 六视图：`final/G24_sixview_final.png`
- 姿态拼图（侧视和 3/4 视，Walk/Run 各 6 帧，加上 Jump、Land、Idle）：`final/G24_poses_final.png`
- 腕部近景：`final/G24_wrist_closeups_final.png`
- 正常速度回放：`final/video/G24_10s_normal_speed.mp4`，1920×1080，H.264，30 fps，10.9 s，327 帧。顺序为 Idle 2.4 s → Walk 2.4 s → Run 2.4 s → Jump，空中保持 0.4 s → Land → Idle。抽帧拼图：`final/video/frames/contact_2fps.png`。注意：这是原地动作，角色不移动。
- `r1/`、`r2/` 是之前轮次的图，留作对照。
- 机器报告：`tools/world/guide/out/` 下的 qa_native.json、qa_glb_G24.json、qa_glb_G24_uncompressed.json、qa_wrist.json、inspect_glb_rig_*.json、export_hashes.json；汇总在 `manifest.json`。

## 复现

```sh
B=/Users/bobby/Applications/Blender.app/Contents/MacOS/Blender
cd tools/world/guide
$B -b --factory-startup --python-exit-code 1 -P build_guide.py
$B -b blend/G24.blend --python-exit-code 1 -P export_guide.py
$B -b blend/G24.blend --python-exit-code 1 -P qa_guide.py -- native out/qa_native.json
$B -b --factory-startup --python-exit-code 1 -P qa_guide.py -- glb ../../../public/assets/world/guide/G24.glb out/qa_native.json out/qa_glb_G24.json
$B -b --factory-startup --python-exit-code 1 -P qa_wrist.py -- ../../../public/assets/world/guide/G24.glb out/qa_wrist.json
python3 /Users/bobby/Downloads/blender-rig-animation-smoke/scripts/inspect_glb_rig.py out/G24_uncompressed.glb --require-skin --require-animation --output out/inspect_glb_rig_uncompressed.json
$B -b --factory-startup --python-exit-code 1 -P render_guide.py -- ../../../public/assets/world/guide/G24.glb <dir> sixview|poses|wrist|video
python3 write_manifest.py
```

## 未通过 / 未证明 / 未做

- 一项离线 executed_fail：Jump 原地 clip 的局部滑移 3.50 cm（运行时实测此时已离地，见上）。Run 穿地 3.22 mm 小于 4.30 mm 阈值，是 executed_pass。
- 身体壳和刚性件之间的 BVH 候选没有做精确相交确认；没跑 `probe_internal_surfaces.py`。
- 参考图冲突：两张锁定图都把腰包和青点画在**左**侧，文字锁写的是右侧。按指令做在右侧，最终以 Fable 的决定为准（改 `RIGHT` 一个常量即可）。
- 外观差距：参考图的手臂更粗、更圆，袖子更像外套；我的四肢偏细，夹克只在躯干上。头盔没有面罩外缘的凸边。拉链条很细。
- 没做：坐下/起身、上下车、转身、加速和急停的过渡；IK/FK 控制 rig；表情（无脸设计本来也不需要）；Khronos 官方 validator（本机没有）。
- 运行时的动作混合、速度到 timeScale 的映射、黄昏/夜档、实际游戏镜头里的效果，都由主线程负责和验证（motion-r4），本会话没有跑。
- C03–C10 的分件 winding 和剖面由主线程的 static-assembly 补跑，本会话的只读 review（`C03-C10-skill-review.md`）写于那之前。
