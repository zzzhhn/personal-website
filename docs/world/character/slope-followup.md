# 坡地 Stop/Slope 最小修复

基线 `b052396`，分支 `codex/world-slope-followup`。**原路线下陷已消除，浮空仍是明确失败；不是坡地整项通过。** 不改物理、GLB、接触曲线、阈值或求解器数量。

后续同步观测已更新根高度解释：`.88` 是 spawn clearance，`.82` 正确对应胶囊底部，不能将二者60mm差视作视觉偏移bug。实际大浮空来自胶囊离地而旧远射线仍标grounded，详见 `slope-support-diagnostic.md`。以下历史推导数值保留，物理含义以同步诊断为准。

## 修复

- `WorldGuideStop.ts`：Stop 的 Idle 落点、queued 等待脚和已落地脚目标复用 Slope 当前帧的静态支持面、既定 pitch/roll 夹限及真实蒙皮 sole 点，旋转 sole 后反算 ankle Y。XZ 锁、步序、摆动弧和原 2.4 m/s 捕获摆动脚落地速度保留。Stop 仍是 Slope 后的最终两骨 IK 写入者；两者共用 5 cm 骨盆预算、腿到达 ≤99.5%。清理过时的 QA-only/flat-only 注释。
- 当前 ankle ray miss 时，只在本帧真实脚底覆盖点补静态探测，最近点优先，不缓存平面、不跨越悬崖延用旧面。本轮 final 没有触发补探测，功能尚无触发态实证；32 个逐脚 probe miss 另列，没有删除。
- `WorldGuide.tsx` 只接 Stop 的 ground target 回调及共享骨盆诊断。`slope-bot.mjs` 保留原按键/时长，增加完整 skin、普通入口截图及限幅/探测诊断。全部 344 个 recorder sole 点每帧保留。

## 实测

每次都是原始坡路线，fixture 记录完整；阈值仍为 clip contact ≥0.5、浮空 >20 mm、下陷 <−15 mm。headline 仍是旧根高度窗与实际坡面样本的并集，stop-step swing 只另列，不从 headline 删除。不同运行帧相位与调度有差异，不主张统计显著改善。

| 原路线 | headline 样本 / 浮空 / 下陷 | 另列非 Stop-swing 样本 / 浮空 / 下陷 | 非 swing 最大浮空 |
| --- | --- | --- | --- |
| 当前完整 sole 基线 | 417 / 92 / 30 | 303 / 12 / 22 | 147.5 mm |
| candidate1（只修落点） | 393 / 97 / 29 | 278 / 16 / 21 | 102.6 mm |
| candidate2（等待脚加入 sole fit） | 392 / 96 / 0 | 280 / 21 / 0 | 144.1 mm |
| candidate3（恢复原等待脚下降速度） | 394 / 79 / 0 | 294 / 8 / 0 | 146.8 mm |
| final（同算法，补限幅诊断/普通截图） | 393 / 86 / 0 | 277 / 9 / 0 | 93.4 mm |

final 最低 sole **+1.5 mm**；9 个非 swing 浮空是 Run 2、Sprint 4、Idle 3（Stop 刚捕获仍在空中的等待脚）。另有 77 个 Stop swing 浮空完整保留。不能把这些摆动诊断删掉后将整项判过。

final：共享骨盆最大 **50 mm**、脚 shift 最大 **100 mm**、pitch/roll 各 **20°**。`astro check` 254 文件：**0 error / 0 warning / 135 hints**。`git diff --check` 与 bot `node --check` 通过。

最终姿态 A6：final 的四个完整 Stop block（含前后邻帧）及四个 Run/Sprint 高前伸失败 ±100 ms 窗口，去重后 **228 帧**；每帧完整同壳与跨壳关系表，`sampleStride=1`、`relationsAudited=true`，同壳/跨壳均通过。此前 candidate3 同口径 217 帧也通过。有限采样结果不代表连续时间或全动作通过。

## 剩余浮空的只读诊断

用 candidate3 历史最终 skin palette × 实际 GLB inverseBind 的逆矩阵重建关节；ground 由同帧实测静态坡面计算，并非新打射线。两帧 Stop 都 off，所以惯性后、IK 前髋高可由最终髋高加回 slope drop 得到。源髋高从同一 GLB 的 LINEAR 动画轨道、实际 clip timestamp 求值。

