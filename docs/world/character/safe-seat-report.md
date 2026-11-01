# 最近安全起身点 · r14

r14 的两例窄 A3 数值通过，**P16 远距离空中位移体验仍失败**。当前不是全部历史步态/坡地问题的验收通过。

与主线程 bcb0312 同一 Actors 小补丁：先以原 free 胶囊检查座前 0.65/0.70/0.80/0.90 m，再保留原 from 与八方向 fallback。Guide 只在 StandUp 前 35% 的双靴未落地阶段把显示根有限插值到该安全点，垂直根到 60% 才回到地面；结束 rootOff 为零，不再人工退步。无新增 IK，没有改 contact mask、窗口或阈值。

| 受影响原窗口 | C06 | P16 |
| --- | ---: | ---: |
| Idle → SitDown | 21.37 mm | 21.42 mm |
| SitIdle → StandUp | 无地面接触 | 2.55 mm |
| StandUp → Idle | 26.27 mm | 24.48 mm |
| 显示根平移时最低真实靴底离地 | 363.77 mm | 67.08 mm |
| 退出后人工退步 | 无 | 无 |
| 实际退出点距座心 | 0.7000 m | 1.5007 m（旧 fallback，前方候选未采用） |

C06 的 .65 m 没被采用，.70 m 被采用。P16 前方四距没有得到最近安全位置，虽脚未拖地，快速移动太长，不能凭数值称体验通过。主线程已限定再补座旁搜索，r14 保留为失败轨迹，不追溯删除。

证据：`/Users/bobby/Desktop/3D-personal-world/evidence/character-close/safe-seat-C06-r14` 与 `safe-seat-P16-r14`；每例完整 E 坐/起、固定窗口 JSON 与实际截图。A6 当前复核结果另见同目录 `runtime-a6.json`（不以 r13 代替）；类型检查见 `astro-safe-seat.log`。

## 历史未关证据边界（只读核对，不扩全包）

`slope-v3d.json` 的 fixture 在开录前 1.2 s，之后无传送/坐姿。原始 342 个曲线站立相有 40 个 >20 mm 浮空、21 个 <−15 mm 下陷，最大浮空 94.5 mm。35 个浮空标记为既有 stop-step swing，只能另列诊断，不能删掉原曲线口径；排除这些仍有 5 浮空/20 下陷、最大 85.9 mm（Sprint）、Idle 63 mm。**没有被本轮关闭，不是可统一归因的 fixture 污染。**

`transition-ab.json` 的 motion-bot 同样在 fixture 后等 1.5 s 才开录，之后无 fixture/坐姿。road-inert 的 Run 210.3 mm 不能归 fixture。`slipByAnim` 包含该 clip 的起步/过渡，并非稳定窗口；最坏区间 t=2.6674–2.7507 只有 83 ms，缺少 raw phase 对齐不能断言“稳定 Run 210 mm”，但即按起步 80 mm 也超限，仍记为旧未关结果。不能用本次坐姿局部通过覆盖。
