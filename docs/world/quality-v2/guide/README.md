# G24 向导 L1 候选 · A6/A2 返工后的最终交付（2026-10-21 r5）

**结论：** 这一版修了 Fable 返工单里的两项，A6（连续身体壳自交）和 A2（夹克下摆、靴子造型），已替换运行时文件。全部检查都对最终哈希 `73aa0bb6…` 重新跑过，所有证据图和视频也都从这个文件重新导入后渲染。离线仍有一项不通过：Jump 起跳局部滑移，保留 executed_fail。**Fable 和 Bobby 都还没验收**；造型对不对齐锁图，要由他们判。我只用了 G24 相关目录，没改运行时代码，没提交。

## 文件

| 用途 | 路径 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| 运行时最终（Draco，18 bit 位置量化） | `public/assets/world/guide/G24.glb` | 311,684 | `73aa0bb63b2e7ba5dfea4237bcfa361343fc2028626a65265d1d1eec10162bf7` |
| 未压缩 skin 证明版 | `tools/world/guide/out/G24_uncompressed.glb` | 486,056 | `2f2823e9efeac2b6728e2d6848c8277dd4c77c37f39dbf9bd552a8f79e201853` |
| 可编辑源 | `tools/world/guide/blend/G24.blend` | | |

**哈希链：** r3 `d3ccc591…`（A6 失败）→ r4 `49bd64ff…`（A6 修复里程碑，A2 未完成）→ r5 `73aa0bb6…`（当前）。旧文件备份在 `tools/world/guide/out/G24_d3ccc591_final_backup.glb` 和 `G24_49bd64ff_final_backup.glb`，r4 的源和 blend 在 `out/build_guide_49bd64ff_released.py`、`out/G24_49bd64ff_native.blend`。中间候选只导出到 `out/G24_candidate*.glb`，跑完复核才替换 final。

**接口没变**：骨架 18 根、骨名、5 个 clip 名和时长、契约、`RIGHT=-1`（腰包和青点在角色右侧，即 glTF +Z）都和 r3 相同。三角数 2,006 → 1,978。

## 契约

- 米制，glTF +Y 上，**+X 为前**，+Z 为角色右侧（腰包和青点在右侧，按文字锁）。鞋底 local y=0，根在脚下原点。
- 运行时偏移：父 group 放在 `-(PLAYER_RADIUS + PLAYER_HALF_HEIGHT) = -0.82 m`。
- Clip：`Idle`（2.4 s 循环）、`Walk`（0.6 s 循环，设计速度 1.5 m/s）、`Run`（0.4 s 循环，设计速度 4.2 m/s）、`Jump`（0.5 s 单次，停在空中姿态末帧）、`Land`（0.4 s 单次）。全部 in-place，每秒 60 个关键帧，线性插值。
- 实际尺寸：A-pose rest 为 x×y×z = 0.606×1.708×1.007 m（宽度包括张开的双臂；r4 肩宽 +2.5 cm 前是 0.957）；Idle 全程包络 0.614×1.697×0.768 m。头盔顶 1.708 m（目标约 1.72）。
- 骨架 18 根，17 根变形骨（root 不变形）。没有 IK/FK 控制 rig：动作是脚本里的解析两段 IK 烘焙成的逐帧变形骨关键帧。**不是 Mixamo。**

## 三角数和材质

- 原生 1,978 = 未压缩 GLB 1,978 = Draco GLB 回读 1,978。r3 是 2,006。r4 改对称三角化后是 2,098，r5 换成八边形靴子后降到 1,978，夹克下摆切出的一圈边又加回少量面。方案声明的预算是 3,000–5,000；实际更低，没有为了凑数加面。
- 基线：c507506 版 WorldActors 的旧占位（胶囊 + 球 + 3 个盒子），主线程实测 348 面。新版 1,978 是它的 **5.684 倍**。
- 构成没变：1 个连续蒙皮的身体壳，加 10 个刚性部件（头盔、面罩、青点、双靴、双手套、腰包、包盖、拉链条），每个部件只挂一根骨头、权重为 1。
- 材质没变（夹克 #4E647D、袖 #E6DCCB、裤 #3A3F47、手套和靴 #4E647D、腰包 #E8803A、头盔 #E6DCCB、面罩 #4E647D、青点 #4FD1C5）。靴底那一圈用现有的裤色材质，没有加新颜色。原生和两个 GLB 回读后材质 0 项不匹配。

