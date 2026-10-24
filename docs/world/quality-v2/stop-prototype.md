# 停步视觉候选：脚锁 + 两骨 IK + 一步收脚（2026-10-21）

**状态：只是候选，仅供 QA 启用，未经 Fable 签收。** 代码在 `src/components/world/WorldGuideStop.ts`（r2，sha256 63b1eeaf…，独立 TS strict 编译通过）。r1 已由主线程接入（QA-only）并用真实键盘测过，运行时 A6 矩阵在 turn180 抓到腿部自交，r2 修复，见下一节。**r2 只做了离线验证，尚未重新跑浏览器和运行时 A6。**我没有改 `WorldGuide.tsx`、`WorldActors.tsx`、GLB、建模脚本或冻结文件。接入由主线程做。

这对应 `fable-stop-request.md` 的方案 B，前提仍是“不做 Stop/IK”的例外范围待 Fable 协调。

## r2：停步中转身自交修复（2026-10-21）

**运行时证据（主线程）**：`/Users/bobby/Desktop/3D-personal-world/stop-49bd-prototype/`
- `skin-audit.json` 是对采集的 CPU skin 姿态做的独立重建，inputSha256 19123401…，资产 49bd64ff…。
- 默认档 375 个样本中只有 turn180 的 t=8.798、8.822 两帧失败（同壳交叉 34 / 50）；近档 372 个样本中也只有 t=8.790、8.812 两帧（37 / 40）。交叉位置在腿部 y≈0.4–0.5 m。
- 报告里的逐帧 `actor.stop` 显示：8.776 时 `exiting turn`（weight 0.924），而 playerYaw 每个采样跳 0.8 rad（−2.498 → −1.698 → −0.898 → −0.098，约 0.07 s 转完 180°）。同一时段内 IK 权重只混出到 0.789 / 0.396。

**原因**：r1 把目标锁在世界坐标。退出混出的 0.15 s 内，骨盆随刚体转了接近 180°，脚却还被钉在原世界点，两腿就被执到了对侧。这不是模型问题，不应该改模型或蒙皮来迁就。

**修法**（`followYaw()`）：每次 `solve` 开始时，把所有锁定目标的位置和朝向（planted、target、正在进行的一步的起止点）绕根节点按自上次以来的 facing 增量旋转。根节点在传了 `anchor` 时就是 anchor。
- 所有状态（settling / releasing / exiting）都生效。
- 转身时双脚和身体一起刚体转动，然后仍按原来的 0.15 s minimum-jerk 混回动画。
- 这与 Fable 已接受的“Idle 刚体转身”口径一致。脚底绕根转动的弧长仍会被 QA 按原口径记录，没有降低任何检测标准。
- 新增 debug 字段 `yawFollowed`（本次停步累计跟转的弧度）。
- 其他行为、参数、接口和接入顺序都没变，主线程不用改接入代码。

**离线验证（不是浏览器，不是验收）**：
- 输入按主线程的要求绑定实际读到的 hash。
  - 用 draco3d 1.5.9（仓库 node_modules）写了 Node 解码 shim，直接解码压缩 GLB，不再用未压缩版本代替。
  - 主用 `tools/world/guide/out/G24_49bd64ff_final_backup.glb`（sha256 **49bd64ff…**，即主线程测试时 public 上的版本）。解码后 2098 个三角形，与 skin-audit 一致。
  - 此后 public 又变成 **34a3e368…**（01 仍在改）。我拷了一份快照 `/tmp/stopsim/G24_public_snapshot.glb`，shasum 是 **73aa0bb6…**，与 public 当前不同，说明拷贝时 01 正在写入。这一组只在下文标为 73aa0bb6，不当成 34a3e368 的结论。
- 自交计数（`selfx.mjs`）：
  - CPU skin 后按 10 µm 焦接 rest 位置求连通壳，只统计最大壳（主体，416 三角）。共享焦接顶点的三角对跳过。
  - 判定为三角边段与对方三角严格相交。
  - 这是自己写的诊断，口径不等于 01 的 skin-audit（不含共面、缝焦平均，只统计主壳）。只用来比较「有停步 / 无停步」两组，不作通过判定。
- 转身矩阵共90 组：松键相位 5 个 × 停下后开始转身的时刻 6 个（0.02/0.15/0.3/0.5/0.8/1.2 s） × 转角 3 个（+180°/−180°/+90°）。转速按 WorldActors 低速转身的 24 rad/s，转完后按新方向加速。

