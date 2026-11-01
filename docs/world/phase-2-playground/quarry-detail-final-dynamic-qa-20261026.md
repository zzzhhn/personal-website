# 冻结 detail 资产动态 QA，2026-10-26

冻结目录：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-art/public/world/alpha-mine`。

本报告记录主线要求的同一轮最终复测。美术随后确认的冻结哈希与该轮测试前后哈希完全一致，再次只读核对仍一致，因此没有重复启动未变化的测试。不是额外一轮新实机验收。

| 文件 | SHA-256 |
|---|---|
| quarry-static.glb | `61b22e1fd5cc1572df088946dfbf366fe3ca14fc39166e4cf3e23858b0aea10d` |
| colliders.json | `1316cedc6b207d7458f8bb5b5ae114e829f4555e1ee3b75f644d4cfcff86572e` |
| layout.json | `5ac05059833ca8fd4b547a2326e217e0898d3e911d63df252fb8dd3cc9afc4df` |

角色测试代码为 `92fbc0d`，入口修复已由主线审阅合入 `f99ab3d`。从 character worktree 执行：

```sh
ALPHA_MINE_TEST_ASSETS=/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-art/public/world/alpha-mine node --max-old-space-size=192 --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/alpha-mine-foundation.test.mjs src/components/world/quarry-traversal.test.mjs
```

**结果：20/20 通过，0 失败、0 跳过，进程退出 0。原断言未放松。** 测试按文件串行执行，保持原尺寸胶囊、原重力／扫掠／贴地响应，无跳跃、恢复或路线中途瞬移。

- 入口 9 项：实际 14 厘米高差、三角朝向／坡度、原卡点、正反向、土径斜向、左右通道与边肩进入通过。基准为真实矿区碰撞与生产 terrainHeight 局部补片。
- 路线 11 项：出口合同、9 条连续物理行走、旧夹槽安全断言通过。两条正式低出口均完成正反向；核心／外围西坡、箱东侧、西低槽侧向及外围坡东边路线未被新碰撞阻断。
- 旧夹槽南／北尝试均为 `spawn-overlaps-solid`：原位置已由实体填合，不能再容纳站立胶囊。本报告不将其称为“从夹槽走出”。

原始本机日志：`/tmp/quarry-detail-final-tests.log`。该文件仅作主线读取本轮输出的临时佐证，后续可清理；核心结果、命令和哈希已固化于本报告。

未启动浏览器、GUI、Blender、服务或构建，未更新 4341，也未改美术资产。本轮没有验证实际键盘／镜头／动画、所有可能坠落位置、Safari 或完整性能。美术报告的其它 21 项检查属于其独立证据，不合并计入本报告的 20 项。
