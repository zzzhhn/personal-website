# 列车相对避障过渡交接

2026-10-28。分支 `codex/goal-world-orbit-obstruction`，基底 `84de21f`。主线已集成前轮乘客侧修复；本轮提交只包含新的相机避障过渡，不包含主线 DEV 控件。

## 行为与边界

解决遮挡解除时镜头突然外伸。新的 `AttractionCameraObstruction` 只保存当前环绕射线的可用距离比例，以当前乘客侧 origin 和当前候选方向重建位置，不插值旧世界坐标。列车移动、旋转、鼠标方向、原目标点和 FOV 每帧仍直接生效。

每帧先以当前近裁面球体求真实可达距离。障碍解除后的恢复分量以 6 m/s 增加，列车和输入本身造成的运动另算；新障碍截短射线时立即采用较小安全上限。平滑后的位置再执行一次球扫掠，最终实际位置不得越过本帧安全路径。运行时第三人称每帧最多两次球扫掠，没有未来轨道预测、绕障搜索或新的几何查询依赖。

这一回合没有尝试把硬遮挡压缩也强行拉平。如果在旧远距点与当前乘客侧 pivot 之间出现支架，继续保持远距或只做 world lerp 都不能保持当前球体扫掠路径可达。这里选择即时压缩，明确保留跳变边界；没有隐藏支架、修改轨道或让镜头通过实体。

## 实测数字（源码和真实静态几何，60 Hz）

| 场景 | 原最终位置单帧位移 | 新最终位置单帧位移 | 说明 |
| --- | ---: | ---: | --- |
| 3.983 s，yaw=−1.43、pitch=1.15、zoom=1.8 | 10.338 m | 0.161 m | 解除遮挡；本帧恢复到 2.981 m，原本可直接跳到 13.204 m |
| 79.817 s，yaw=1.43、pitch=0、zoom=1 | 5.727 m | 5.727 m | 支架将可达距离截短到 2.080 m，立即压缩 |

完整回路覆盖 chase/comfort 各四组输入：默认、yaw=1.43、远距极限 yaw=−1.43/pitch=1.15/zoom=1.8、近距极限 yaw=π/pitch=−1.15/zoom=0.45。每组 6,810 帧，共 54,480 帧。

- 每帧最终近裁面球体与真实 coaster 静态碰撞体重叠：0。每帧额外从当前 origin 扫到实际最终位置，均可达。
- 每帧最终位置保持乘客侧约束，没有因恢复而回到本车底部。
- 恢复帧最大位移：默认 0.190 m，手动 0.421 m，远距极限 0.724 m，近距极限 0.663 m，均包含列车自身运动。
- 所有大于 2 m 的剩余最终位置跳变，都由测试断言为真实静态命中导致的强制压缩。全局最大剩余跳变为远距极限在 110.967 s 的 8.153 m；不能将 0.724 m 写成全体最终帧的上限。

## 状态与验证

状态在新 ride revision、上下车阶段变化、FOV 模式变化、显式视角归位、进入第一人称、退出乘坐、固定截图/泳池检查模式、超过 0.25 s 的旧帧或明显 seek/传送时失效。普通暂停时调用方不推进恢复；组件卸载后 ref 随实例销毁。显式归位通过相机模块内部 revision 失效旧状态，不改 intent store 或主线 QA 控件。

新测试覆盖上述清理、当前列车射线旋转/移动、30/60/120 Hz 恢复一致性、动态极值缩放、新障碍即时压缩，以及完整回路最终位置。与前轮相机/步行/上下车测试串行合并：36 项，34 通过，0 失败，2 项因 character 工作树缺少 G24 资产跳过。主线拥有的 G24 验证由主线执行；本轮不把两个跳过项算作通过。

两个相机模块的定向 TypeScript 类型检查通过；上下车测试也转译检查了 `WorldActors.tsx`。测试仍区分静态近裁面安全与真实车厢眼点遮挡。后车长视线遮挡保留前轮边界，不纳入本轮重写。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/attractions/attraction-camera-obstruction.test.mjs src/components/world/attractions/attraction-camera.test.mjs src/components/world/camera-coaster-orbit-review.test.mjs src/components/world/camera-collision.test.mjs src/components/world/camera-shoulder.test.mjs src/components/world/camera-exchange.test.mjs src/components/world/attractions/coaster-transition.test.mjs
node ./node_modules/typescript/bin/tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2022 --allowImportingTsExtensions src/components/world/attractions/attraction-camera.ts src/components/world/attractions/attraction-camera-obstruction.ts
```

## 主线补验与资源

主线可用当前 DEV 时间控件先运行 3.5–5.5 秒远距极限，检查恢复速度；再运行 79.5–80.3 秒及 110.7–111.2 秒，确认硬压缩边界。归位/切换视角应立刻使用当前合法镜头，不带入旧障碍欠距。此次数值证据针对每帧位置及 pivot 到该点的球扫掠，不是全部帧间运动路径、整个世界设施、完整 G24 像素可见率或视觉验收。

资源预检 pressure=2、磁盘剩余 2.99 GiB。只串行短采样和定向检查，没有浏览器、build、下载或子代理；未改 integration、4341、intent 状态、主线 QA 控件、轨道、美术、音频或性能模块。新增代码与文档均为本轮自有文件。