| 输入 | helper | 转身 90 组中交叉数高于无停步对照的 | 候选最大 / 对照最大（主壳交叉对） |
| --- | --- | ---: | --- |
| 49bd64ff | r1（修前） | **44 / 90** | **115** / 2 |
| 49bd64ff | r2 | **0 / 90** | 2 / 2 |
| 73aa0bb6 快照 | r2 | 0 / 90 | 0 / 0 |

- r1 的 44 组失败都发生在 `exiting turn` 或 settling 期间。交叉数在转身开始后 0.05 s 从 1 跳到 34–56，形态和运行时的 8.798 / 8.822 两帧相同。
- 49bd64ff 无停步时本身就有 1–2 个主壳交叉对，是模型自身的，不属于 helper。skin-audit 在非 turn 帧报 0，口径不同。
- r2 在 49bd64ff 上：
  - 24 个松键相位停步，每个相位最大交叉都是 1，与对照同量。
  - 8 个退出场景各自与对照相同。
  - 自交之外的指标与 r1 相同（停步滑移 0.81 / 1.41 / 2.00 cm，reachError ≤ 3.33 mm，骨长变化 ≤4.3e-7 m，minKneeDot 0.997）。停步中没有转身时 followYaw 不工作。
- 转身 90 组中 minKneeDot 最小 0.99。单帧本地脚踝位移最大 8.68 cm，来自转完后叠加起步的帧。
- 转身退出场景里，候选的本地脚踝单帧最大位移和无停步对照都是 6.33 cm（r1 是 6.94–7.89）。接触滑移 94.47 cm 也和对照相同，都是转身弧长。

**仍未验证**：
- 要由主线程的 `WorldGuideEvidence` / `runtime_guide_intersections` 重采实际 skin 骨矩阵并重跑 A6：turn180（含旧失败录像的反向中断复现）、stop 等待 2 s、stop180，两个缩放档。
- 34a3e368 和 01 之后的新资产都要重新跑。
- 离线模拟是 60 Hz 定步长，没有运行时那种 0.8 rad/采样的粗采样。`followYaw` 用的是每帧 facing 差，不依赖步长。

脚本和结果在 `/tmp/stopsim/`：sim.mjs 05ef87c5…、selfx.mjs 5035057b…、dracoshim.mjs 4ff4789e…；`turn_before.json`、`turn_after.json`、`stop_after.json`、`turn_public.json`、`stop_public.json`。由于写入范围限制，这些没有进仓库。

## 做了什么

- **触发**：Walk/Run → Idle，且在地面上。触发时把两只脚（foot 骨头）的世界位置和朝向存下来。
- **收脚**：与 Idle 站位偏差 >2 cm，或脚踝比 Idle 高 1.5 cm 以上（摇摆脚）的脚要收。顺序是摇摆脚优先，其次是较远的脚；一次只动一只，两步之间停 0.04 s。开始每一步时会重新检查一次，已经在 2 cm 内的脚不再抬。
- **一步的轨迹**：耗时 0.25–0.35 s，抬脚 6–8 cm，都按距离线性取值（25 cm 以上取上限）。水平方向走 minimum-jerk 曲线，竖直方向是正弦抬起；脚的朝向从保存时的朝向 slerp 到 Idle 朝向。不会线性拖脚，也不会瞬移。
- **支撑脚**：被 IK 锁在保存时的世界位置。
- **IK 解法**：解析两骨（thigh→shin→foot）。骨长取自克隆 GLTF 在 Idle t=0 时的世界距离，当前 d3 和 candidate 都是 0.2902 / 0.2853 m。膝盖弯曲方向取自 Idle 姿态膝点偏离髋–踝连线的方向；Idle 膝弯 <4 mm 时改用 Walk 里弯曲最大的一帧。大腿用“腿平面坐标系”旋转到目标平面，小腿绕膝轴转到目标，脚设为目标朝向。
- **不假定坐标轴**：所有方向都由世界空间骨头位置算出。GLB 里每个节点都带旋转（root 转了 Z-up→Y-up，pelvis/thigh/foot 都有非单位四元数），假定 local 轴就会错。不硬编码顶点，骨名接受 `thigh.L` 和 GLTFLoader 清理后的 `thighL` 两种写法。
- **够不到时**：可用范围是 (thigh+shin) × 0.995，避开膝盖直腿奇异。超出时先把骨盆在视觉上降低：硬上限 `maxPelvisDrop = 5 cm`，速率上限 0.6 m/s。仍然够不到的部分按 `reachError` 报告，**不拉长腿**。
- **结束**：两脚都到位后，用 0.18 s minimum-jerk 把 IK 权重混回 0，之后由 Idle clip 接管。
- **不碰物理**：刚体、刹停距离、碰撞都不动。

