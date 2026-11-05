# 正式调用链的独立集成检查

2026-11-05，基线 `b75c474` 及当前未提交候选接线。审查者只新增 `coaster-craft-promotion.test.mjs`、本记录，并经主 session 追加授权更新宝箱测试中的钥匙行为断言；未修改生产实现。当前结论是**源码接线与 CPU 回归通过**，不代表构建、普通距离视觉、浏览器交互或性能验收。

## 当前实际调用链

- `WorldIntentCoaster → CoasterStructureCache(createCoasterStructure, buildCoasterInWorker)`。同步首档与 worker 次档都由同一 `COASTER_ARCHITECTURE_CRAFT` 默认值选择 factory。旧分支先生成原 collider/glow，再移除对应 steel 区段；worker 使用原 pack/unpack。
- `WorldCoasterStationCraft(detailed=renderedNear)` 与门包 `part="static"` 位于 enabled 分支外，和结构档位一致。停用近场装置不会使远景站房、门头缺席。旧地坪、原灯面与动态文字仍保留。
- `CoasterTrain → WorldCoasterTrainCraft(cars)`。新视觉与原三个 car root 共父节点；运动回调仍在优先级 -60，adapter 在 -59 读取同一 refs。三车初始 frame、position/quaternion、board 点击与停站 collider 根没有改变。
- `WorldIntentDevices → WorldIntentWorkshopCraft / WorldCoasterChestTransfer / IntentGate`，仍有原 chest/gate/board 三项 `IntentInteraction`。工坊新 consumer 继续调用旧 contactSurface/solids/glow 的权威生成路径。
- `IntentGate` 的 `RigidBody`、两侧 hinge、kinematic 更新及 collider 不变，新门叶仅替换其镜像子组内的视觉。箱内与门侧钥匙现由 `keyVisual → WorldCoasterGateCraft(part="key")` 提供，外层位置、显隐和 chest 点击保留，未传视觉时仍能使用原钥匙。

站房 [EXCLUSIONS](../coaster-station-craft-20261105/EXCLUSIONS.md) 与门包 [INTEGRATION](../coaster-gate-craft-20261105/INTEGRATION.md) 已逐段核对。站房删除范围不包含设备楼25/26、员工平台；gate 后仅六条东屋面 vent 随新站房去重，后面的设备楼梁和服务梯仍保留。`addCoasterBuildingArt` 的独立 caller 默认参数已由主 session 设为 false，避免独立使用时默认丢站房。

## 已执行的回归

```sh
node --experimental-transform-types --test --test-concurrency=1 src/components/world/attractions/coaster-craft-promotion.test.mjs src/components/world/attractions/coaster-chest-runtime.test.mjs
```

主 session 授予唯一 CPU 槽后，两档逐次生成并释放。4项集成检查与8项宝箱检查共12项通过，全程约4.2秒。随后把组件输出检查改为使用真正的 React JSX runtime 节点，再定向重跑相关4项，全部通过，未再次生成完整场景。

| 同档 factory 对照 | 原 steel 顶点 | 去重后 steel 顶点 | 原／新 collider 数 |
| --- | ---: | ---: | ---: |
| far，false／true | 356,004 | 348,732 | 746／746 |
| near，false／true | 628,428 | 619,260 | 1,080／1,080 |

两档均确认：collider顺序、数值、hull、rotation、surface完全相同；track/relief 的数组字节相同；glow全部属性、索引与包络相同；保留 steel 有限且减少。维护楼、后电力楼、员工平台三个独立空间区域内的 steel 全属性顺序字节也相同，防止区段删得过宽。

候选实际 packet 经 `structuredClone(...,{transfer})` 搬移后，发送侧所有转移 buffer 脱离，unpack 的 render/physics 数据保持相同，position 与 track 数组直接复用接收侧数组。这里只测试真实传输协议，没有创建浏览器 Worker，实际冷加载线程仍待浏览器检查。

还核对了原列车运动回调、三车 root、board click、停站 contact、门叶物理更新回调，以及未变的 track/access/transition/文字源。执行转译后的正式组件函数，使用受控 hooks 和 React JSX runtime 检查 active/riding 四种组合下的远景建筑与近场装置挂载；并检查生产 devices 确实传入新钥匙视觉。宝箱用默认／传入钥匙视觉及 chestOpen/keyTaken/gateOpen 的16组合验证两个放置点、箱内旋转、显隐和点击动作，不再用整个组件函数字符串相同来限制视觉替换。没有运行 React/R3F 挂载或浏览器像素检查。

## 剩余边界

新增资产与旧 steel 去重后的构图、夜间材质、真实开门/登车衔接、实际 calls/帧时间和驻留，仍由主 session 的 candidate build 与浏览器复验。测试通过不把尚未看过的画面标为通过，也没有把静态提交减少当作 FPS 结果。

历史离线 `extract-entrance-scene.mjs`、`extract-arrival-native.mjs` 直接调用 factory，不挂新 GLB；随着 factory 默认 true，它们目前不会自动导出新的完整站房和门头。若用于复现旧归档，应显式传第三参数 false，或另行加载新包。本轮未改这些工具，生产调用链不依赖它们。

主会话后续修正：两份历史extract工具已显式传入第三参数false，继续导出它们原本承诺的旧程序化归档；当前完整新场景由实际组件＋新GLB组合验证。
