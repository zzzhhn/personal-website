# Motion follow-up candidate — 2026-10-24

基线 `44a339e`，独立分支 `codex/world-motion-followup`。本轮只改起步相位/推进后 planted 标记和量测漏报。结论：**候选未达到 A3 起步验收；两段最终姿态的窄 A6 通过。** 没有改 IK、物理、原 contact mask、阈值或全站配置，不阻塞整岛可玩候选。

## 改动

- Idle / IdleLook / Land → gait：读取实际显示脚底的最低点，保留较低支撑侧；用原 contact 曲线和已有 `soleMin`（72 相位表线性插值）筛选下一显示相位，再按原踝距离选最接近姿态。6 mm 沿用 motion-metrics 原支撑带，不改 mask。没有可兼容样本时仍回退原最近姿态，不伪造接触。Turn → gait 未加入此次筛选。
- Inertializer 的 gait planted 标记改为 `phase.advance(...travel...)` 后的目标接触，和随后 mixer 实际推进相同。保留 `qa=1&guideEntryLegacy=1` 供旧相位/旧标记 A/B；两边均使用修正后的全量 recorder。
- recorder 保留既定 sole 索引的全部样本，取消 `h < 0.1` 删样；每帧实测固定 344 个点，包括 >=100 mm 点。
- slope reducer 改用实际倾斜足底 probe 判断坡面；headline 是实际坡面与旧根高度窗口的并集，保证旧失败不丢。另列旧窗口、全部 stance、无 probe / 缺 sole 样本；`drop` 误名拆为 `reachError`、`pelvisDrop`。浮空 >20 mm / 下陷 <-15 mm 不变，stop-step swing 仅另列不删除。

## 同一脚本真实按键 A/B

原 `motion-bot.mjs` 仅运行原始 idle 800 ms + start-run 1400 ms。当前基线原序列会 Idle → TurnL → Run，因此另做明确标注的补充：先真实按键对齐 heading，释放并站稳，仅 fixture 重置原位置，再执行相同起步片段。未把转身 A/B 当作入口筛选效果。

| 片段 | 旧入口最大滑移 | candidate 最大滑移 | Run-only 旧 → 新 | switch pose jump 旧 → 新 |
| --- | ---: | ---: | ---: | ---: |
| 原序列（含 TurnL） | 333.5 mm | 167.6 mm | 102.9 → 167.6 mm | 26.6 → 26.2 mm |
| 同方向补充（Idle→Run） | 187.1 mm | 181.9 mm | 112.6 → 6.0 mm | 31.7 → 37.8 mm |

同方向入口原 phase=0.1474、contact=[0,0]；candidate phase=0.3687、contact=[0,1]，确认筛选生效。但完整起步 **181.9 mm >80 mm**；姿态跳变也未改善。没有降低阈值、隐藏 Idle>Run 区间或继续迭代。每模式仅一次，帧相位/调度不同，不宣称统计显著提升。Land 分支本轮未实跑，原 Turn 入口仍有同类风险。

最终 skin matrices A6：原 candidate 和同方向 candidate，各审查首个 Run 前一帧至 Run+250 ms 的 **17 帧**，每帧完整同壳/跨壳及原 relation table，`every=1`，均通过。只是这两个预先定义窗口的 34 帧，不是整套动作或连续时间保证。原始 JSON/hash 见 `motion-followup.json`。

## 旧坡地报告离线重算（没有重跑坡地路线）

| 口径 | 样本 | >20 mm 浮空 | <-15 mm 下陷 |
| --- | ---: | ---: | ---: |
| 旧高度窗（原样保留） | 342 | 40 | 21 |
| 旧高度窗另列非 stop-step swing | 265 | 5 | 20 |
| 补实际坡面后的 headline | 363 | 54 | 23 |
| headline 另列非 stop-step swing | 272 | 7 | 22 |
| 所有可量测 stance | 456 | 81 | 46 |

旧 recorder 已删除的高浮空样本不能恢复，只明确列为缺 sole；不得用 slope.achieved 替代最终 sole 伪造测量。新增完整 recorder 需未来原路线验证。已知 85.9 mm Sprint、63 mm Idle 以及旧失败全部保留。

## Stop/Slope 后续窄补丁建议（本轮未实现）

`WorldGuideStop.ts:249 idleTarget` 目前给平地 idle ankle 加 groundOffset，仍使用平地 idleQuat；`:409 solveLeg` 随后覆盖坡面已算好的脚姿态。应只给现有 Stop target 增加同一实际坡面法线/现有倾角夹限，并按该脚旋转后真实 sole underside 反推 ankle Y；保留 step 的 XZ、队列、原两个 IK、总骨盆 5 cm 与腿长 99.5%。最后在 Stop 之后量最终 sole 对同一 plane 的残差。不要加入第三次求解，也不要直接把 slope.achieved 当最终结果。probe hit 丢失/延迟淡入、既有 shift/reach 限制仍需独立定位，本轮不借此重写。

## 复现与证据

外部证据根：`/Users/bobby/Desktop/3D-personal-world/evidence/motion-followup`；`ab/frames-*.json`、`ab/report-*.json`、`ab/runtime-skin-*.json`、`runtime-a6*.json`、`slope-reanalysis.json`、`astro-check.log`。GLB hash、报告 hash、逐项指标在同目录报告 JSON 中。

启动专用服务：`npm run dev -- --host 127.0.0.1 --port 4347 --config ../../evidence/motion-followup/astro-local.config.mjs --force`。外部 config 隔离 Vite cache，仓库 astro.config 未改。首轮 Vite 504 导致 actor 加载超时，重启该专用服务后四轮 bot errors=[]。

bot 使用 `/Users/bobby/Desktop/3D-personal-world/tools/bot-run.sh motion-followup 4347 tools/world/character/motion-bot.mjs <evidence>/ab`，四轮均 `G24_STARTUP_ONLY=1`；baseline 加 `G24_ENTRY_LEGACY=1`，候选加 `G24_SKIN=1`，同方向补充均加 `G24_ALIGN_STARTUP=1`，各自 `G24_TAG` 为 baseline/candidate/aligned-baseline/aligned-candidate。A6 用既有 `runtime-a6.py`，不加跳帧或禁用 relations 参数。

`git diff --check`、3 个改动脚本 `node --check` 通过。`astro check` 检查 254 文件：1 error / 0 warnings / 135 hints；唯一错误是基线已有 `WorldTownAssets.tsx:123` TS2352 `Object.fromEntries` 类型断言，修改文件无报错，本轮不越权修 town。没有跑全岛、库存、全包或发布。