## 退出规则（都是有限时长的混出，不会骤然弹回）

| 触发 | 处理 |
| --- | --- |
| 起跳（grounded=false） | 0.08 s 混出 |
| 再次移动（speed>0.12 或动画切回 Walk/Run） | 正在迈的脚 0.15 s 混出。已锁定的支撑脚保持锁定，直到新步态把它抬起 1.2 cm（最多 0.3 s），再 0.15 s 混出 |
| 转身（朝向变化 >0.35 rad） | 0.15 s 混出。r2 起锁定目标在任何状态下都随根 yaw 转动（脚和身体刚体同转）。**不做转身迈步**，理由见限制 |
| 切到其他动画（Land 等） | 0.15 s 混出 |
| 停步超过 1.4 s | 0.15 s 混出（记为 `timeout`） |
| 不可见（上车）或卸载 | 立即 `cancel`。角色不可见，没有可见弹跳；重新可见时状态为 off |

## 接口与手动集成（主线程在 WorldGuide.tsx 里做，约 10 行）

```ts
import { GuideStopStep } from './WorldGuideStop';
// rig useMemo 里，scene = clone(gltf.scene) 之后；这里的 group 必须是脚底补偿写 position.y 的那个节点。
// group 在 useMemo 里还拿不到，可以在 effect 里创建，或者用一个中间 Group 做 anchor。
const stop = new GuideStopStep(scene, gltf, { anchor: group.current! });

// useFrame：在切换动画（s.current = desired）之后、mixer.update 之前
stop.preUpdate({ animation: s.current, grounded, speedMps, facing, visible });
rig.mixer.update(dt);
group.current.rotation.y = facing;          // 必须先设朝向，solve 用世界矩阵
stop.solve(dt);                              // 在现有脚底补偿之前
// ... 现有 <=2.5 cm 脚底补偿保持不变 ...

// 不可见分支（现在是 `if (... || !visible) return`）先调用：
if (!visible) stop.cancel('hidden');
// 卸载：useEffect cleanup 里 stop.dispose()
// QA：worldGuideDebug() 返回对象里加 stop: stop.debug()
```

暂停和截图状态下不要调用 `preUpdate`/`solve`（和现在的 early return 一致），状态就会冻结。只在 QA 打开时启用的写法：`new URLSearchParams(location.search).get('stop') === '1'` 时才创建实例，否则为 `null`，调用处用 `stop?.`。

### 和 2.5 cm 脚底补偿的顺序与兼容

- **顺序**：`mixer.update` → 设朝向 → `stop.solve` → 脚底补偿。补偿量测的是 IK 后的真实变形鞋底。
- **必须传 `anchor`**：补偿写的是 group.position.y，算法是 `鞋底 - root`。如果脚被锁在世界坐标，补偿抬高 root 会让「鞋底 - root」变小，下一帧补偿又继续变大，最终顶到 2.5 cm 上限。传入 `anchor` 后，锁定目标会跟随 anchor.position.y 自停步开始的变化量，补偿保持在 Idle 原本的量级。离线模拟里传入后补偿最大 0.21 cm。
- **没有关闭补偿**，也没有放宽它的 2.5 cm 上限。

## Debug 字段（`stop.debug()`）

