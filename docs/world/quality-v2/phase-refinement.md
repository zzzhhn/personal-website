# Walk↔Run 接入：剩余误差定位与 `WorldGuidePhase.ts` 集成说明（2026-10-21）

范围：只处理 Walk↔Run。本轮只写了两个文件：

- 新增 `src/components/world/WorldGuidePhase.ts`。
- 本文。

没有改 `WorldGuide.tsx`、`WorldActors`、GLB 或 rig，没有跑浏览器，没有提交。

标注方式：

- **实测**：直接来自 `playtest/transitions-sole-entry-d3/report.json`。
- **离线**：用 Node 里的真实 three 0.186.1 `AnimationMixer` 和 `SkinnedMesh.applyBoneTransform` 重放同一份 G24 动画，不是浏览器证据。
- **未验证**：需要主线程集成后在真实运行时复测。

动画来源：离线读的是 `tools/world/guide/out/G24_uncompressed.glb`（sha `0205f625…`）。它的 270 个动画 sampler 和 inverse-bind 矩阵，与线上 `public/assets/world/guide/G24.glb`（d3ccc591）逐字节相同。Node 里没有 Draco 解码器，所以用未压缩版；顶点索引和 Draco 版不同，但各处都按骨骼权重重新识别鞋底顶点，不依赖索引。

## 1. 剩余误差在哪

### 1.1 三个缺陷都在 `WorldGuide.tsx:169–216` 的接入逻辑里

把实测里的每次切换反推到判定帧：源 clip 时间取 `animationTime + timeScale·dt`，目标写入时间取 `animationTime − timeScale·dt`。再用离线姿态表量两种偏移：

| 切换 | 档 | 踝骨 XZ 偏离 | 鞋底顶点 XZ 偏离（均 / 最大） | 实测片段滑移 |
| --- | --- | ---: | ---: | ---: |
| Run→Walk @6.691 | 近 | 3.66 cm | 5.36 / 5.51 cm | **5.32 cm** |
| Run→Walk @6.675（1 次超时） | 默认 | 1.06 cm | 1.73 / 1.86 cm | 3.40 cm |
| Walk→Run @5.164 | 近 | 5.72 cm | 5.73 cm | 1.48 cm（见 c） |
| Walk→Run @5.135 | 默认 | 5.70 cm | 5.70 cm | 1.57 cm（见 c） |

**a. 要对齐的是鞋底顶点，不是踝骨**

- 现在的代码比较踝骨世界点的 XZ：第 174–175 行取点，第 197 行算距离。
- 但脚掌在 Run 和 Walk 里的俯仰角不同：踝高分别是 0.094 和 0.091，脚尖角度也不同。
- 当两只踝对齐到 3.66 cm 时，实际触地的鞋底顶点偏了 5.4–5.5 cm。这就是近档 Run→Walk 5.32 cm 的来源：QA 就是在量这些顶点。

**b. 72 格离散加上 1.2 cm 门限，容易落空**

- 在目标速度下，72 格一格对应的位移是：Walk 1.25 cm，Run 2.33 cm。
- Walk→Run 在 1.2 cm 门限内常常一帧都找不到。两档实际记录的 Walk→Run 都先等了 50–83 ms。

**c. 没有把混合和踩地脚的位置变化算进去**

- 过渡期间显示的是两个姿态的 slerp 混合。只在第 0 帧对齐踝骨，并不能保证 0.1 s 内脚不动。
- Walk→Run 两档都以 5.7 cm 的偏移接入（该帧门限内无候选，实际写入的时间点并不在 1.2 cm 内），实测滑移却只有 1.5–1.6 cm。这是巧合：那一刻 Walk 的踩地脚正好要离地，偶然没滑。
- 这说明第 0 帧对齐距离既不必要，也不充分。

### 1.2 steady-run 1.78 cm：Run clip 自身的触地速度不匀