## A2：外形对照锁图

对照图：`final/G24_A2_vs_lock.png`。左起依次是锁图正面（`bobby-3d-world/art-lock/round3-lock/guide-ortho.png`）、G24 正面、锁图侧面、G24 右侧面。G24 是 A-pose，锁图是 T-pose，所以手臂位置不同。

- **夹克下摆**：r3/r4 只按三角面的中心高度分配材质，下摆就沿着原有的三角边走，正面看成 V 形或锯齿。r5 改成在几何上加一道水平切线：在躯干和髋部这一圈面上，用 `bisect_plane` 在 z=0.66 m 切出一圈真正的水平边（`HEM_Z`、`HEM_SNAP=8 mm`，离平面 8 mm 以内的顶点并到切线上，避免细长三角），再按面在线上方还是下方分配夹克和裤子。正面、背面、侧面的下摆都是一条平直的线。切线高度试过 0.655、0.66、0.665、0.69、0.70、0.72 m，配合不同的吸附距离和切分范围。0.665 和「0.69 + 8 mm」这两组会在 Run/Jump 时让髋部自交，所以没用；最后选 0.66，因为它最接近锁图里夹克下沿在胯上方的位置。
- **靴子**：r4 靴子是用 Skin 修改器沿五个节点生成的，侧面是一条弯的 C 形，鞋头是圆的。r5 改成：靴筒是八边形柱体（外接半径 9.5 cm），顶口在 `BOOT_TOP=0.232 m` 平切；鞋头是一个导了 2.4 cm 倒角的盒子，前伸到 x=+0.145 m，比靴筒矮。两者用 EXACT 布尔并成**一个封闭壳**，平底，底部 1.8 cm 是深色鞋底带。侧面能看到竖直的靴筒和前伸的矮鞋头，和锁图的截面一致。靴子仍然整体刚性挂在 foot 骨上。
- **我看到的、仍和锁图不同的地方**（没有修，如实列出）：锁图的夹克更长、下摆更低（大约到胯下），也更宽，像外套；锁图手臂更粗，袖子是夹克的一部分；锁图肩上有一个环形徽章；锁图的头盔面罩是一块向前凸出的厚板。这些属于之前已经记录的外观差距，不在这次 A2 返工单里。

## A6：自交和跨部件关系（按 Fable 返工单的三类关系）

报告都在 `final/a6/`，每份 JSON 里写着来源文件的 sha256。采样：rest，加上每个 clip 的每个整帧和半帧，一共 522 个姿态。

### 方法，以及对旧 README 的更正

旧 README 说 `BVHTree.overlap` 只做包围盒 broad-phase，这**是错的**。在 Blender 4.2.23 里，它的回调（`mathutils_bvhtree.cc` 第 485–513 行，`py_bvhtree_overlap_cb`）会对每个候选对调用 `isect_tri_tri_v3`，并丢掉共享两个及以上顶点指针的对。所以 r3 报的 10/20 对是「不共享任何顶点、而且三角形确实相交」的对，是真实的穿插，不只是候选。按三角化后的旧口径重算 r3 `d3ccc591`：rest 16、Run 34、Jump 22（主线程 strict 口径：native 16/34/22，Draco 回读 16/41/23）。旧表里按多边形去重的 10/20 和三角化口径**不能直接比较**。

现在的判定（`tools/world/guide/selfx_core.py`，和主线程 `guide_intersections.py --strict-adjacency` 一致）：
- 共享一条边的两个三角形：排除（相邻面本来就在那条边上相交）。
- 共享一个顶点：只有当所有独立见证点都在离这个顶点 1e-5 m 以内，或者精确有理数判定证明交集只有这个顶点时，才排除。精确判定沿用主线程的方法：两个平面的交线经过共享顶点，把交线方向用各自三角形的两条边向量表示，用 `Fraction` 精确计算实际的浮点坐标；如果在两个三角形里对应的射线没有重合，交集就只有这一个点。共面或退化的情况返回 unresolved，按失败计。这一步没有放大任何容差。在 GLB 回读时，共享顶点的接缝副本先对齐到焊接后的代表点（同一个源顶点，Draco 副本之间差不到 1 µm）。
- 不共享顶点：只要有见证点就算穿插。没有见证点（共面）记为 `no_witness`，同样按失败计。
- GLB 回读后用 KD 树按 5e-5 m 焊接接缝。断言最大的壳带有 pelvis 权重，确认它是身体壳。

