# IBD 非预算失败审计

2026-11-06；基线 `e2abcb8`。初审阶段为只读审阅与串行 CPU 定向测试；随后仅按追加授权修复测试，见下一节。全程未修改业务源码，未运行浏览器、Blender、构建或完整类型检查。

## 已授权测试修复

初审后，按主代理追加授权，只修复以下 5 个测试/helper 文件；本节为当前状态，下文保留初审归因与 HEAD 失败证据。

- `src/components/world/attractions/ibd-test-pack-inspection.mjs`：新增显式测试玩家选择器，将 `stock-room` 引导目标展开为真实 `stock-a/stock-b` 操作。先走两台 `open`、四槽 contact/measure/return，再依据已经测出的读数选择 M8；不依据外标或偷偷写入证据。实体识别使用 `yardPackItem`，备货验样与 shipment 证据分开断言。
- `src/components/world/attractions/ibd-guide-route.test.mjs`：保留原引导路径 sweep，另外 sweep 到实际备货验样台的通路，避免仅把区域目标当成虚拟箱来完成。
- `src/components/world/attractions/ibd-guided-round.test.mjs`：保留 192 条恢复旅程；分别验证 B 箱隔离与钢卷直接 replace 的契约，状态指纹包含 stock/验样状态，继续断言隔离旧证据及新货证据清空。新增 stock-room 专项，覆盖异常批次 1/3、轮次 1/2，共四组：两台真实验样、按读数选择、转回 B 台后清空验样、重新称重/开箱/完整检查/判断/装车/核对/放行。
- `src/components/world/attractions/ibd-yard-recovery.test.mjs`：取消、暂停、旧 token 和重入测试针对展开后的真实 `open/select-stock` action 执行；依据实际钢卷 exchange 与 B 箱库存归属分别检查最终状态。
- `src/components/world/attractions/ibd-signs.test.mjs`：校验 27 牌的 108 顶点、54 三角形和 54 次文本绘制；新增两牌分别位于 stock-a/stock-b 的低位站牌位置，保留各语言名称和相同 M8 外标；stock-room 不生成第三块实体验样台牌。

串行验证结果：

- 原 17 项加新增 stock-room 专项：**18/18 pass，0 skip**。其中 192 条恢复旅程共 4,208 个引导动作。日志 `/tmp/ibd-full-craft-20261106/contract-audit-fixed-tests.log`。
- 受共享 helper 影响的 `ibd-yard-guide.test.mjs`、`ibd-yard-verdict.test.mjs`、`ibd-action-audio.test.mjs`：**25/25 pass，0 skip**。日志 `/tmp/ibd-full-craft-20261106/contract-audit-helper-consumers.log`。
- 修改的 5 个测试/helper 文件 `git diff --check` 通过。未改业务源码、放宽真实行为、删除断言或新增 skip；未运行 build/browser/Blender。

定向测试命令使用 `node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 --test-reporter=spec`，第一组追加下文五个测试路径，第二组追加本节列出的三个 helper 消费者测试路径。修复后测试使用工作树源码；下文的 HEAD 加载器只用于保留初审复现，不用于验证修复。

## 结论

`/tmp/ibd-full-craft-20261106/tests-initial.log` 共 181 项：167 pass、12 fail、2 skip。剔除 5 个 geometry-budget 失败，剩余 **7 个失败全部可在 HEAD 原始源码复现**，本轮没有引入这些失败的证据。分为：5 个测试驱动未接入后库选择流程、1 个旧 replace 即时换新假设、1 个过时标牌数量断言。建议更新测试适配现有交互契约，不回退后库业务逻辑。

## 复现证据

- 定向复现日志：`/tmp/ibd-full-craft-20261106/contract-audit-head-tests.log`。
- HEAD 加载器：`/tmp/ibd-full-craft-20261106/contract-audit-head-loader.mjs`。通过 `git show e2abcb8:<path>` 读取项目 `.ts/.tsx/.mjs` 后转译运行；未建立新 worktree，未覆盖工作文件。
- 串行执行 `ibd-guide-route.test.mjs`、`ibd-guided-round.test.mjs`、`ibd-yard-recovery.test.mjs`、`ibd-signs.test.mjs`、`ibd-stock.test.mjs`：17 项，10 pass、7 fail，失败名称和断言与初始日志一致。
- `git diff HEAD` 确认 game、guide、route、layout、motion、stock、pack-inspection、signs 及上述旧测试/helper 没有本轮修改。HEAD 重放仍恢复本轮已改的几何依赖，排除了新几何导致这些断言失败的混淆。

