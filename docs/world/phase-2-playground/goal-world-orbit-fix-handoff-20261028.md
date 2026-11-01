# 乘客侧自由镜头修复交接

2026-10-28。分支 `codex/goal-world-orbit-fix`，从主线 `f5a2e2a` 建立。仅在 character 工作目录修改，原只读审查记录保留。

## 修复行为

第三人称镜头不再因首降的世界仰角限制绕到本车底部。相机仍接收原来的正负 yaw、pitch 和 zoom，保持世界水平线、完整 yaw 输入范围、原 look-at 点和 FOV。第一人称计算及普通步行模块不变。

`attractions/attraction-camera.ts` 从已有 `pose.orientation` 得到列车 up，使用已有座位到眼点的 1.02 m 高差约束候选位置。相对眼点的局部高度为 h，宽度 w=0.6 m：

- h≥w 的安全位置原样保留。
- h≤−w 映到乘客侧的 −h。
- 中间区域采用 w/2+h²/(2w)，在两端一阶连续，最低在眼点上方 0.3 m。

此处理只改局部高度，不归一化投影切向量，因此正下方没有投影奇点。在固定列车帧下映射不放大相邻候选位置的距离。它不清除输入、锁 yaw 或选取另一个离散镜头点。危险区域的最终轨迹仍会受到约束，其操控感需要主线实测，不能声称所有拖拽角度都与旧版画面一模一样。

零输入也经过相同约束，避免一拖即跳、归位切换算法。对整个运行时间按 60 Hz 采样，默认候选镜头没有被这个约束改变。

同时处理约 99.3 秒基础镜头穿过世界竖直方向时的俯仰轴翻转：第三人称使用投影切向量的方向和大小，俯仰灵敏度在世界竖直处连续减小；不再把接近零的叉积放大成翻转轴。输入符号不变，第一人称和无列车姿态的相机沿用原计算。

`WorldActors.tsx` 对带列车姿态的第三人称默认/手动镜头都执行现有静态球扫掠。新的内部辅助函数将扫掠起点放在同一乘客侧安全半空间，避免从低 look-at 点压缩后重新钻到车壳后。显示用的 look-at 点不变。没有新增 pose 字段、轨道查询、碰撞体或持久相机状态。

## 验证

相机、步行碰撞、肩部避障、交易所相机、上下车回归串行运行：32 项，30 通过，0 失败，2 项缺少 G24 本地资产而跳过。跳过的是实际靴底和实际座位皮肤验证，不能当作已通过。

`camera-coaster-orbit-review.test.mjs` 已转成相对源码导入的真实回归。覆盖完整时间回路、首降小数秒、chase/comfort、默认零输入、正负拖拽、yaw 两端、pitch 和 zoom 极值，共 14,868 组。构造当前真实详细轨道的 support/建筑碰撞、track/relief trimesh 和三节可见车厢。

| 检查 | 结果 |
| --- | --- |
| 乘坐的第一节车厢至设计眼点的遮挡 | 0 |
| 最终近裁面球体进入静态 coaster 碰撞体 | 0 |
| 本车壳局部最高点至最终近裁面球体间距 | 所有采样均大于 0 |
| 实际静态 sweep 压缩 | 784 组 |
| 最小最终镜头至眼点距离 | 2.674 m |
| 后车挡住眼点 | 4 组，见下方边界 |

独立验证了首降 32.00/32.50/32.99 秒的 260 px 右拖；保留原缺陷坐标作为阳性对照，真实车厢射线能够检出旧遮挡。

额外相机单测覆盖 1,001 个轨道位置的微小输入连续性、±π 接缝、整个乘坐时间的第一人称、视角切换/归位以及世界竖直轴退化。四组代表输入按 60 Hz 走完整圈，候选镜头最大相邻帧位移约 1.349 m；修复前极端俯仰在 99.3 秒附近超过 10 m。这个连续性结果针对静态碰撞压缩之前的候选镜头。

定向 TypeScript 类型检查通过；现有上下车测试同时转译检查了 `WorldActors.tsx`。未运行完整构建。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/attractions/attraction-camera.test.mjs src/components/world/camera-coaster-orbit-review.test.mjs src/components/world/camera-collision.test.mjs src/components/world/camera-shoulder.test.mjs src/components/world/camera-exchange.test.mjs src/components/world/attractions/coaster-transition.test.mjs
node ./node_modules/typescript/bin/tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2022 --allowImportingTsExtensions src/components/world/attractions/attraction-camera.ts
```

## 剩余边界与主线实测

- 两个时刻的后车遮挡仍存在，各影响 chase 和 comfort：40 秒，yaw=−1.43、pitch=1.15、zoom=1.8；89 秒，yaw=1.43、pitch=−1.15、zoom=1.8。40 秒已定位为第三节车厢。它们不是本车底部问题，也不是静态轨道穿入。测试单独记录，没有把后车隐藏或让镜头越过它。
- 原有静态 sweep 的进出遮挡没有时间平滑。本次追加 60 Hz 诊断中，远景约 3.98 秒解除遮挡时最终镜头外伸约 10.34 m/帧；yaw=1.43 的镜头约 79.82 秒被遮挡压缩约 5.73 m/帧。没有用这种跳变实现乘客侧修复，也不能把候选位置的连续性等同于碰撞后最终画面的连续性。若要修复该问题，应单独设计保留列车相对帧的避障过渡，不能简单 lerp 穿过实体。
- 数值证据覆盖真实 coaster 静态接触和设计眼点，不覆盖所有世界设施、每个连续时刻、完整角色轮廓、移动后车的近裁面安全或像素可见率。
- 主线请在同一首降时刻录制默认→右拖→归位，补看正负拖动、俯仰极值、倒置段和第一人称切换。确认危险区域的位置修正与竖直处俯仰变缓是否自然；不能用 32 秒和 44 秒的不同位置截图作同位置对照。

资源预检 pressure=2、可用磁盘约 3.72 GiB，全程串行短检查。按任务限制，没有浏览器、完整 build、安装、push、integration 修改或 4341 操作。此次交付是可审阅实现与数值证据，视觉验收由主线进行。