### fixed-continuous：身体壳和每个独立闭壳自身

| 对象 | 采样 | 严格穿插 / 无见证 | 用精确判定排除的「只交于共享顶点」对（522 个姿态累计） |
| --- | --- | --- | --- |
| native `G24.blend` | 522 | **0 / 0**（所有 clip、所有壳） | 129 |
| 未压缩 GLB `2f2823e9…` | 522 | **0 / 0** | 225 |
| Draco GLB `73aa0bb6…` | 522 | **0 / 0** | 27 |
| 主线程 `guide_intersections.py --strict-adjacency --all-shells`（独立复核） | 每个文件 rest 加 521 个动作姿态 | native、未压缩、Draco 都是 **0**（rest 和每个 clip 的 raw/confirmed 都是 0） | 每个 clip 最多 1–3 对 |

旧的「排除所有共享顶点的对」口径（legacy）在三个文件上也都是 0。

为了到 0 改了什么（r4，现在的 r5 继承）：
- 腋下：肩关节 `SH_Y` 从 0.185 加宽到 0.21。A-pose 时上臂根部原本折进胸侧皮肤，rest 就有 16 对穿插。
- 腋下侧面：最近骨是上臂、但位于 z<0.95、|y|<0.185 的顶点，改为只跟躯干骨。
- 髋和胯：胯中线 |y|<5 cm 的条带大部分权重给 pelvis；胯上方 z>0.64 的大腿顶点只保留 20% 大腿权重，其余渐变给 pelvis。膝节点半径减到 0.085，大腿和小腿的权重过渡宽度改为 0.12。
- 三角化：每个四边形按它的镜像对应面选同一条对角线（`DIAGONAL_RULE='short'`），左右完全对称（原来有 372 条边不对称），而且三角化写进源网格里，native 和 GLB 的折法一致。
- Run 动作：抬脚高度 −3 cm，骨盆 +1.5 cm，前倾从骨盆移到脊柱。速度、步频、步幅、手臂摆幅都没变。
- r5 下摆切线：在 6 组切线参数里选了 native 和两种 GLB 都为 0 的一组（见 A2）。
- 曾经试过、没采用的：Subsurf 2 级（褶皱更多）；下摆做成几何凸边或加一圈边环（都会在 Run 时折进大腿）。

### embedded-distinct：有意嵌入的关系表

下限是测量之前按设计意图写进 `tools/world/guide/qa_relations.py` 的 `RELATIONS`，manifest 的 `a6.relation_table` 里也有一份。**埋入深度**取两者的较大值：嵌入件表面点埋进宿主闭壳的最大深度，和宿主表面点埋进嵌入件的最大深度。用后者是因为平面贴在凸面上时，是宿主鼓进嵌入件，而不是嵌入件的角插进宿主。**露出**是嵌入件在宿主外的最远距离。表面点包括顶点，以及每个靠近对方的三角形上 15 个重心网格点。判断内外用最近面法线的符号。下表是 Draco final 的结果，522 个姿态里的最小值；native 和未压缩版的结果相同或更好。

