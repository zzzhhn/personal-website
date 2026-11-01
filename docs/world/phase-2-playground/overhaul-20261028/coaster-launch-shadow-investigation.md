# 发车长帧：静态阴影批次失效候选

基线：`a1223b0`。本轮只读源码与两份 `coaster-sfx-*-first-launch.json`，只新增本说明；未接入探针、运行测试、浏览器或构建。

## 证据与时序

| 窗口 | 最慢间隔 | 回调中列车时间 | lastRenderCalls | geometry / programs |
| --- | --- | --- | --- | --- |
| SFX off，context absent | 466.3 ms | 0.4500 s | 83 | 307 / 177 |
| SFX on | 230.5 ms | 0.5804 s | 83 | 306 / 148 |

音频恢复不是发生尖峰的必要条件，不建议音频预热补丁。两个窗口的程序数基线不同，不能拿跨窗口数量差异推断编译耗时。

`coaster-track.ts:147–152` 对 `dt > .25` 不推进时钟。因此 off 的 0.45 s 是长间隔前后保持的列车时间，不能减去 0.4663。on 的 0.5804 已包含 0.2305，前一回调约 0.3499 s。两者都与发车后第一次半秒扫描相容；这不是实际扫描时间的证明。

## 首要候选：列车从静态阴影合批退出，引发全量重建

1. `WorldIntentCoaster.tsx:84–99`：三节车厢在停靠时保持变换，发车后更新 position/quaternion；`intent-train` 及车厢没有 `shadowDynamic` 标记。它们是普通刚性、投影 mesh，没有风、布料或蒙皮属性。
2. `WorldShadows.ts:227–238, 335–339`：沿父链读取 `userData.shadowDynamic`；否则稳定两次扫描后可作为静态对象。稳定后首次变换变化才永久置 `dynamic=true`。
3. `WorldShadows.ts:963–972`：`fitSunShadow` 每 30 帧执行一次 `rescan`。真实上车过程持续多秒，车厢有充分时间满足静态稳定条件；发车后的下一次扫描至多约半秒到来（按 60 fps）。
4. `WorldShadows.ts:307–352`：扫描末尾同步调用 `rebuildFireStatic / rebuildGroups / rebuildChunks`。
5. `WorldShadows.ts:585–601`：`rigid` 集合排除 dynamic，key 包含所有静态 caster 的 UUID 与矩阵 checksum。三节车厢退出即可使 key 改变，然后销毁所有旧 chunk 的几何。
6. `WorldShadows.ts:607–657`：遍历剩余所有 rigid caster，变换顶点、按三角形分桶、处理三层 cascade、重新建 mesh/几何与包围信息。不是只重建三节车厢所在的 chunk。

**判断：** 存在明确、可测的同步重建路径，时点与两次尖峰一致，值得第一优先测量。源码机制置信度高；它是否占据这两次 466/230 ms 的主要 CPU 时间仍未证实。渲染计数不能替代耗时，当前证据也未记录动态标记切换或 chunk key 变化。

## 已核对的替代路径

- `WorldActors.tsx:1248–1265`：默认视角偏移为零时跳过 `sweepCamera`，骑乘分支提前返回，不到 `:1378` 的普通遮挡更新。需要探针附带实际 yaw/pitch/zoom 或 sweep 调用次数，不能仅凭默认值断言本次从未碰撞检测。
- `WorldActors.tsx:892–906`：禁用玩家刚体发生在 approach 的首次骑乘物理步，不在 settle→riding。骑乘中仍每个物理步调用 `stepWorldVehicles` 和 `resetBody`。
- 安装版本 `@react-three/rapier/dist/react-three-rapier.esm.js:882–916`：dt 上限 0.5 s，固定步 accumulator 可在长间隔后补跑多次物理步。因此后续物理开销可能是长间隔的结果，不能倒置因果。
- `WorldIntentCoaster.tsx:21–22` 的结构仅依赖 enabled；从上车到发车持续 true。`coaster-transition.ts:122–123` 的 settle/riding 都使用已加载的 SitIdle，没有发现发车专属 GLTF 加载或整组 React 几何重建。

## 最小 DEV-only 分段探针建议（未接入）

仅在显式 QA 按钮 armed 后计时，利用已有帧回调；最多接收 300 帧，保留最近 32 帧和发车后 64 帧，之后停采。无 timer、observer、常驻采样或新场景节点。未 armed 时只有布尔分支，不调用 `performance.now()`。

第一轮只测阴影链，避免同时铺开所有系统：

- `fitSunShadow:963` 入口/出口：`fitMs`，本地 `frameNo`，renderer frame ID。
- `rescan:307` 入口/出口：`rescanMs`；利用已有 caster 循环记录最多 8 个本次 static→dynamic 对象的 UUID/name/父组名及是否属于 intent-train，不另遍历场景。
- `rebuildChunks:585`：记录 `keyChanged`；在 `:601` 删除旧 chunk 之前到函数结束计 `chunkRebuildMs`，附 rigid 数、旧/新 chunk 数、列车是否仍在 rigid 中。其耗时嵌套在 rescan/fit 中，不能把三者相加。
- 已有 `wrapShadowRender:820–822` 的 original 调用前后：`shadowSubmitMs`，与上述准备阶段区分。这只是同步调用的墙钟耗时，包含可能的驱动阻塞，不是 GPU 执行时间。

每条记录绑定同一帧编号，并保存最近一帧完成的 spans。QA 的下一次 R3F delta 才覆盖上一帧的工作，不能把本回调 span 硬配给已经到来的 delta。需要同时看尖峰项及前后至少两帧。

**可辨别实验：** SFX 保持 0，相同冷启动、站台与真实上车。若长间隔前一帧出现列车 static→dynamic、keyChanged，且 chunkRebuildMs 占主要时间，则支持该候选。若重建没有执行或耗时很短，停止这条归因，再窄测物理步总耗时/次数、列车更新、相机回调或 renderer 主提交。

**条件性最小修复：** 仅在 `intent-train` 的 group 添加 `userData={{ shadowDynamic: true }}`，复用已有分类机制，让三节车厢从挂载起退出静态合批。保持 castShadow、材质、几何与分辨率。对照冷启动首次发车，确认列车不再进入 rigid、首次移动不再因列车改变 chunk key，再比较长间隔和真实动态阴影。无需预热或全局阴影算法改造；当前没有实施该修改，也不承诺它消除尖峰。