| 米 | Run t=2.4347 | Sprint t=7.0333 |
| --- | ---: | ---: |
| body centreY（由实际父组重建） | 5.430033 | 5.634924 |
| bodyY − PLAYER_CENTER_HEIGHT(0.88) | 4.550033 | 4.754924 |
| 实际 visual rootY / Slope baseY | 4.610033 | 4.814924 |
| root XZ 静态 groundY | 4.523993 | 4.632497 |
| 最低 sole XZ groundY | 4.481408 | 4.639146 |
| visual root 比 root 下地面高 | 0.086040 | 0.182427 |
| body−0.88 比 root 下地面高 | 0.026040 | 0.122427 |
| 源片段 hip 相对 visual root | 0.673471 | 0.652616 |
| 惯性后/IK前 hip 相对 visual root | 0.673471 | 0.654549 |

**口径发现**：`WorldActors.tsx` 视觉父组用 `−(PLAYER_RADIUS+PLAYER_HALF_HEIGHT)=−0.82`；`PLAYER_CENTER_HEIGHT=.88` 额外含 .06。因此现有 Slope baseY 是 body−.82，不能当成 body−.88。Run 的根高差有 60 mm 来自这一口径差，余 26 mm；Sprint 即使按 body−.88 仍比地面高 122 mm，根下和脚下坡面高差仅 −6.65 mm。髋源姿态/惯性残差不是该 Sprint 大浮空的主要解释。这里没有擅自改高度或刚体。

固定最终脚 XZ/姿态，把最低 sole 下移到同帧坡面、用完剩余 5 cm 骨盆额度后，Run 所需髋踝距离 **657.6 mm**、Sprint **691.5 mm**，均超过实际腿长 99.5% 的 **572.6 mm**。分别超 84.9 /118.8 mm；该计算只证明这些固定姿态目标不可达，不证明所有替代源动作都不可行。不能把根高/姿态问题笼统归为“源片段水平前伸”，也不能靠更多 IK、拉长腿或放宽预算掩盖。

## 看图与未验证

已亲看普通 `/world/`、1920×1080 黄昏默认/近景与夜间近景。当前角色剪影、平地站姿和邻近营地未见本补丁新引入的视觉缺陷；这些静态图不证明坡上正常速度手感或美术验收。截图位于外部 evidence 的 `final/normal-*.jpg`。

- 没有改几何/材质/GLB或新增 draw；未重跑全岛预算、车辆碰撞、库存、未改资产、全包或推送。
- 原坡路线仅约15°，未覆盖10/20/25°全矩阵、平地3/8 mm中性专项或坡上A3完整滑移；补探测触发态尚未复现。
- 录像首试因 Playwright ffmpeg 缓存缺失未生成；本轮保留完整逐帧数值、skin与普通入口截图，没有将它们冒称正常速度录像。
- Bobby 最可能说：“脚还是浮空。”已处理下陷根因并明确保留浮空失败；下一步应在根/胶囊与源姿态层定位，不在此分支无限调 IK。

TASTE §8 自检：1 已看普通默认/近景；2 已看图，既有环境非本补丁改动；3–7 无新资产，未冒称额外动作/碰撞通过；4 黄昏/夜档已看；8 无几何提交变化，预算未重测；9 批评如上；10 机器、看图和未验证分别列出，Bobby 接受未取得。

## 证据与复现

外部根 `/Users/bobby/Desktop/3D-personal-world/evidence/slope-followup`。每轮 `frames-*.json` 保留全部 sample；`final/runtime-skin-final.json` 保留全路线 skin；`final/runtime-skin-a6-windows.json`、`a6-windows.json`、`runtime-a6.json` 为受影响窗口及A6。`candidate3/reach-feasibility.json`、`root-ground-diagnostic.json` 与外部 `reach-diagnostic.py` 可复查只读推导；小报告 `slope-followup.json` 含hash、完整各口径统计、probe miss和窗口定义。

专用服务：`npm run dev -- --host 127.0.0.1 --port 4348 --config ../../evidence/slope-followup/astro-local.config.mjs --force`。外部 config 隔离 cache；全站 config 不变。

final bot：`G24_SKIN=1 G24_SHOTS=1 G24_TAG=final /Users/bobby/Desktop/3D-personal-world/tools/bot-run.sh slope-followup 4348 tools/world/character/slope-bot.mjs /Users/bobby/Desktop/3D-personal-world/evidence/slope-followup/final`。