| 字段 | 含义 |
| --- | --- |
| `state` | off / settling / releasing / exiting |
| `weight`、`left.weight`/`right.weight`、`hold` | 总 IK 权重、各腿权重；hold 表示再次移动时仍在等待抬起的支撑脚 |
| `exitReason` | jump / moving / animation:X / turn / timeout / hidden / settled |
| `left/right.reachError`、`maxReachError` | IK 后脚踝到目标的距离（米），即够不到的剩余量 |
| `pelvisDrop`、`pelvisDropLimit` | 当前骨盆降低量与上限（米） |
| `left/right.lockedDrift` | 锁定脚水平偏离锁点的最大值 |
| `boneLengthError`、`upper`、`lower` | 当前骨长与初始化骨长的最大偏差 |
| `kneeDot`、`minKneeDot` | 膝盖偏离方向与休息弯曲方向的点积，1 表示同向，<0 表示反弯 |
| `step.{t,duration,lift,distance,peakAboveChord}` | 当前一步的参数；peakAboveChord 是踝部高于起止连线的实际抬高 |
| `releaseResidual` | 释放时保持的目标与 Idle 动画脚位的水平差 |
| `anchorShift` | 脚底补偿自停步开始的变化 |
| `poleSource`、`events` | 膝盖方向来源；最近 24 条事件（开始、每步、退出） |
| `yawFollowed` | r2：本次停步中锁定目标跟随根转过的累计弧度 |

## 离线骨骼数学验证（**不是浏览器测试，不是验收**）

**方法**

- Node 22 + three 0.186.1，用仓库里的 three 解析 GLB，帧顺序与 WorldGuide 一致：动画切换、timeScale 随位移、mixer.update、朝向、`solve`、现有脚底补偿。
- 60 Hz 定步长；刹停速度按 WorldActors 的 `exp(-12t)`，初速 1.8 m/s。
- Walk 周期取 24 个松键相位。
- 脚滑按和 QA 相同的口径：变形鞋底顶点（foot 权重 >0.98）进入脚平面 6 mm 内即开始跟踪，取同一顶点的最大水平位移。
- 下表用 `public/assets/world/guide/G24.glb`（d3ccc591）的未压缩版 `tools/world/guide/out/G24_uncompressed.glb`，从松键开始计。
- 脚本和 JSON 在 `/tmp/stopsim/`（sim.mjs sha256 7a8c4894…）。本轮只允许写两个文件，所以没放进仓库，需要保留时可以转到 `tools/world/playtest/`。

| 指标（24 个松键相位） | 中位 | p90 | 最大 |
| --- | ---: | ---: | ---: |
| 现状（无停步）接触顶点滑移 | 13.48 cm | 24.45 cm | 27.29 cm |
| 候选接触顶点滑移 | 0.81 cm | 1.41 cm | 2.00 cm |
| reachError | 0 | 0 | 3.33 mm |
| 骨盆降低 | 0.42 cm | 4.14 cm | 5.00 cm（到上限） |
| 大腿长度变化 / 小腿长度变化 | — | — | 3.3e-7 / 4.3e-7 m（浮点误差） |
| 膝盖弯向 minKneeDot | — | — | 最小 0.997（没有反弯） |
| 停步期间顶点最低点 | −0.12 mm | −0.03 | −0.36 mm（入地 <0.5 mm） |
| 单帧本地脚踝位移 | 1.93 cm | 2.33 | 2.36 cm（现状最大 4.54 cm） |
| 抬脚时鞋底离地峰值 | 9.67 cm | 12.44 | 12.68 cm |
| 结束后脚踝到 Idle 站位 | 0 | 0 | 0 |
| 停步时长 | 0.97 s | 0.98 | 1.00 s |
| 脚底补偿最大值 | 0.19 cm | 0.21 | 0.21 cm |

过程中实际的单步耗时是 0.26–0.35 s，踝部抬高 6.1–8.0 cm。候选滑移中那 0.81 cm 不是停步造成的，而是松键后刹停期间 Walk 自身的滑移；两次 2.00 cm 来自松键即落脚的相位。离线模拟里 1.72 cm（稳定行走）和 8 cm（停步）两个门限没有放宽，也没有删接触采样。

**r1 时的第二组输入只是当时的本地文件**：`G24_candidate_uncompressed.glb`，当时读到的 sha256 是 f2f67a5a…，所有指标与上表相同。该文件此后已被 01 覆盖。“骨骼和 clip 与 d3 相同”这句只对 f2f67a5a 成立，**不能外推到 49bd64ff 或之后的版本**。

r2 逐一核对了实际读到的 GLB（对 glTF JSON 和 BIN 做摘要）：
- 动画摘要 = 按序的 sampler input/output 字节 + 通道目标。骨骼摘要 = joints 的 TRS、子节点 + inverseBindMatrices。
- d3ccc591：动画 d6951383…，骨骼 fd3afc05…。
- **49bd64ff**：动画 b95e5011…，骨骼 08c6a7f3…。
- **34a3e368**（public）与 5b93e4ae（`G24_uncompressed.glb`）：动画 267a4874…，骨骼 08c6a7f3…。