- 实测近档 steady-run 最差一段是 5.727→5.879，右脚从落地到离地。前面各帧只累计了 0.10–0.17 cm，最后一帧单步跳了 1.62 cm。
- 离线量了 Run 在支撑期里鞋底顶点的地面速度：支撑中段是 4.1–4.3 m/s，着地和离地的约 20 ms 里只有 2.6–3.1 m/s。
- 而运行时是匀速推进：`timeScale = travel/(dt·4.2)`（`WorldGuide.tsx:223`）。结果进入和离开支撑时会产生超过 1 cm 的滑移：离线 240 Hz 逐顶点量到 2.87 cm；叠加 6 mm 接触带和采样间隔后，实测量到 1.69–1.78 cm。
- 所以它会在阈值 1.72 cm 附近来回跳。这是 clip 制作层面的问题，和接入逻辑无关。
- Walk 的触地速度是 1.44–1.57 m/s，接近匀速，所以 steady-walk 一直没问题。

## 2. `WorldGuidePhase.ts` 的做法

### `GuidePhaseModel.fromGLTF(gltf, { authoredSpeed: { Walk: 1.5, Run: 4.2 } })`

在 `useMemo` 里构造一次即可。可以直接传入已加载的 gltf：只读属性，不动场景。

预计算内容：

- **姿态表**：转腿的 6 块骨加上 root 和 pelvis 的局部 TRS，每个 clip 240 个采样。用的是和 mixer 同一个轨道插值器；动画是 60 Hz 关键帧，采样比关键帧更密。
- **鞋底点**：foot 权重 ≥0.98、并且在某个姿态里位于最低点 1 cm 内的鞋底顶点，存成脚骨局部坐标。G24 每侧有 14 个。
- **每个采样的支撑高度**：按 WorldGuide 的 1.5 mm / 2.5 cm 抬脚修正计入，接触带为 6 mm，和 QA 口径一致。
- **触地速度表**：每个采样取接触顶点地面速度的中点值，使接触顶点中最大的滑移最小。腾空帧补足余量，保持周期步长不变：Run 仍是 1.680 m，Walk 是 0.899 m，制作值 0.900 m。
- **开销（离线 Node）**：构造约 4–16 ms；一次 `findEntry` 约 0.65–0.85 ms（评估 60–84 个候选点）。只在有切换请求的帧调用，不做整网格蒙皮，不分配每帧对象。

### `findEntry({ sources, target, speed, speedEnd, fade, timing, tolerance })`

不再只看第 0 帧的距离，而是整段模拟过渡：

1. **按 mixer 的规则重演**：局部 TRS 按权重混合，四元数用 slerp 并按 `w/累计权重` 累加。从当前所有正在播放的动作出发，按线性渐变把权重移到目标。每 1/60 s 重新算一遍腿部 FK 和鞋底顶点，根按 `speed→speedEnd` 往前移。
2. **用 QA 规则打分**：同一个顶点进入 6 mm 接触带后，记录它的水平最大漂移；离开接触带就重置。过渡中途支撑脚抬起的候选直接剔除。
3. **候选点与细化**：候选是目标整段过渡都保持同侧支撑的那些采样。找到最好的采样后，再做 ±½、¼、⅛ 格的细化。
4. **返回值**：`{accepted, time, drift, side, reason, evaluated}`。`reason` 取值为 `ok | no-support | no-window | over-tolerance | unknown-clip`。预测漂移比 `tolerance`（默认 1.2 cm）大时不接受，但仍然把最佳时间和预测值一起返回。

`PhaseGate`（默认最长等 0.2 s）只负责计时和计数：超时会返回 `timedOut: true` 并让 `timeouts` 加 1，用的是"预测漂移最小"的候选，不会当作匹配成功。

### `timing: 'contact'` 与 `model.timeScale(clip, time, travel, dt, 'contact')`

可选的推进方式，用来修 steady-run：clip 时间按"本帧位移 / 该相位的触地速度"推进，代替现在的匀速。

