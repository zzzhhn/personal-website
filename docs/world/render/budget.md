# /world 同屏预算：工具与实测（render 会话）

## 1. 工具用法（所有会话、主线程通用）

```sh
/Users/bobby/Desktop/3D-personal-world/tools/bot-run.sh <worktree> <端口> tools/world/playtest/budget-peak.mjs [输出目录]
# 可选环境变量：BUDGET_VIEWS=spawn,camp  BUDGET_QUALITY=high|balanced|both  BUDGET_SIZE=2560x1440  BUDGET_HIDE=1  BUDGET_SHOTS=0
```

- 需要该 worktree 含 `WorldQuality.createBudgetProbe`（本分支提交；合并到集成版后各区自动可用）。页面里是 `__worldDebug.budget`（仅 `?qa=1`）。
- 视角：出生点、营地（黄昏/夜晚）、大道、环岛西段、北丘、南滩、园区、城区俯瞰、驾驶追尾镜头；另加 integration.mjs 的 QA 固定机位（`shot-*`，阴影窗口为全岛，是 QA 上限，不是游戏镜头）。传送全部记为 fixture，镜头用真实鼠标拖拽与滚轮。
- 每个视角只量**一帧真实渲染**：包住 `renderBufferDirect` 恰好一次 `render()`，按 pass（main / sun / fire）、按区、按对象记 draw call 与三角；总数与 `gl.info` 对账（报告里 `gl.info check` 列）。`BUDGET_HIDE=1` 再逐区隐藏做差，作为独立第二估计。
- 区的归属：`WorldQuality.ts` 的 `budgetZoneOf`（按挂载组名：`world-town`、`world-park`、`world-street`、`world-camp-content`、`world-guide-*`、车辆 userData 等）。挂在自己挂载组下的新资产不用打标签；挂在别处的设 `userData.budgetZone = '<区>'`。阴影代理和合并块会回指来源区，所以阴影开销也能按投影区拆开。
- 输出：`budget-report.json`、`budget-report.md`（总表、各区主 pass 表、各区阴影表）、每个视角一张小 JPEG。

## 2. 基线实测（2026-10-24 15:22，4338，codex/world-render @ 8ac1a76 + 本工具，1920×1080，高档）

证据：`/Users/bobby/Desktop/3D-personal-world/evidence/render/budget-baseline/`。

| 视角 | calls | 三角 | 其中阴影 |
| --- | ---: | ---: | --- |
| spawn | 218 | 556.3k ✖ | 121 / 118.5k |
| camp | 297 | 585.6k ✖ | 152 / 133.3k |
| camp-night | 269 | 585.2k ✖ | 147 / 139.8k |
| avenue | 198 | 392.0k | 100 / 30.6k |
| ring-west | 261 | 499.6k | 83 / 47.1k |
| south-beach | 263 | 463.1k | 81 / 33.0k |
| town-overview | 163 | 444.8k | 103 / 73.8k |
| drive | 170 | 306.7k | 91 / 16.0k |
| shot-overview（QA） | 398 ✖ | 522.3k ✖ | 216 / 97.4k |

公共开销（每个视角都在）：海+天 3 calls / **153k** 三角（限 40k）；地形 8 calls / **171k**（限 80k，terrain 会话负责）；阴影 **最多 152 calls / 140k**（限 85 / 68k），其中营地投影约 100 calls / 125k。城区、园区、街道、车辆目前仍是灰盒，所以各区数值还很小——正式资产进场后必须靠这里压出的余量。

优化后的数字与预算确认见后续章节。
