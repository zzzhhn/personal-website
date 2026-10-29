# IBD 移动货物安全联锁交接

2026-10-28。共享 integration 候选工作区。针对实玩中 A 托盘把站立玩家推行约 10 米的问题，增加启动前及逐物理步人员占道联锁。未开浏览器、构建、提交或推送，未修改 WorldIbdGuide、厂区边界及其他场景。

## 行为与实现

- 从 Rapier 的 `player-capsule` 读取真实形状、位置、旋转及速度，不依赖约 90 毫秒更新一次的 HUD 位置。
- 启动前检查完整运输路线；运行时检查下一物理步及玩家短时速度预测。直线扫掠配合接触距离查询，旋转使用分段保守包围，安全间距为 0.18 米。涵盖装卸、退换、吊运、翻转、称重及放行门。
- 占道时冻结动作时间并重新提交当前刚体姿态，显示“运输通道有人，请退到拉杆外侧；清空后自动继续。”清路后自动续行，无补时跳跃。等待期间约每 0.1 秒重试。真实胶囊尚未就绪时也暂停。
- 不移动玩家，不关闭货物碰撞。暂停、离场及观察动作的既有语义保留；玩家因驾驶或座位状态停用胶囊时沿用现有状态处理。
- 退换货改为原货和备件两个连续刚体，消除中途由隔离位跳到备件位产生的虚假扫掠。备件初始停用，在全路线安全检查通过后启用。
- `motionWait` 独立于业务动作，状态提示不会重置动作时钟；完成动作在物理步结束后提交。

## 文件范围

- `ibd-yard-safety.ts`、`ibd-yard-safety.test.mjs`：新增配对形状查询、可暂停时钟及定向测试。
- `ibd-yard-motion.ts`：路线作为动画与安全检查的共享来源；退换货两段物理姿态。
- `WorldIbdMechanisms.tsx`：物理步联锁、独立备件刚体及完成回调。已修正不受支持的 `RigidBody enabled` 属性，改用实例 `setEnabled`。
- `ibd-yard-store.ts`、`ibd-yard-copy.ts`、`WorldIbdHud.tsx`：独立等待状态及双语提示；HUD 仅增加等待提示。

## 验证

以下命令串行占用并释放共享 heavy lock，均通过：

```sh
node --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/ibd-yard-safety.test.mjs src/components/world/attractions/ibd-yard-game.test.mjs src/components/world/attractions/ibd-yard-guide.test.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler --allowImportingTsExtensions --jsx react-jsx src/components/world/attractions/WorldIbdYard.tsx src/components/world/attractions/WorldIbdHud.tsx
```

21/21 测试通过，类型检查零诊断。安全测试包括：报告 A 点 `[8.68,.9,-6.22]` 阻止启动、正常 B 外侧点 `[21.69,.9,-4.69]` 放行、清路后续行、暂停及胶囊缺失不推进、真实 Rapier 动态玩家中途进入后停货且静止玩家不被带走、旋转与垂直间距、退换货路径连续、有限频率重试。

尚未进行浏览器中的 19 步回归和视觉验收。主控接续时应复验 A 原报告点等待提示、退到拉杆外侧后续行、途中进入通道、B 正常站位、退换货以及暂停恢复；源测试通过不等于上述实玩已经验收。
