# 山路木护栏补测：关闭未到目标的验证缺口

## Status

源码基线 `3a6d7c2`，没有修改运行时、物理、布局、模型、阈值或现有测试脚本。此前 `rails-impact/impact.json` 的越野车起点被沿途物体挡住，离目标还有11.317 m，不计目标通过；本次保留原失败，补齐 `rail-beam-12` 的有效人车接触。

## Result

目标原位 `[-11.818705,3.514,-84.890319]`。按原护栏位置和山丘中心，选择道路内侧短直线接近，避开旧起点到目标之间的其它护栏；没有移动或关掉任何障碍。

| 本次用例 | 实际目标接触 | 结果 |
| --- | --- | --- |
| 越野车 | 保存的下采样记录中9帧明确命名 `street-knock-rail-beam-12`，不是其它street碰撞 | 接触前300 ms速度峰5.375 m/s，车身最大上抬0；木梁移开5.254 m、最大根升高0.232 m；原30 s流程后回原位、home且sleeping |
| 人物 | 41帧明确命名同一目标 | 接近峰速5.937 m/s，最近中心距离0.422 m，保持阻挡，人体最大上抬0.0366 m；梁保持原位 |

越野车穿过的是撞开后留下的原占位，不能据此称穿越实体或全程零重叠。木梁中心峰速估计6.72 m/s，保留原数据，不描述成完全静止或零弹跳。复位等待27.17 s从撞后已观察数秒并离开目标以后计时，不是缩短30 s。

## Verification

- 两项均初始休眠。驾驶用例读取到真实 activeVehicle=offroad，之后只用 W / Space；步行只用 WASD / Shift，0页面异常。
- 目标名称逐条核验，不能只用旧脚本的 generic firstContact 标志。原工具保存样本每3帧留1帧；未声称未保存子帧零穿入。
- 初始位置使用明确 QA 夹具。原工具的 fixtureCalls记录玩家起点/离场，车辆teleport由case参数、脚本构造和实际initial位置提供，未伪称有完整车辆fixture事件流。
- 已查看撞开后缺口及人物阻挡截图。原始1920×1080 PNG、完整 impact.json在 `/Users/bobby/Desktop/3D-personal-world/evidence/integ/hillbeam-direct-20261025/`；[小摘要与原始哈希](hillbeam-direct-20261025.json)保留所有存下来的目标接触帧。
- 没有新增测试、没有全量重跑，也未重跑未变的类型/构建/预算。

复现：原 `tools/world/street/impact.mjs`，`STREET_CASES`两项均target=`rail-beam-12`，car from=`[-17.111,-84.631]`、speed=5；person from=`[-16.014,-84.685]`，contactPrefix均=`street-knock-rail-beam-12`。`STREET_SIZE=1920x1080`，`STREET_RESET=1`、`STREET_RESET_CARS=1`。开发基址为4330。

## Handoff

只关闭“未真正到达山路目标”的既有验证缺口。不外推到其它木梁、三车全部速度、全岛碰撞或美术验收。起步滑步、坡地浮空及两个待审约束仍见 `docs/world/integration/motion-followup-20261024.md`。本轮复核 WorkBuddy 仍为全局额度耗尽、发送禁用，未送审、未改冻结文档。
