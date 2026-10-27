# 动态玩家坡地修复，2026-10-28

在共享 integration、codex/world-alpha-pilot、起始 HEAD a238b61 上完成，未提交。保留主线与植被、性能同伴改动。

## 原因与最小修复

实际玩家是 72 kg 动态胶囊，半段 0.48 m、半径 0.34 m、零摩擦 / Min 合并、线性阻尼 0.2、重力缩放 12.5/9.81，物理步长 1/60 秒。水平运动使用 playerVelocityChange 的渐进控制。无摩擦坡面每步产生下滑速度，渐进刹车无法使这种持续输入归零。旧地面测试直接设置目标水平速度，kinematic 景观测试也没有覆盖这条实际链路。

player-ground.ts 新增 compensatePlayerSlopeGravity / clearPlayerSlopeGravity；只在 grounded 的真实静态可走接触面，且未沿法向离开、未请求起跳时，施加水平补偿力 `-m*g*n.xz/n.y`。重力与补偿合成后指向支撑法线，Rapier 保留碰撞与法向支撑责任。该力与重力在相同子步积分，物理步后仅撤销本 helper 的力。不能替换成一次性冲量，实测会产生“末速度近零、位置仍漂移”的子步误差。

WorldActors.tsx 仅增加相关导入、正常步行分支的补偿调用、QA supportDecision.slopeGravity 字段，以及 useAfterPhysicsStep 清除。坐姿跳过补偿；乘车、过山车、跳越和恢复分支不引入新力。原 playerVelocityChange、followPlayerGround、grounded 12 mm 阈值、25°坡度边界、零摩擦设置均未改变。没有位置锁、传送、竖直向上补偿或全局摩擦提升。

## 动态证据

新增 player-slope-dynamic.test.mjs 使用生产胶囊、质量、重力、阻尼、CCD/soft CCD、零摩擦/Min、固定步长及真实控制调用顺序。每个静止读数在初始落稳或松键刹车 1 秒后测量 10 秒，不把原有刹车距离当作漂移。

| 场景 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 15°静态坡，10 秒水平漂移 | 2.834776 m | 0.000096 m |
| 15°上坡行走后松键，后续 10 秒漂移 | 未单独记录 | 0.002632 m |
| 15°下坡行走后松键，后续 10 秒漂移 | 未单独记录 | 0.000002 m |
| promenade 第一高点附近，10 秒漂移 | 2.370208 m | 0 m |
| QA 实际停点附近，上行/返程各 10 秒漂移 | 主线现场已观察下滑 | 均为 0 m |

最终实际几何回归通过 `[66,1.08,-141] → [95,1.08,-147] → QA停点XZ[108.57,-159.89] → [110,6,-163]` 及原路返回。QA停点两次落稳胶囊中心为 `[108.532692,6.087485,-159.855484]`、`[108.587196,6.109267,-159.937515]`。六段均到达，各段短暂非 grounded 帧数为 0、0、2、1、0、0，没有放宽判定来隐去接缝。

集中回归命令：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/player-slope-dynamic.test.mjs src/components/world/player-ground.test.mjs src/components/world/player-ground-exchange.test.mjs src/components/world/player-motion.test.mjs
```

35 通过，0 失败，0 跳过，约 2.9 秒。覆盖平地 8 m/s² 起步、上下坡、松键停止、跳跃/离地、悬崖掉落、动态支撑与陡面不补偿、保留其他力、墙边离开、窄通道、旧地面和真实交易所楼层回归。git diff --check 无错误。旧 exchange 测试需项目现有 loader 解析 extensionless imports；未改它的源码。

日志：`/tmp/player-slope-before-20261028.log`、`/tmp/player-slope-final-20261028.log`。

## 独立的高处平台几何阻挡

尝试继续到 `[105,9.08,-177]` 时，动态胶囊停在 `[105.012886,9.448377,-174.659027]`。接触到 lookout collider：center `[105,8.88,-181]`、half extents `[6,.2,6]`，前缘 `z=-175`、顶面 `y=9.08`。平台向斜坡前方伸出，入口形成约 0.4 m 的真实竖直高度差，沿原路线中心约 0.44 m。

这不是松键下滑，超出人物 helper 的几何归属；已告知主线，没有用吸附或自动跨越掩盖。失败证据保留在 `/tmp/player-slope-seam-20261028.log`，已去除庞大的网格数组，只留有界诊断。最终通过的实际路线回归明确止于第一高点，不代表最高观景台贯通。几何接驳调整后应扩展动态路线并重新验证。

## 边界与交接

未启动浏览器、服务器、构建，未提交或推送。未在 4343 浏览器实际复测步态、相机或操控观感，也未做全项目类型检查。主线可沿原现场路径上坡松键观察 10 秒，再检查起步、转身、跳跃及回程接缝。

资源预检为 constrained，验证全程串行。主线已授权交接的锁 character-dynamic-slope-20261028 已释放；此交接写完后停止写入。