- 步长、平均步频和动作顺序都不变。
- 代价：Run 腾空那约 16% 的周期会加快到约 5.4 m/s 的等效速度，着地和离地的瞬间会变慢。视觉上可能显得腾空更短、支撑更稳，需要 Fable 看录像判断。
- 这不是放宽阈值，也不改 fade。

## 3. 离线验证（真实 three.js mixer，非浏览器）

**模型精度**

- 对 180 个混合姿态（Walk/Run/Idle 两两组合，权重 0–1），比较预测的最低鞋底高度和 `AnimationMixer` 加 `applyBoneTransform` 的实际值，最大差 0.000 mm。
- 在一个 Walk 0.4 + Run 0.6 的混合姿态上，每个接触顶点和实际蒙皮顶点的 3D 差 0.000 mm。
- 也就是说，它算的就是运行时会显示的姿态。

**重放设置**

- 真实 mixer 加上对 WorldGuide 切换与推进逻辑的移植。
- 物理代理：响应率 12，W=1.8、Shift=4.2 m/s，直线行走。
- 两种帧率：稳定 60 Hz，或每 7 帧一次 33 ms 卡顿。
- 24 个起始相位。量法和 transitions.mjs 一致：切换前 0.2 s 到切换后 0.3 s。

| 策略 | 帧率 | Walk→Run 中位 / 最大 | Run→Walk 中位 / 最大 | 超时次数（W→R / R→W，共24相位） | 稳定段最大 |
| --- | --- | --- | --- | --- | --- |
| 现行代码移植 | 稳定 | 1.64 / 2.11 cm | 4.30 / 5.06 cm | 0 / 2 | Walk 1.05，Run 1.86 cm |
| helper，uniform 推进 | 稳定 | 1.44 / 1.88 cm | 2.23 / 6.75 cm | 0 / 4 | Run 最大 4.11 cm（见下） |
| **helper，contact 推进** | 稳定 | **0.99 / 1.10 cm** | **1.08 / 1.69 cm** | 0 / 2 | **Run 0.13 cm**，Walk 1.09 cm |
| **helper，contact 推进** | 卡顿 | **0.98 / 1.12 cm** | 1.20 / 8.00 cm | 0 / 4 | Run 0.08 cm |
| helper，contact，`maxWait` 0.5 s | 卡顿 | 0.98 / 1.12 cm | 1.09 / 1.55 cm | 0 / 0 | Run 0.08 cm |

现行移植的 Run→Walk 最大 5.06 cm，和实测 5.32 cm 在同一量级，说明重放模型可信。

**结论与局限（请如实看待）**

1. **只接入 helper、不改推进方式（uniform），不推荐**：过渡会变好，但过渡后的 steady-run 仍然是 clip 自身的滑移，还可能因为接入相位不同变差，实际出现了 4.11 cm。要修 steady-run，必须同时用 contact 推进。
2. **0.2 s 仍会超时，且超时就是失败**：在卡顿情况下约 1/6 的相位会超时；单次超时时预测 7.96 cm，实际 8.00 cm。只要有一次超时，就应记录为失败。
3. **最长等待的根本原因与取舍**：要把超时降到 0，需要 `maxWait` 约 0.4 s（理由见下一条）。代价是 Run 最多多跑约 0.38 s 才开始变成 Walk，这是可见的响应延迟，属于产品取舍，需要你和 Fable 定。
4. **为什么需要等那么久**：Run 和 Walk 的支撑期在脚相对身体的前后位置上只部分重叠。Run 刚落地时脚在 +0.34…+0.41 m，Walk 最前只到 +0.26 m。如果松开 Shift 的时候 Run 刚落地，那一整个支撑期都找不到接得住的 Walk 帧，只能等到下一个支撑。这是两个 clip 的制作决定的。想要不等待就没有滑步，只能增加过渡 clip 或使用脚锁/IK，这两条不在本轮范围内。
5. **提前发起请求没有帮助**：试过在按键变化时（而不是速度跨过 2.4 时）就发起请求，Run→Walk 最大结果是 4.57–6.33 cm，反而更差。原因是早期速度仍接近 4.2，地面速度和 Walk 不匹配，所以不采用。
6. **`speedEnd` 必须传**：不传时 Run→Walk 最大达到 25.35 cm；以速度恒定假设评估会把减速期间错误的候选判为通过。参考算法：`speedEnd = v_target + (v_now − v_target)·exp(−12·fade)`，其中 12 是 WorldActors 里着地时的响应率；`v_target` 取 W/Shift 的指令速度（现在是 1.8 / 4.2）。
7. **曾经发现并已修正的一个坑**：`sources` 只能包含 `action.isRunning()` 的动作。three 在淡出结束后会停止动作，但 `getEffectiveWeight()` 仍然返回 1。把已停止的动作算进去时，这个错误曾导致预测开支 0.5 cm、实际 21.6 cm。
8. **重放未覆盖的情况**：斜坡、转向中切换、重叠的多次切换、真实的物理插值时钟。

