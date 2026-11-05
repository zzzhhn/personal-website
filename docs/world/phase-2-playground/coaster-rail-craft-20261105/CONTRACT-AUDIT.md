# 轨道、轨枕、支撑生产契约审查

审查基线：`5b8ef64`。仅源码审查与窄测试；不构建、不启动浏览器或 Blender。当前结论不代表视觉验收。

## 真实生产路径

`WorldAttractions.tsx:11-18` 以场地边界外 24 m 判定 active，仍始终挂载 coaster；`WorldIntentCoaster.tsx:28-48` 使用 `active || riding` 选 near/far。首次同步 `createCoasterStructure`，冷换档经 `buildCoasterInWorker`，在新结果到达前保留上一档及其 matching contacts。`:58-59` 始终画 steel/glow；`:65-74` 才按 enabled 挂物理。因此 far 的三族也必须有独立可见输出，不能放在 enabled 条件内。

`coaster-geometry.ts:79-129` 默认 scope=`full`。轨道和轨枕在 `:85` 生产，节点在 `:106`，支撑杆及基础在 `:107-123`。`CoasterBatch.finish():61-65` 是最终合批 consumer，合批后 userData 和 WeakMap 源对象角色不能用于拆分。

## 稳定边界与容易遗漏的面

- `coaster-rail-section.ts:73-84` 先复制 contact，再决定可见几何；中段 sweep 的 indexed position/index 次序、sample 原轨枕和节点物理几何必须完全保留。全线 visual sweep 为 `:86-119`，sample 轨枕、左右斜撑为 `:121-132`，非 sample 轨枕为 `:134-140`。sample 斜撑没有角色标记，按 role 过滤会遗漏。
- `coaster-structure-craft.ts:7-25` 的 `intentStructureRole` 有 runningSteel、spineCoat、tieCoat、railSeat、supportCoat、connectionSteel、grout。near 枕木与座片、far 三角截面位于 `:28-56`；far 省略节点装饰 `:58-62`。要保留原 cadence、跨度和上下界。
- `coaster-thrill-supports.ts:28-65` 同时供生产、碰撞、植被排除和净空使用。near/far 的筛选、支撑位置及 brace 数不同；不得重算为统一的 near 输出。`coaster-geometry.ts:113-120` 的 cuboid 与基础碰撞按原数组顺序保留，基础只有 WeakMap grout 标记，没有 `intentStructureRole`。
- `intent-craft-surface.ts:3-48` 把语义压为 Uint8 `intentCraftSurface`，其中 spine/tie/support 都是通用 13，railSeat/connection 都是通用 14；全 steel 按 13/14/15 过滤会误抓建筑。`WorldIntentSurface.tsx:41-58` 在共享 shader 中给 12/14 裸钢反射、13 涂层、15 混凝土，并非独立 PBR 材质或纹理。

## 最小安全实现建议

按上述生产区间有界捕获 parts，物理仍由现有生成器先完成，然后把三族 visual parts 从 steel 移入单独 visual 输出，才 finish 两方。也可把生成器的可见目标改为独立 batch，但必须用基线字节验证其物理副作用。三族旧面必须从 steel 真正移走；只额外画 craft 网格会叠面，opacity 或 drawRange 隐藏也会留下不必要的旧批次。发光带由 geometry `:91-104` 单独保留。

独立输出必须由 `WorldIntentCoaster` 在 enabled 条件外挂载，使用当前 `structure` 对应的档位；不得用目标 enabled 提前切材质/几何。实际 PBR 网格可以改变 UV/normal/tangent，但原 contact arrays、collider JSON、relief、glow、art、frame/route 均须保留。

`coaster-structure-transfer.ts:12-46` 初查时只序列化 steel/glow，新增 BufferGeometry 不能依赖 spread：需显式 pack/unpack 并把所有 attribute/index buffer 放入 transfer set，保持 typed array 免复制。`coaster-structure-cache.ts:26-49` 的 late-result dispose、releaseGpu、snapshot 都必须覆盖新增输出。worker 只接 boolean 并调用默认生产构造（`coaster-structure.worker.ts:8`），应通过同一缺省接口得到新输出，不能只改主线程路径。

窄测试已经通过：真实 `createCoasterStructure(false/true)` 的 track、colliders、relief、glow、art 全部符合基线；四批两档非空，8 处全线双轨和全部生产支撑基础均有可见几何。旧 shadow 前缀与剩余 steel 后缀的每个属性按字节拼接，完全复原旧 steel，far 为 190,284 + 158,448 vertices，near 为 440,652 + 178,608，证明完整旧批次只移出一次且未改变。transfer packet 真正 structuredClone 转移后，通过生产 worker job 的 hydration 保留属性、索引、sphere/box 和数组引用，不做第二次复制；cache 新资源计数、换档释放、晚到回复释放也通过。

接口已确认：`railCraft` 总存在，由 runningSteel / coatedSteel / jointSteel / concrete 四个独立材质批次构成；baseline 为 `{}`。`railShadow` 总存在，baseline 为 `null`，candidate 捕获旧三族完整属性，只投影且不写颜色/深度。transfer/cache 已按该接口接线。`production-baseline.json` 来自修改生产生成器前、默认 full 生产构造的一次串行记录：far 为 746 colliders、599,712 B track；near 为 1,080 colliders、602,592 B track。夹具同时保留旧 steel 所有属性 hash，供“shadow 前缀 + retained steel 后缀”按字节重建检验，不能只证明 collision 不变。

验证命令：`node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/attractions/coaster-rail-craft.test.mjs src/components/world/attractions/coaster-structure-transfer.test.mjs src/components/world/attractions/coaster-structure-cache.test.mjs`。最终冻结生成器（near 214,468 tri / far 103,736 tri）结果为 **11/11 通过，5.07 s**，日志 `contract-tests.log`。新增 range 回归覆盖 indexed/nonindexed、默认 Infinity/有限范围、颜色 pass 临时零范围、正常恢复、连续 beforeColour、防御性 shadow/cleanup 恢复及后续新范围捕获，同时验证所有 attribute/index 字节和引用、sphere/box 和引用、caster 可见状态及真实 `shadowChunkSourceKey` 不变。生产 worker 模块调用与真实页面挂载已独立审查；本测试用端口替身注入真实 packet，未启动浏览器 Worker 或网页，也没有验证 WebGL 投影、性能或视觉接受。