## 具体分类

以下文件均在 `src/components/world/attractions/`。

| 失败测试与断言 | 原因与 HEAD 证据 | 建议 |
| --- | --- | --- |
| `ibd-guide-route.test.mjs:22`；`ibd-guided-round.test.mjs:80`；`ibd-yard-recovery.test.mjs:25`、`:50`、`:109`，最终均在 `ibd-test-pack-inspection.mjs:18` 得到 `undefined !== 'hardware-pack'` | guide 在 `game.stock.requested` 时返回 `contents/stock-room`，见 `ibd-yard-guide.ts:65–67`。这是“自行验样选箱”的引导目标，不是一个真实货箱站。旧驱动对所有 `contents` 直接调用 `inspectIbdTestPack`，而 helper 在 `:16–18` 用 `yardItemId` 在 shipment case 中寻找实体，故在后库阶段失败。HEAD 原样重现 5 项。 | 修测试驱动与 helper，不修生产 guide。后库阶段显式选择实际 `stock-a/stock-b`，通过真实 `open`、口袋 contact 和 `select-stock` 后恢复引导。真实箱查询改用 `yardPackItem`；保留“后库验样不发 shipment proofs”的区别。不要为让 helper 通过而把 `stock-room` 伪装成实体箱或自动选货。 |
| `ibd-guided-round.test.mjs:55`，内部 `finishGuided` 的 `:35`：replace 后 `parts-b` ID 未立即改变 | `ibd-yard-game.ts:164–168` 明确把 B 箱 replace 定义为原货隔离并设置 `stock.requested=true`，不立即生成新货。相对地，钢卷 replace 在 `:170–176` 才进入 `exchanges` 并生成 replacement ID。旧测试 `:33–38` 对全部 replace 统一断言立即换 ID/追加 exchange；`:25` 的停滞状态指纹也没有 stock 状态。HEAD 原样重现。 | 修测试按货物分支验契约。B 箱 replace 验隔离及空 B 台，选择库存成功后才验新 ID 和无继承证据；钢卷保留原 replace 检查。同步更新状态指纹及 `:51` 的统一 exchange 数量假设。第二个失败用例 `:83–85` 等待所有异常货物出现 `notice='replaced'`、读取 `exchanges[0]` 的旧假设也需同步。 |
| `ibd-signs.test.mjs:48`，`:53`：位置顶点数实际 108、预期 100 | 生产 `ibd-signs.ts:8–24` 为 7 个固定标牌加排除 `stock-room` 后的 20 个站牌，共 27 个；每牌 4 顶点、2 三角形、2 文本。现有预期仍按 25 牌写死为 100 顶点、50 三角形、50 文本。HEAD 原样重现。 | 修过时测试数量为 108/54/54，或从明确站牌集合推导数量并额外断言 `stock-a/stock-b` 两牌存在。保留单 batch、两语言、UV 和移动包围体检查。无需删生产标牌来满足旧数量。 |

## 防止误修的现有契约

HEAD 的 `ibd-stock.test.mjs` 五项全部通过，其中 `:54` 用例覆盖：原箱隔离后 B 台为空、错误选择、签字退回、正确选择以及重新完整检验；`:59–62` 直接要求 `stock.requested=true`、`exchanges=[]`、B 台不可操作。它与旧 guided 测试的即时 replacement 假设冲突，说明应更新旧 harness，而不是逆改当前业务。库存识别使用 `yardPackItem`，见 `ibd-yard-game.ts:42–45`；备货实体的 action 见 `:78–84`。

日志未出现独立 TypeError、模块加载错误或 TypeScript 诊断；这不构成类型检查通过。2 个 skip 是等待箱体/台座导出的既有验收边界，不计入这 7 个失败。本报告不评价 geometry-budget 的增量、最终 GLB、玩家视角或完整流程运行结果。

复现命令：

```sh
node --experimental-loader /tmp/ibd-full-craft-20261106/contract-audit-head-loader.mjs --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/ibd-guide-route.test.mjs src/components/world/attractions/ibd-guided-round.test.mjs src/components/world/attractions/ibd-yard-recovery.test.mjs src/components/world/attractions/ibd-signs.test.mjs src/components/world/attractions/ibd-stock.test.mjs
```
