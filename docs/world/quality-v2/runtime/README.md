# 运行时验收入口

`acceptance-summary.json` 是完整 acceptance-r3 日志的简短投影，未替代原始按键、位置与接触记录。64 个复合案例全部通过，实际已采样视觉边界差最大约 7.03 cm（G20），小于 15 cm；C08 另有桌上高度隔离查询，门口按进出判定。

- 碰撞实现：WorldCampPhysics，从最终资产取得静态硬物网格/帐篷墙壳/灌木闭核，共用 WorldCamp 实例变换。
- 地面、画质、阴影、动效：WorldTerrain / WorldQuality / WorldEnvironment / WorldWind / WorldNatureMotion / WorldWater。
- 角色：WorldGuide，按真实速度驱动、自制 GLB mixer；模型后续修改只补角色专项，不把旧角色动作结果算作新 hash 的证据。
- 检查与录像：`../playtest/README.md`；跨区通用审计：`../general-audit.md`。

碰撞是首实例四方向覆盖；没有声称所有实例、所有角度或所有驾驶速度全覆盖。所有正式通过仍等待 Fable 最终 A–D 判定及 Bobby 接受。
