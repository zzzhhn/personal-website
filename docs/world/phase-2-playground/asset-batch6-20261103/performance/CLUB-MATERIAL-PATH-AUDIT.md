# Club 主亭与池岸材质消费路径复核

2026-11-03。集成根 `826fe2e0a71f146382969b5a867e8e724ec1f6d2`，候选 HEAD `109bb3da7a6b284541e96bfb492fbcd03f3f132d`。候选还在编辑，以下问题对应当时读取的工作树快照。前置资源检查为 pressure 1、swap 12.92 GiB、空闲 20.80 GiB。本次仅静态复核。

**首要集成风险是水下焦散挂在另一个材质实例。** 原 `WorldDjcClubVisual` 的 wood/fabric/stone 分别以固定粗糙度和顶点色供主批次使用，各类分离的旧家具等回退批次也借用同一套材质。实际矿物池底、衬壁和池边铺面位于主 stone 批次。水面使用单独的 pool geometry 与光学/旧水面 shader。水组件 effect 对收到的 `basinMaterial` 原地挂上焦散和水下铺砖接缝，只在水线下且位于解析池轮廓内生效，卸载恢复原 hook 和 key。

编辑快照将实际 stone mesh 改绑到 `finishes.stone`，却继续向水组件传 `materials.stone`。这使主 stone 池底和衬壁失去原焦散与铺砖接缝。应确认实际绘制的每个水下接收面同时消费原焦散和选定 finish，维持钩子及 uniform 所有权。若合成两个 hook，现有 `applyPoolCaustics` 会覆盖 program key 为固定值 `club-basin-caustics-v1`，须确认组合变体可区分并在释放时恢复。水组件目前把材质绑定与 capture/connect/dispose 放在同一 effect，若替换接收材质需保持同一次挂载的接收对象稳定，并验证没有因切换重新销毁仍在使用的水资源。

**成本也可能落到水的折射 pass。** `selectLocal` 发现自定义 `onBeforeCompile` 就跳过该网格的静态水线上方排除。给整个 wood/fabric 批次改 hook 后，即使其 bounds 原先可排除，也会进入折射提交路径，由裁切面处理。整批角色 0 仍携带新属性和 varying。当前快照声明 Float32×3，最终属性为每顶点 12 B，须按整个绑定批次算。被标记的石料路径有两层插值噪声、孔隙散列与导数凹凸，折射 capture 可重复执行这些计算。无新增贴图请求，静态推导无法给出提交差或帧耗。具体隔离范围可由作者选择，重点是证明未标记片段保持原响应，且自定义 hook 不意外扩张水捕获工作量。

**复用及所有权。** `WorldFacilitySurface` 可借用模块缓存的三张木纹图及 shader 片段。其负槽值与 UV 是 park/street 合约，应用到 Club 时需显式适配；slot 0 保留原响应。共享图由模块持有，材质只借用，图迟到沿用现有 Canvas wakeup，不需要常驻轮询。其全局材质表和环境桥由现有 WorldPark 管理，Club 无需另设全局 owner。北吧台的 `shareDjcBarTexture` 是每次 bar mount 的局部去重表，按 URI 和采样/UV 状态匹配，实际纹理由 GLTF loader 缓存所有，清表不 dispose 借用图。它可作为所有权范例。若确实需要反射，现有 `useDjcFurnitureEnvironment` 按 renderer retain/release，最后一个消费者离开才回收目标；首个消费者仍可能触发一次创建。新材质、私有 buffer 和临时几何归 Club 自己释放。

**最终候选最低证据。** 提供精确提交及实际 mesh→material→hook/key 表，覆盖标记/零角色、回退家具、水下接收面和近远分支。列明每批角色数、属性 byteLength、各 draw、材质数、独有贴图及 PMREM owner，写清卸载/替换释放路径。随已安排的串行验收，在相同相机、画质、时段和实际水捕获条件下，留一对水可见窗口及主画面证据，分开记录主画面和水 capture 的 passes/calls/triangles、目标尺寸及焦散画面。若方案涉及异步纹理，补到达后有限刷新证据。几何属性字节不等同显存或 FPS。

## 文件身份

Git blob SHA-1。路径均在 `src/components/world` 下。

| 文件 | 集成根 | 候选 HEAD |
| --- | --- | --- |
| WorldDjcClubVisual.tsx | 08757d3f3971322d40e2492cf37b17096f659062 | 同左 |
| WorldDjcClubGeometry.ts | 71efef7b27a748f870cf1fbd05e472c3d97c5da2 | f9dd97cc4d06755e1d1a61f327720a7eb139358e |
| WorldClubWater.tsx | 82701fc91cf24c4705690ef8d068f88a8ea91a97 | 同左 |
| WorldClubWaterCapture.ts | e106a569d9ea5f47d18d15beb309cdfe5cfab143 | 同左 |
| WorldFacilitySurface.ts | 6310e036c0c052b1d851fdd895f8b63536903195 | 同左 |
| WorldDjcClubBar.tsx | b249601b206d0c7d99f2ce2b2909b3d283fe18d9 | 同左 |
| djc-bar-layout.ts | c6df429aa0fa929c56e57f36045db608c29d0a4e | 同左 |
| WorldDjcFurnitureEnvironment.ts | fdf32765cd3d56e732dd621d8fbc8d72050e5cac | 同左 |

编辑中工作树 blob：Visual `5edb9696b439e862531b94df3bd7c9fb046a2674`，Geometry `e8e535b7db21771a1e4df91a260d9b00ada64bf8`，新增 WorldDjcFacilityFinish.ts `98d76b43b81a7bce21e01418a65ce06019ec0ab4`。最终候选到齐后按精确差分复核。