| 关系 | 宿主 | 最小埋入 / 声明下限 | 最小露出 / 声明下限 | 结果 |
| --- | --- | --- | --- | --- |
| 头盔 / 领口 | 头盔 | 22.3 / 10 mm（Land@11） | 88.3 / 10 mm | 通过 |
| 右靴 / 裤脚 | 右靴 | 53.9 / 10 mm（Run@12） | 125.1 / 50 mm | 通过 |
| 左靴 / 裤脚 | 左靴 | 53.9 / 10 mm（Run@0） | 125.1 / 50 mm | 通过 |
| 右手套 / 袖口 | 前臂和手部皮肤 | 25.7 / 10 mm | 71.1 / 50 mm | 通过 |
| 左手套 / 袖口 | 同上 | 25.7 / 10 mm | 71.1 / 50 mm | 通过 |
| 腰包 / 夹克 | pelvis、spine 皮肤 | 12.4 / 3 mm | 75.5 / 30 mm | 通过 |
| 包盖 / 夹克 | 同上 | 6.9 / 2 mm（Run@11） | 86.4 / 30 mm | 通过 |
| 包盖 / 腰包 | 腰包 | 35.3 / 2 mm | 15.6 / 3 mm | 通过 |
| 拉链条 / 胸口 | 躯干皮肤 | 14.8 / 2 mm（Land@5） | 21.9 / 3 mm | 通过 |
| 面罩 / 头盔 | 头盔 | 20.8 / 5 mm | 20.5 / 5 mm | 通过 |
| 青点 / 头盔 | 头盔 | 7.9 / 5 mm | 35.7 / 10 mm | 通过 |

这一项不是一开始就过的。r4 时包盖背面只比包身背面高出 3.5 mm，碰到夹克时只是三角面相交、实际嵌入约 0 mm，在 Idle/Walk/Run 的很多帧里低于 2 mm。修法是把包盖背面往里移 4 mm，正面位置不动。同一批检查也发现我最初的「按三角形三个顶点的主骨」给身体三角形分区，把胸前拉链和一个大的胸部三角形判成了「拉链 / 上臂」。改成按交点处插值后的权重分区之后，这对属于拉链 / 胸口。

### 非预期穿插：必须为 0

凡是不在上面关系表里的跨壳相交都算非预期，包括手 vs 腰包、手 vs 躯干、腿穿出夹克或裤子外表面、靴 vs 自己裤脚以外的任何部位、头盔 vs 肩，以及手臂和腿 vs 腰包。**结果**：native、未压缩、Draco 三个文件，522 个姿态里都是 **0**。跨壳无见证（共面）各有 1 个样本（native 是 Idle@94，未压缩是 Idle@22.5），都是「面罩 / 头盔」，属于声明的嵌入关系，不是非预期；Draco 版是 0。

### 极限姿态近景

`final/G24_a6_extremes_final.png`：腋下、髋、膝在 Run（以及膝在 Jump、Land）的最大屈曲帧，每处取两个角度。帧是从 GLB 回读后按骨间夹角挑的，每张图的角度和时间写在 `final/extremes/extremes.json` 里。图里膝窝和髋前有皮肤压扁的折痕，但没有翻出或破面；数值结论以上面的检查为准。

## 已执行的其他检查（最终文件）

| 检查 | 结果 | 状态 |
| --- | --- | --- |
| 权重：非负、无未加权顶点、每点最多 2 个影响、和为 1 | 1,011 个顶点，最大和误差 3.0e-08，左右混合 0 | executed_pass |
| Rest 变形是否为恒等 | 1.5e-07 m | executed_pass |
| 原生拓扑 | boundary 0、非流形 0、零面积 0、11 个壳 | executed_pass |
| skill `inspect_glb_rig.py`（未压缩） | 通过：1 个 skin、5 段 clip、0 个错误 | executed_pass |
| skill `inspect_glb_rig.py`（Draco） | 不支持 Draco | not_tested（改用下面的回读对比） |
| 回读关节位置，整帧 / 半帧 | 未压缩和 Draco 都是 7.2e-07 / 1.9e-05 m | executed_pass（阈值 1e-4 m） |
| 回读变形顶点双向最近点 | 未压缩 8.0e-07 m，Draco 1.3e-06 m | executed_pass |
| 回读三角数和材质 | 1,978，0 项不匹配 | executed_pass |
| 循环首尾位置 | 三段循环 clip 都是 0 | executed_pass |
| 腕部（`qa_wrist.py`，Draco 回读，每一帧） | 每只手最少 23 个顶点在袖内，最深 25.7 mm，最短嵌入 17.96 mm | executed_pass |

**接触和穿地**（原生，每秒 60 帧全部采样加半帧；阈值是 rig skill 的 smoke gate，不是官方标准：穿地 4.30 mm，漂移 17.2 mm）。r3 的值放在括号里对比。

