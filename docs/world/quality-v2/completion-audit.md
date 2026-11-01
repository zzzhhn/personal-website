# 完成性审查（2026-10-22）

依据：Bobby 六项反馈、既有授权边界、Fable `验收-营地返工-20261021.md` A–D 与 C1-a/b。本表依据 Fable 11:25 的逐项判定更新；原文见 `fable-verdict-20261022.md`。用户否定的 c507506 不能作为通过基线；75d2f9c 的 d3 角色也已发现自交，不通过角色几何。

| 项 | 当前证据 | 判定 / 尚缺什么 |
| --- | --- | --- |
| A1 默认与近档能读出头盔人 | motion-r4/default-dusk、guide-near，G24六视图 | Fable 11:25 判过；原始证据与局限保留。 |
| A2 与锁图比例、衣服、右包/点相符 | guide final六视图与A2_vs_lock并排图 | Fable 11:25 判过；原始证据与局限保留。 |
| A3 Idle/Walk/Run/Jump 与转向/切换 | motion-transitions.md、两档真实按键录像 | Fable 11:25 判过；原始证据与局限保留。 普通入口已启用，Opus 5.5 已确认补证完成。 |
| A4 视觉与胶囊贴地 | motion-r4鞋底采样0下沉、近图，视觉补偿最多1.53cm | Fable 11:25 判过；原始证据与局限保留。 |
| A5 自制骨架契约 | guide manifest rig.type=custom-L1、18骨、5 clips | Fable 11:25 判过；原始证据与局限保留。 |
| A6 各闭壳自身零非共面自交；有意嵌入单列，非预期跨部件穿插为0 | guide/final/a6，三份73aa运行时关系报告 | Fable 11:25 判过；原始证据与局限保留。 |
| B1 三树形和叶片 | G16/17/18回读六视图、运行树群图 | Fable 11:25 判过；原始证据与局限保留。 |
| B2 枝干比例/连续性 | nature manifest及qa_report、3种干/冠比<1/6 | Fable 11:25 判过；原始证据与局限保留。 |
| B3 灌木分层 | G19/20回读六视图 | Fable 11:25 判过；原始证据与局限保留。 |
| B4 岩石形状/接地 | G21–23回读与运行证据 | Fable 11:25 判过；原始证据与局限保留。 |
| B5 技能预算/倍率 | nature manifest/native+GLB计数 | Fable 11:25 判过；原始证据与局限保留。 |
| B6 两档三阶绿 | motion-r4 overview-dusk/night | Fable 11:25 判过；原始证据与局限保留。 |
| C1 16类四方向 | acceptance-r3 64/64复合案例、runtime简表 | Fable 11:25 判过；原始证据与局限保留。 |
| C2 帐篷门洞进出 | acceptance-r3日志/内图、C03/04实际壳体 | Fable 11:25 判过；原始证据与局限保留。 |
| C3 solid/可跨/trigger声明 | 清单、G23 step-over-derived | Fable 11:25 判过；原始证据与局限保留。 |
| C4 地面细节一致 | WorldTerrain和近/远实际图 | Fable 11:25 判过；原始证据与局限保留。 |
| C5 根固定微风 | motion-audit、整树/帐篷5.5秒视频、暂停/reduced检查 | Fable 11:25 判过；原始证据与局限保留。 |
| C6 实际buffer | motion-r4渲染记录和原图 | Fable 11:25 判过；原始证据与局限保留。 |
| C7 灯光色板保持 | source+同机位双档对照 | Fable 11:25 判过；原始证据与局限保留。 |
| D1 WASD/Shift/Space/E与日志 | final.mjs/acceptance-r3实际按键、入车/出车检查 | Fable 11:25 判过；原始证据与局限保留。 |
| D2 路线/碰撞/帐篷/跳/出口 | 11路点连续按键0恢复 + 64隔离案例 + 0错误 | Fable 11:25 判过；原始证据与局限保留。 |
| D3 画质日志 | 同C6 | Fable 11:25 判过；原始证据与局限保留。 |
| D4 自行运行 | playtest/README.md | Fable 11:25 判过；原始证据与局限保留。 |
| 四技能注册 | 本地4技能与Downloads附件25文件hash一致（前轮核对） | 已注册；不等于每项模型检查自动通过 |
| 全世界同类问题 | general-audit、非营地展示台/建设牌碰撞修正、已有connection三条通过一次 | 已作系统审查；其余区域正式资产与高速驾驶不在本轮通过结论内 |
| 分支/PR/预览 | codex/world-greybox、PR1 draft、1e0965f自动预览成功；普通入口录像和17个hash | 普通入口已启用，0页面/HTTP错误；不手动部署 |
| Fable最终A–D | 2026-10-22 11:25逐项判定、PRD v1.6/Art Lock v3.3 | 全部通过，普通入口启用条件已获Opus 5.5确认解除 |
| Bobby接受 | 无 | 未取得，不代签 |

目前下一步：交 Bobby 从普通入口试玩。2026-10-22 11:25，Fable 已按 A–D 逐项通过并接受停步 IK 最小例外；73aa 为形象基线。普通入口已在 1e0965f 启用并完成真实 Cloudflare 录像补证；当前 Opus 5.5 审阅会话已核验录像并解除附加条件。Bobby 尚未接受，灰盒手感门未签字。

已知失败：原生Jump局部35.85mm仍失败，不回填为通过。未验证：M1 Air真机、全实例所有角度、高速车辆与轮胎侧碰、复杂斜坡、Run中起跳、近处遮挡、其他区正式资产。灰盒手感门未签字。
