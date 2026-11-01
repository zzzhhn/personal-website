# 同步胶囊支撑诊断与两次停止的物理实验

基线 `c9e110c`。结论：**坡地大浮空包含真实物理离地，旧 grounded 远射线会继续判着地；两次受限竖向切向速度候选不足以修好。已撤掉两候选，产品运动链恢复 c9，只保留专用 QA 下的只读同步遥测。** 没有新增 IK、改 GLB、改 grounded、删样本或调整验收线。

## 同帧实证

`?qa=1&qaPhysicsSupport=1` 在最终 sole recorder 同一采样帧读取实际 body、速度、胶囊 bottom、静态射线、同尺寸 capsule 向下 cast 与真实接触 manifold；另保留上一物理步原 grounded 决策。后者与当前新射线分开，不能把一帧前的着地标记冒称当前真实接触。

| 同步基线 | Run t2.2607 | Sprint t6.8752 | Sprint t7.0258 |
| --- | ---: | ---: | ---: |
| body centreY | 5.450333 | 5.626660 | 5.333838 |
| body vy（m/s） | −2.267379 | −1.011111 | −2.825405 |
| 胶囊 bottomY（body−.82） | 4.630333 | 4.806660 | 4.513838 |
| 同 body XZ 实测静态 groundY | 4.531600 | 4.618846 | 4.400944 |
| 垂直底部间隙 | 98.7 mm | 187.8 mm | 112.9 mm |
| 同尺寸胶囊向下 cast 才接触的距离 | 86.6 mm | 175.9 mm | 101.0 mm |
| 有效 solver contact | 无 | 无 | 无 |
| gameplay grounded | true | true | true |
| 当前重新执行原射线的结果 | true | miss | true |
| 最终 contact 脚 sole 浮空 | 83.0 mm | 161.6 mm | 88.7 mm |

最坏 Sprint 的 true 来自上一物理步456：射线长度 .999783m（仍在原1m内）、vy−.806148、没有 jumpRequested。同步基线637帧中，12帧的旧 grounded 与当前新射线判定不同；原路线中所有6个 Run/Sprint 浮空帧都没有有效 solver contact。contactShape 在该实际 trimesh 查询下全部返回 null，未把它当有效距离；空 manifold 也没有当作真实支撑。

**修正上一报告的解释**：`.88 = .34 + .48 + .06` 是 spawn/recovery clearance；视觉父组 `.82 = radius + halfHeight` 正确对应真实胶囊底部，不能直接改成 .88，否则会把平地人物向下移60mm。同步平地真实受支撑83帧的 bottom−ground 中位数 **−1.068mm**，并无60mm视觉偏移错误。大浮空例中 render root 与实际 bottom 仅差5.2/13.6/7.4mm，含渲染插值和原 sole lift；先前由历史根推 body 的数值只是近似，不代替本次同步记录。

## 两个隔离候选：均已撤销

两次各只跑一轮原始坡路线，全部 contact 样本与原失败保留。headline 仍含 Stop swing，另列非 swing；脚底全部344点保留。帧调度/相位不同，极值变化不能独立证明改善。

| 原路线 | headline 样本/浮空/下陷 | 非 Stop-swing 样本/浮空/下陷 | 非 swing 最大浮空 | Run/Sprint 最大 grounded capsule cast |
| --- | --- | --- | --- | --- |
| 同步基线，无物理改变 | 390 / 86 / 0 | 277 / 8 / 0 | 161.6mm | 162.0 /175.9mm |
| adhesion1：真实支持后的向下切向速度匹配 | 370 / 64 / 0 | 276 / 8 / 0 | 152.3mm | 93.8 /174.4mm |
| adhesion2：本步实际XZ前向支持预测，支持平地上抑制非跳跃上弹 | 393 / 77 / 0 | 284 / 8 / 0 | 99.3mm | 153.6 /170.0mm |

adhesion1 只有6个显示帧施加向下 impulse，最小 −79.45Ns。Sprint 接缝先出现 vy+0.44；当前仍flat normal，随后 gap3.53mm大于引擎原 prediction distance 2mm，支撑锁按设计解除。下坡法线首次可读时，gap已13.31mm；不扩大contact或延长latch，就不能把后续约17cm悬空当作支撑继续拉下。

adhesion2 从本步真实支撑起点，以现有XZ impulse所得速度乘dt作前向 capsule 查询；用实际下一静态坡面切向vy施加仅向下 impulse。既不延长时间latch，也不把 .18m搜索包络当接触。合法上坡正切速度、jumpSeq和未重新真实支持的空中均门控。43个显示帧记录到负impulse（多数为浮点小量，最小 −87.28Ns）；每次 touching/forwardSupport 为true，0个未满足门控的吸附。**Sprint 实际胶囊间隙仍170mm，不能因sole极值变小判修复。** 没加spring或继续调参。

两候选的精确 `physical-candidate.patch`、完整 `WorldActors-candidate.tsx` 及 SHA-256 均归档在仓库外 `evidence/slope-followup/{adhesion1,adhesion2}/`，索引为 `adhesion-experiment-archive.json`；它们没有产品提交SHA，也不进入产品代码。恢复后去除QA只读记录的整个 `useBeforePhysicsStep` 与 c9 字节一致，双方 SHA-256：`4d6b1b5505f3fb5954e5a1557cad9b2b23024d531036dff8b45f88a95ecdd62c`。

## 证据和边界

外部根 `/Users/bobby/Desktop/3D-personal-world/evidence/slope-followup`：三轮 `frames-*.json` 保留全部样本；每轮 `support-impulse-all-samples.json` 与 `impulses.json` 保留支持查询、pre-step/最终sole及每次impulse；`restoration-check.json` 证明运动链恢复。小报告 `slope-support-diagnostic.json` 记录hash和关键行。

MediaRecorder 已在普通 `/world/`、1920×1080、真实按键、无QA API/fixture下生成两段正常速度 canvas WebM，路径 `{adhesion1,adhesion2}-normal/ordinary-ramp-*.webm`。已解码看 contact sheets；实际路线从出生点穿营地/草坡，**未精确沿营地公路坡**，所以它们只是普通入口运行录像，不冒称原路线物理验收或坡上正常速度美术通过。canvas录像不含DOM叠层。

本轮停止在物理实验失败：没有追加跳跃/A6验收（主线要求只有明显改善才补），未跑全岛、碰撞库存或未改资产。c9 的既有Stop/Slope修复和其228帧A6仍保留，不能用那份A6为已撤候选背书。最终只读代码 `astro check`、`node --check`、`git diff --check` 结果随提交报告。

下一层方案只在 [review-request](slope-followup/review-request.md) 提出，尚未实现或获架构许可。Rapier 官方的 [snap-to-ground 说明](https://rapier.rs/docs/user_guides/javascript/character_controller/#snap-to-ground) 同样以起步真实接触、向下位移及有限结束间隙为条件；其KCC自动平移方式没有用于本项目。该文档只支持支撑门控原则，不证明这里的dynamic spring方案已通过。