| clip | 最深穿地 | 触地顶点累计滑动 | 鞋底质心漂移 |
| --- | --- | --- | --- |
| Idle | 0.00 mm | 0.00 mm | 0.00 mm |
| Walk | 0.56 mm（0.57） | 7.88 mm（7.83） | 12.76 mm（4.58） |
| Run | 2.63 mm（3.22） | 0.13 mm（0.13） | 7.41 mm（2.66） |
| Jump | 0.12 mm（0.02） | **35.85 mm（35.02）** | 0.00 mm |
| Land | 1.38 mm（1.38） | 0.00 mm | 0.00 mm |

- 鞋底质心漂移变大，是因为新靴子的平底在脚跟着地和脚尖离地时，触地面积移动得更明显；仍在 17.2 mm 以内：executed_pass。
- **Jump 起跳局部滑移 35.85 mm：离线 executed_fail，保留，没有改阈值，也没有删检测。** r5 的平底鞋头一开始让两个鞋底顶点多贴地 4 帧，滑移升到 75.4 mm。我把起跳中间姿态的踝高加了 1 cm（`J1` 从 `ANKLE_Z+0.05` 改到 `+0.06`），只改这一个参数，降回 r3/r4 的水平。主线程 motion-r4 的运行时实测是：按下跳跃时物理已经起跳，20 个 Jump 采样全部离地。这个解释针对 r3 文件，新文件的运行时没有复测。
- 新靴子的 heel/toe 支点落在真实顶点上：heel x=−0.096、toe x=0.131，鞋底 x 范围 −0.096–0.145 m（相对踝关节），记录在 armature 的 `bootLandmarks`。

## 腕部（主线程提出的疑问）

主线程问的是「手套和袖口之间有缝」。我核实后发现**确实断开**：ed46b73 那版的手套根部只碰到袖口圆头，在 Idle rest 姿态下 224 个手套顶点全部在袖子外面，最近的距离 0.77 mm，嵌入长度为 0。这是真实的悬空，不是暗部造成的错觉。

修正：手套根部改为一个半径 4 cm 的节点，向前臂方向埋进袖口 5 cm。r3 `d3ccc591…` 时修好；当前最终版 `73aa0bb6…` 回读复测，按「手套顶点相对身体壳最近面法线的符号」分类：

- Rest：每只手 23 个顶点在袖子内，最深 25.74 mm，沿手骨方向的嵌入长度 17.96 mm。
- 五段 clip 的每一帧都检查过：最少仍有 23 个顶点在袖内，最短嵌入长度 17.96 mm（出现在 Walk_G24@12.R）。手骨相对前臂没有转动，所以嵌入长度在动作中保持不变。
- 近景图：`final/G24_wrist_closeups_final.png`（右腕，Idle、Run、Walk 各取正面和侧面）。近景里看得到深蓝手套从袖口里伸出来，没有可见空隙。
- 有一次失败的尝试：在手套里多加一个中间节点，会让 Skin 修改器产生 28 条 boundary 和 32 条非流形边。这一版没有采用。

## 看图修正记录（三轮）

- r1：头盔下露出一截细脖子；腰包在髋关节上，下垂的手压在包上；拉链条浮在胸前；起跳时手臂僵硬平举。
- r2：Skin 修改器在手部和肩部产生了非流形边，定位后改为：手套做成刚性件，rest 手臂改直（肘部铰链轴在 solve_pose 里显式指定）。脚接触改为以靴子真实顶点为支点，并限制所有靴顶点不低于地面。关键帧从 30/s 提到 60/s。肘部摆动曲线改平滑（原来 `max(0, sin)` 有折角）。权重在剔除小影响后重新归一（误差从 4.9e-4 降到 3e-8）。
- r3：腰包移到下摆后侧；肘、膝的权重过渡加宽；调低 Run 手臂的内收角，前臂不再扫过腰包；起跳时肘部先动；腕部重新连接。
- r4（A6）：肩加宽、腋下和胯部重新分配权重、对称三角化、Run 微调、包盖内移，结果是严格自交为 0，关系表通过。下摆只改了材质归属（仍是锯齿），靴子是 Skin 修改器做的圆靴。
- r5（A2）：几何水平下摆切线；八边形靴筒加前伸鞋头，布尔并成单壳；Jump 起跳踝高 +1 cm。

