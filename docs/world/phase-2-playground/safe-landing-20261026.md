# 安全落点查询与人物水淹计时

新增 `src/components/world/safe-landing.ts`，仅查询，不修改身体或其他世界状态。

## 接口

- `findSafePlayerLanding(world, rapier, body, groundCandidates, waterY): Vec3 | null`：输入按优先级排序的地面坐标，返回人物身体中心。
- `findSafeVehicleLanding(world, rapier, body, size, candidates, waterY): VehicleLanding | null`：`candidates` 为 `{position: Vec3; yaw: number}[]`，其中 `position.y` 是道路地面预期高度，`yaw` 为道路切线方向。返回车辆身体中心与道路方向。
- `updateHeadSubmersion(previousSeconds, dt, bodyCenterY, waterY, headOffset = PLAYER_HEAD_OFFSET, rescueAfterSeconds = 2)`：返回 `{submergedSeconds, shouldRescue}`。`PLAYER_HEAD_OFFSET = .735`，表示身体中心至口鼻的位置；口鼻低于水面才累积，回到水面或浮出即归零。

调用者负责生成道路中心候选或上次已验证道路候选。返回 `null` 时，应保留等待、重新尝试其他候选或明确安全兜底，不能强制传送到未经验证的最近岸边。车辆 +X 为车头，`yaw = atan2(-dz, dx)`。所有输入候选必须使用地面高度，不能输入车辆身体高度。

## 判定

所有支撑使用实际静态 Rapier 碰撞体向下射线。射线搜索候选地面高度上下 .6 m，拒绝相差较大的屋顶；不调用地形高度公式。排除传送对象自身，支撑排除动态与运动学身体，所有查询排除 sensor。查询没有检查 collider 的谓词回调，避免 Rapier borrow 重入。

人物要求中心与 .75 m 环上八个点都高于水面 .18 m，坡度至多 20°，支撑高度差至多 .3 m；完整胶囊空间额外预留 .04 m 半径。八个方向至少存在一条 2.4 m 支撑、碰撞扫掠都通过的离开通路。

车辆要求九点支撑覆盖车长宽各加 .65 m 边距，水面余量 .3 m，坡度至多 12°，高度差至多 .3 m；完整轮底至车顶包围盒留出额外边距，拒绝墙和其他动态物体。前后各需 `max(2.5, length * .65)` 米的全宽支撑与碰撞扫掠，避免完整车身虽然放得下，却被窄半岛、岸尖或墙困住。

这组恢复条件刻意偏保守，陡坡、短桥头、狭窄道路可能返回 `null`。不宣称可以恢复到任意附近地形。车辆道路候选合同与局部高度检查共同避免屋顶落点，不尝试从碰撞体材质猜道路身份。

## 验证

`node --experimental-strip-types --test src/components/world/safe-landing.test.mjs`

2026-10-26：21/21 通过，约 265 ms。覆盖窄岸、岸角、小岛、短半岛、坡、脊尖、淹水、错误高度屋顶、动态或运动学地板、墙、动态车、低顶、前后驾驶通路、人物封闭袋、传感器、自身排除、重复查询后 world.step/free；真实 `pavedV4()` avenue 网格允许人物和生产三车型尺寸；浅水不积累，持续口鼻淹没两秒触发且浮出归零。

测试使用实际 Rapier，未启动浏览器、服务、构建或 Blender。完整场景建筑、车辆占位以及用户操作回归由主线集成后验证。
