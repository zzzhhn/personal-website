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

## 最终差分复核

候选 `22efd8a79789a348130cbd6b9d969a2eaabe6962`。拆分提交 `422072e` 与最终提交之间无 `src/public` 差分。已复核先前两处风险，未发现阻塞默认主亭集成的缺陷。资源预检 pressure 1，空闲 27.09 GiB。

- 主 stone mesh 和 `WorldClubWater` 现在选择同一材质实例。默认 stone 无 finish 属性，仍走原基线材质。显式开启池岸时两者均用 stone clone。焦散先调用原 finish hook，组合 key 在替换前解析原 key，再拼上焦散版本，清理恢复原 hook 和 key。选择与 clone 都在同一套 memo resources 内，URL 开关不新增逐帧重绑。
- 静态水线剔除按材质实例和当前 hook 的身份登记。wood/fabric 的 hook 只传递属性并改片段，符合登记条件；焦散包装和恢复会重新登记已获认可的 hook。未登记或后续换 hook 仍走保守路径。登记用 WeakMap，材质释放沿用 Visual cleanup。
- 默认只为主批次 wood/fabric 创建两份 finish clone。按交付记录，主亭净增 1,556 三角面及 1,201,308 B 属性数组，其中新坐标和角色占 1,014,588 B。新增属性随批次几何释放，clone 独立 dispose。未标记面继续使用原色、粗糙度和法线，但同批仍承担属性传递和分支判断。分离的家具、吧台及植物保留原绑定。新 shader 为程序化表面，未新建贴图、PMREM、draw 或 pass。
- 已交付的 `render-record.json` 与两份 `basin-capture-*.json` 数字一致。12 秒暂停转头，目标 640×348，基线/双族候选分别 483/481 次折射、每次均 30 draw，三角面每次 721,757→723,673（+1,916）。该差值包含 opt-in 池岸，不能用作默认主亭的实测值。两侧焦散更新均为 0。记录只支持归一化提交量判断，无法给出正常游戏 FPS、更新频率或 GPU 片段成本。日夜记录是拆分前的对应候选数据，视觉结论由主协调确认。

最终 Git blobs，按 Visual / Geometry / Finish / Water / Capture 顺序：`1129ab63ae5b4df6318efa1cefb0d36056153cb7`、`0ca3461841a94fb4c8e081af4a460f47714ba10e`、`f1ce50c3159a154ef0ce9bb5fff09e73ce2ea8a1`、`82701fc91cf24c4705690ef8d068f88a8ea91a97`、`c1e8bca2d4e2d1b22e8051bfeb65af19b501ce2d`。