## 证据（全部从最终 Draco `73aa0bb6…` 重新导入后渲染；每个目录的 source.txt 写有 sha256）

旧的 r3/r4 图和视频**不能**作为当前版本的证据。被替换的旧文件移到了 `/tmp/a2/`（没有删除，只是不在仓库里）。

- 六视图：`final/G24_sixview_final.png`
- 和锁图对照：`final/G24_A2_vs_lock.png`
- 姿态拼图（侧视和 3/4 视）：`final/G24_poses_final.png`
- A6 极限姿态近景：`final/G24_a6_extremes_final.png`
- 腕部近景：`final/G24_wrist_closeups_final.png`
- 正常速度回放：`final/video/G24_10s_normal_speed.mp4`，1920×1080，H.264，30 fps，10.9 s，327 帧（ffprobe 已核对），顺序 Idle → Walk → Run → Jump（空中保持）→ Land → Idle。抽帧：`final/video/frames/contact_2fps.png`、`walk_run_30fps_strip.png`。
- A6 报告：`final/a6/`，包括 selfx 三份、relations 三份、主线程 checker 三份。
- 机器报告：`tools/world/guide/out/` 下的 qa_native.json、qa_glb_G24*.json、qa_wrist.json、inspect_glb_rig_*.json、export_hashes.json；汇总在 `manifest.json`（新增 `a6` 一节）。
- `r1/`、`r2/`、`r4/` 是之前轮次的图，只作对照。

## 复现

```sh
B=/Users/bobby/Applications/Blender.app/Contents/MacOS/Blender
P=../../../public/assets/world/guide/G24.glb; U=out/G24_uncompressed.glb; A=../../../docs/world/quality-v2/guide/final/a6
cd tools/world/guide
$B -b --factory-startup --python-exit-code 1 -P build_guide.py
$B -b blend/G24.blend --python-exit-code 1 -P export_guide.py -- candidate   # candidate -> out/ only
$B -b blend/G24.blend --python-exit-code 1 -P export_guide.py                # final, after QA
$B -b blend/G24.blend --python-exit-code 1 -P qa_guide.py -- native out/qa_native.json
$B -b --factory-startup --python-exit-code 1 -P qa_guide.py -- glb $P out/qa_native.json out/qa_glb_G24.json
$B -b --factory-startup --python-exit-code 1 -P qa_wrist.py -- $P out/qa_wrist.json
$B -b blend/G24.blend --python-exit-code 1 -P qa_selfx.py -- native $A/selfx_native.json
$B -b --factory-startup --python-exit-code 1 -P qa_selfx.py -- glb $P $A/selfx_glb_draco.json
$B -b blend/G24.blend --python-exit-code 1 -P qa_relations.py -- native $A/relations_native.json
$B -b --factory-startup --python-exit-code 1 -P qa_relations.py -- glb $P $A/relations_glb_draco.json
$B -b --factory-startup --python-exit-code 1 -P render_guide.py -- $P <dir> sixview|poses|wrist|extremes|video
python3 write_manifest.py
```

## 未通过 / 未证明 / 未做

- 一项离线 executed_fail：Jump 原地 clip 的局部滑移 35.85 mm。运行时离地的解释来自 r3 文件的实测，r5 没有复测。
- A6 的证据只覆盖采样姿态：每秒 60 帧的整帧和半帧，不是两帧之间的连续碰撞检测；用 float32 坐标；精确判定只用于共享单个顶点的情况；埋入和露出按最近面法线符号判断，在尖锐凹角附近可能判错。
- **运行时动作混合的姿态没有检查**（crossfade 中间态、timeScale 变化、转身）。主线程也说过，这不代表跨壳和运行时混合姿态已通过。
- A2 只修了返工单里的下摆和靴子。夹克长度和宽度、手臂粗细、肩徽章、面罩凸板和锁图仍有差距，见 A2 一节。
- 参考图冲突仍在：锁图把腰包和青点画在左侧，文字锁写右侧；按指令做在右侧（`RIGHT=-1`）。
- 没做：坐下/起身、上下车、转身/急停过渡、IK/FK 控制 rig、Khronos 官方 validator。
- 新文件在游戏里的效果（镜头、光照档、motion 报告）没有由本会话跑过，需要主线程用 `73aa0bb6…` 复测。
