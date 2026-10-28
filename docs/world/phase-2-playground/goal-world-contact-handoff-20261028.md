# 人物接触与镜头交接，2026-10-28

工作树：personal-world-phase2-character。分支：codex/goal-world-contact。基线：43f9507。

本轮修复一个真实动态物理恢复问题，完成相关狭角、镜头及设施回归。未改 integration/main、轨道、设施美术、音频或性能调度，未推送或更新 4341。

## 修复

同一个物理步中，坡地补偿力已添加而 after-physics 尚未清理时，玩家恢复或传送会调用 resetActorBody。它清空物理力，但原 WeakMap 仍保留补偿记录；随后的 clearPlayerSlopeGravity 会向已清空的刚体添加反向力。零重力隔离复现使用真实 15°支撑和 72 kg 胶囊，观察到约 -241.108 N 残留水平力，重置位置 `[20,3,20]` 一秒后变成 `[18.318665,3,19.999817]`。

player-ground.ts 新增 resetPlayerBody，在通用刚体重置之前先清理自身的临时补偿。WorldActors 的玩家 resetBody 分支使用该入口；clearPlayerMotion 也先清理临时力，覆盖通过共享 transient callback 执行的营地恢复。车辆重置仍使用原 resetActorBody。

回归证明：相同恢复顺序下，后续重复清理不再生成反向力，恢复后一秒仍为 `[20,3,20]`、力为零；禁用胶囊重置后重启支持帧不串状态；营地恢复后不漂移。没有改变坡地补偿公式、起步曲线、跳跃、坐姿或现有过山车登离动作。

提交范围：

- src/components/world/player-ground.ts
- src/components/world/WorldActors.tsx
- src/components/world/player-recovery.test.mjs
- 本交接文档

## 验证

第一轮串行命令：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/player-recovery.test.mjs src/components/world/player-slope-dynamic.test.mjs src/components/world/player-query.test.mjs src/components/world/player-motion.test.mjs src/components/world/world-recovery.test.mjs src/components/world/safe-landing.test.mjs src/components/world/camera-shoulder.test.mjs src/components/world/attractions/attraction-camera.test.mjs src/components/world/attractions/coaster-transition.test.mjs
```

81 项：79 通过、0 失败、2 跳过，约 6.6 秒。跳过的是未压缩 G24 缺失对应的真实跑步靴底与座面测试；未下载模型，不能声称这两项重新验收。其余涵盖真实坡道完整往返、墙边与狭通道、恢复与落地候选、国投柱旁镜头、矿区屋顶、过山车视角变换与上下车状态。

第二轮真实设施选择性回归：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 --test-name-pattern='station-side orbit|actual lower rails|west ramp|ramp crest|collision-free standing|actual mezzanine|reported drag|normal exterior' src/components/world/attractions/coaster-walk-camera.test.mjs src/components/world/attractions/ibd-yard-geometry.test.mjs src/components/world/camera-exchange.test.mjs
```

8 项：7 通过、1 失败，约 3.0 秒。通过实际下栏阻挡、国投西坡/北廊/侧廊通路、坡顶动态玩家、各站交互站位、交易所钟梁接触与 220 帧拖拽序列、坐姿/外部镜头目标保持。

失败发生于 coaster-walk-camera.test.mjs 的 station-side orbit。镜头距离 `>11.9 m` 的断言已通过；随后 `count < 650` 断言因当前固定碰撞体为 1074 而失败。这是未修改的 43f9507 设施/预算范围，未放宽断言，未隐藏碰撞体。

日志：`/tmp/world-contact-regression-20261028.log`、`/tmp/world-facility-contact-regression-20261028.log`。git diff --check 无错误。

## 跨线请求与剩余验证

请主线将固定碰撞体 1074 与旧测试上限 650 的差异交给过山车/性能线审查，决定优化或依据有效预算更新测试；本线未擅改该断言。

未启动浏览器、服务器、完整构建、Blender或下载资产。数值回归不代表本轮已有视觉/操控接受结论。主线可在既有重任务窗口复查：坡面恢复后无侧向漂移、站台/柱旁快速转镜头、狭廊起步与跳跃、完整过山车登离并恢复步行。两项真实 G24 测试需有现成未压缩模型的主线执行。

读取的角色工作树为稀疏检出，分工文档从 integration 只读取得，AGENTS 与参考合同来自当前 HEAD；只补齐源码和测试 loader，没有安装依赖。资源预检为内存压力 2、空闲磁盘约 2.01 GiB，本轮短测试均单进程串行。