所以 49bd64ff 的骨骼和 inverse bind 与 d3 **不同**；34a3e368 和 49bd64ff 骨骼相同但**动画不同**。骨长仍是 0.2902 / 0.2853 m，是 helper 在初始化时实测的。上面停步表的 d3 数值只代表 d3。r2 在 49bd64ff 上的结果见 r2 一节；任何新资产都要重跑。

**退出场景**（松键相位 0.2 / 0.3，在进入 Idle 后 0.15 s 触发，此时正在迈第一步）：

| 场景 | 退出原因 | 本地脚踝单帧最大位移（候选 / 同场景现状） | 说明 |
| --- | --- | --- | --- |
| 起跳 | jump | 6.72 / 4.52 cm；5.53 / 3.28 cm | 0.08 s 混出叠加 Jump 的 0.055 s 淡入 |
| 再次移动 | animation:Walk | 8.85 / 6.33 cm；7.49 / 6.33 cm | 支撑脚按抬起或 0.3 s 释放 |
| 转身 180° | turn | 7.89 / 4.52 cm；6.94 / 3.28 cm | |
| 不可见 | hidden | 2.24 / 4.52 cm | 重新可见时状态为 off |

退出时的单帧位移比现状大 1.5–3.4 cm。原因是从一步中途抬起的脚混回动画姿态。这不是骤然弹回（有 0.08–0.15 s 时长），但要在真实键盘录像里确认观感。退出后的接触滑移主要来自紧接着的新动作本身（转身弧长与现状同量级），不在本候选范围内。

## 限制（按事实写）

- **只支持平地**：目标高度沿用保存时的高度和 Idle 高度，没有地面射线。坡地会悬空或入地，**坡地目标未实现**。
- **停步中转身只退出，不迈步**：按 Fable 20:45 的意见，转身弧长只记录。r2 起双脚随根刚体同转，脚底弧长和无停步时一致（离线 94.47 cm，两组相同），不能视为已修。
- **骨盆降低会到 5 cm 上限**：松键相位 0.225/0.525 时各有一次，此时 reachError 2.25 / 3.33 mm。要由人看录像判断观感，必要时调 `maxPelvisDrop` 或让前脚先收。
- **脚底不做连续地面约束**：脚的朝向用保存时的朝向 slerp 到 Idle，没有脚掌翻转。脚尖在停步开始时是什么角度就沿用什么角度。模拟入地最大 0.36 mm。
- **停步时长约 1 s**：两步且相间停顿。是否太长由 Fable 判断。
- **上半身不跟随**：只动腿和骨盆。
- **离线模拟的前提**：直线行走、初速 1.8 m/s、没有 Run→Idle（Run 只经 Walk 降到 Idle），也没有插值或掉帧。**不等于浏览器表现。**

## 需要用真实键盘补测（主线程集成后）

1. **停步**：默认和近档，覆盖多个松键时机（至少包含摇摆脚刚离地、刚落地两类）。用现有 `transitions.mjs` / `foot-contact.mjs` 的接触顶点口径，门限不变；重点看 stop 和 stop180。
2. **Run 松键直接停下**：经 Walk 进 Idle，确认触发时机和脚位。
3. **退出**：停步中按 Space、停步中按反向键（会触发低速转身）、停步中按同向键、停在车旁立即按 E 上车。
4. **暂停**：停步中按 Esc，确认冻结和恢复。
5. **坡地和地形接缝停步**：预期会看到悬空或入地，用来确认限制范围。
6. **视觉**：Fable 按录像看抬脚高度、骨盆下沉和 1 s 时长的观感。
7. **A6**：停步的运行时姿态（含骨盆下沉 5 cm、抬脚最高帧、两脚收拢帧、停步中转身帧）必须纳入 01 的自交/连接检查。r2 的离线主壳交叉计数只是诊断，**不替代 A6**。

新角色替换 G24 后，只要保留 thigh/shin/foot 三段链和 Idle/Walk clip，helper 会自动重新取骨长、站位和膝盖方向；但上表所有数值都要重跑。
