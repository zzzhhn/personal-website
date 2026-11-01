# DJC：从 Blender 到实际网页的材质校准

用户于 2026-11-01 要求解决离线资产进入网页后的质感落差，随后继续建模。沿用已批准的北吧台与 Club 海岸风格，保留既有布局和玩法；本轮不推送、不公开部署，4341 仍按验证后更新。

## 当前发现与修正

1. 私有 `DataTexture` 使用未翻转行序，而原生成代码把顶部行当天空。Three 的 equirectangular `v=1` 朝上，导致主亮斑来自地平线以下。已修正天地，且将私有环境亮斑与实际 `SUN_OFFSET` 对齐；不是继续提高曝光。
2. glTF 颜色空间、粗糙度、法线和 UV0 完整，未发现全局替换材质。原生 Cycles 棚灯和反弹不会随模型导出，GLB 原来也没有 AO。资产侧补独立 UV1 的短距几何遮蔽，只作用于间接光，保留原基础颜色和实时太阳阴影。
3. 原织物约 1.95 mm 的细纤维在网页正常视距小于一个像素，mipmap 将它平均是合理行为。保留纹理过滤，不通过放大纤维、提高法线强度或发光布料制造假细节。

环境方向的数值证据、实际 Three/R3F 版本和渲染链路在 [runtime-audit.md](runtime-audit.md)；资产侧证据在 [asset-audit.md](asset-audit.md)。通用 PBR 语义参考 [Khronos glTF PBR](https://www.khronos.org/gltf/pbr/) 和 [Three 颜色管理](https://threejs.org/manual/pages/color-management.html)。

## 验证范围

冻结前版本为本地提交 `a66770e`、快照 `/tmp/bobby-world-daybed-20261101`。`perf-baseline.md` 与相关图／JSON 来自冻结包，不会把修改中的 dist 当作 before。after 必须复用同一机位、时间、天气、缓冲尺寸及质量；昼夜各一张日床近景，北吧台补回归图，正常 approach 采 300 帧。离线图不冒充实时网页截图，单段样本不等于全岛性能保证。

## 网页审图结果

主协调已逐张打开 `perf-baseline-daybed-noon.jpg`、`perf-after-daybed-noon.jpg`、对应 midnight 图及 bar-noon 图。在相同机位和缓冲下，after 的靠枕上沿受光、下沿接触暗部恢复，消除了原先下缘亮、上缘暗的倒置塑形；垫面缝线与木托盘的层次更容易辨认。夜景仍保持夜晚亮度，没有整体提曝光。北吧台原有棚顶、台面和陈列关系保留，未见共享环境修复带来的明显退化。这是协调者的图像审阅，不代替用户验收。

正常 approach 的有限 300 帧样本：before 60.0036 FPS／p95 17.5 ms，after 60.0024 FPS／p95 18.0 ms；实际缓冲均为 1951×1062，draw calls 中位均 118。GPU 计时不可用，不能将这段结果扩展为全岛或所有设备的性能保证。详见 `perf-after.md`。

下一批池边灯笼已交独立建模 agent 执行：冻结真实源码 before，沿用同一 PBR／UV1 AO 导出标准和实际网页验收。主线负责审图、共享资源、原有碰撞兼容和最终整合。

## 最终灯具与本地交付

10 盏池边灯的原生精修由 GPT 6.1 Sol high 独立完成，主协调审阅实际 before、fresh import、close、clay 和晚景。第一轮网页暴露了离线图没有揭示的两个问题：木纹照片额外叠加深色 tint、无限距离 AO 将灯罩外面压暗并带来噪声。主线没有发布该轮；r2 去掉额外乘数，以显式 6 cm、Only Local、256 samples 的几何 AO 修正，未改变几何、normal、UV 或材质批次。逐字节合同与原生资产在 `../djc-pool-lantern-craft-20261101/r2/`。

主协调再次打开 `perf-lantern-r2-noon.jpg` 和 `perf-lantern-r2-midnight.jpg`，确认木纹／板缝能读出、灯罩脏斑消失、夜晚暖光正常。源资产仍 11,304 三角形和 4 个材质，运行时为 4 个 InstancedMesh 共享 10 个位置；未新增实时光源或透射通道。原有碰撞／座位逐项一致，加载失败保留旧几何 fallback。

最终包为 `build-final.json`，实际使用 `pool-lantern-v2.glb`。45 项相关测试在独立 release 和共享 integration checkout 均通过；r2 只变材质资产及 URL，重新通过资产合同检查和正式构建。最终普通 approach 的 300 帧为 59.805 FPS、p95 17.4 ms，1951×1062，GPU timing 不可用。前一轮同几何样本约 60 FPS；保留 r1 与 r2 的原始回执，不把短测当整岛保证。

4341 已切换冻结快照 `/tmp/bobby-world-craft-2ed93e9e-20261101`，HTML、runtime bundle、AO 日床与 v2 灯具通过 HTTP hash 核对，见 `delivery.json`。共享整合代码按精确补丁和三方合并更新，保留 `useGreyboxClaim('club-basin')` 与全部无关改动，见 `integration-receipt.json`。本轮不 Git push、不公开部署。用户视觉接受仍待试玩反馈。