## 4. 集成草案（由主线程写入 `WorldGuide.tsx`，未验证）

```ts
import { GuidePhaseModel, PhaseGate } from './WorldGuidePhase';
// in rig useMemo (after actions):
const phase = GuidePhaseModel.fromGLTF(gltf, { authoredSpeed: { Walk: 1.5, Run: 4.2 } });
const gate = new PhaseGate(.2);            // product decision: .2 (timeouts possible) vs ~.4 (no timeouts offline)
// in useFrame, Walk<->Run only (Idle/Jump/Land keep their current path):
if (rig.phase.duration(desired) && rig.phase.duration(s.current) && s.grounded) {
  const sources = (['Walk', 'Run'] as const).filter(n => rig.actions[n].isRunning() && rig.actions[n].getEffectiveWeight() > 1e-4)
    .map(n => ({ clip: n, time: rig.actions[n].time, weight: rig.actions[n].getEffectiveWeight() }));
  const vTarget = desired === 'Run' ? 4.2 : 1.8;                  // keep in sync with WorldActors W/Shift
  const speedEnd = vTarget + (speedMps - vTarget) * Math.exp(-12 * .1);
  const r = rig.gate.request(desired, dt, () => rig.phase.findEntry({ sources, target: desired, speed: speedMps, speedEnd, fade: .1, timing: 'contact' }));
  if (r.switchNow) { /* existing reset/play, to.time = r.entry ?? to.time, crossFadeTo(.1) */ }
  // QA: expose rig.gate.timeouts, rig.gate.last?.drift, rig.gate.last?.reason, r.timedOut
} else rig.gate.clear();
// replace lines 222-223 (uniform advance) by contact advance:
for (const n of ['Walk', 'Run'] as const)
  rig.actions[n].setEffectiveTimeScale(rig.phase.timeScale(n, rig.actions[n].time, travel, dt, 'contact'));
```

- 如果只想先换接入、不改推进，把 `timing` 设为 `'uniform'`，保留第 222–223 行即可。但按第 3 节第 1 条，这样 steady-run 不会修好。
- `findEntry` 和 timeScale 必须用同一种 timing，否则预测会失准。
- 基于 Idle 的起步、Jump/Land 和停步不用这个 helper。停步的结论见 `motion-review.md`：需要新增收步动作或 IK。

复测时需要看：

- transitions 两档的 Walk-Run、Run-Walk、steady-run。
- `phaseGateTimeouts` 必须为 0，否则如实报失败。
- 预测漂移和实测漂移要对得上。
- 另外请 Fable 审一遍 Run 在 contact 推进下的观感录像。

离线脚本在 `/tmp/mr/keep/`：`replay.ts`、`check1.ts`、`load.mjs`。本轮不允许写入仓库，如需保留，由主线程转到 `tools/world/playtest/`。

类型检查：本轮跑了 `tsc --noEmit -p tsconfig.json`，`WorldGuidePhase.ts` 没有报错。
