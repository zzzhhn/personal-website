# Batch 6 facilities：首样审阅

日期：2026-11-03。状态：**候车亭与小屋首样已交审，两族均未标记完成，尚未扩展其余族**。

## 基线与范围

- 分支：`codex/world-craft-batch6-facilities`，源码基线 `7702c3de674f0b39ab8b0e2a098e586b54b03aee`。
- 当前冻结证据：`runtime/` 下 16 张原始 WebGL JPEG 与 16 份同名 JSON。命名为 `{baseline,candidate}-{shelter,hut}-{normal,close}-{noon,night}`。
- 基线使用本分支同一构建的 `craft6=baseline`，关闭本轮几何与表面接入，保留 R10 的旧 clone-hook 行为。候选启用本轮接入。
- 全部固定 DPR 1、绘图缓冲 1710×875、FOV 50、曝光 1、balanced、clear、停止时间推进。日／夜分别为 720／0 分钟，过渡 blend=1，shadow.pending=false。每对 camera、target、time、FOV、画布完全一致。
- 普通机位距离约为候车亭 7.8m、小屋 11.5m；近景约为 3.4m／4.5m。截图底部保留一致的 QA 按钮栏，未裁剪或修图。
- 生产 4341、全局曝光／照明、玩法、座位、摆位和原碰撞代理均未修改。未部署、推送或合并。

## 自评与未完成项

已逐张查看全部 16 张。小屋普通视距可读出木材与蓝漆的区别、柱梁／地板纹理和叠层檐口；近景木纹偏粗、条带过强，蓝漆的大面变化略显云斑。来源扫描宽 0.7m，当前 long UV 周期 2.4m，不能称为严格物理比例。

候车亭座面木纹和框架表面响应可见，但三块大面仍像不透明白板，尚未建立可信的玻璃／半透板构造。这是当前最主要的返修项，不能用五金或座板细节判定全族完成。

局部借用静态 Djc 环境图，intensity=.65 日夜不变，候选夜间表面比基线明显提亮，需要在本材质范围适配夜值。小屋夜间还包含旧版 clone-hook 丢失问题的修复，不能把全部亮度差异归因于木材纹理。

小屋 native、portable GLB 已生成并 fresh-import；候车亭本轮 native／portable 仍待更新。小屋 portable 与 WebGL 的色彩混合公式存在差别，当前只验证 UV／材质与纹理渠道连通，未声称离线和网页逐像素一致。

下一版优先修候车亭大面材质与框体厚度、木纹尺度及局部夜间响应。主协调审阅这两个样板后，再推广其余设施。

## 实际运行路径与保留／丢弃渠道

### 候车亭

`WorldStreetFacilityCraft` 的原 Builder → 候选折边帽／立缝 → `tagShelterSurfaces` → 原街景 batch → `WorldStreetMaterial`。

`aMat.w > .5` 继续表示 sign atlas；`aMat.w < 0` 是物理 slot：1 wood、2 paint、3 bare metal、4 glass、5 roof。`aSuv` 在 sign 面保留原 atlas 坐标，在物理面携带制造 UV。未标记面为 slot 0，沿用原材质路径。没有新增 GPU attribute，也没有把木纹写进 sign atlas。

木面实际采样共享 color／roughness／normal 三图；paint、metal、roof 使用各自 PBR 因子和有限的大面变化；glass 目前只有 roughness 因子，仍为 opaque。原 sign／emitter、座位 datum、冻结 hull 和 L1 未改。

### 小屋

`tools/world/facility-craft/batch6/build_huts.py` 原始构件生成 → 保留制造 UV／材质名的 `hut-runtime.glb` → `WorldPark` 视觉 root → 多 material group 的 `gltfPieces` → `toBatch` 在 world transform 前保留 UV → `WorldParkKit` 的共享表面 shader 与原 aEmit 夜间逻辑。

运行时 GLB 不带图片，避免与共享包重复解码／驻留。原 GLB 继续单独供 `gltfTrimesh` 碰撞使用。所有 fallback／旧 batch 都有完整 aMat／aSuv 默认布局。PartBatch 与 Knockables 显式保存 source.onBeforeCompile 后组合 fade，修复 Three clone 不复制 hook 的问题；program key 包含组合功能。

runtime GLB 保留 UV、材质名、构件与顶点色。其原始材质贴图连接被有意移除，实际 PBR 来自网页共享包与 slot 分类；因此 native 材质不能单独证明网页效果。

### 共享所有权

`WorldFacilitySurface` 每浏览器模块会话只创建一套木材三图，park／street 材质只借用。单个 mesh、LOD 或材质副本释放时不 dispose 共享图。局部材质借用现有 renderer-scoped Djc PMREM 缓存，不另烘环境、不写 scene.environment、不增加灯。注册材质在 dispose 时退出本地集合。

## 资源与验证

- `hut-runtime.glb`：596156 bytes，0 embedded images，12 materials，304 meshes／UV primitives。
- `hut-portable.glb`：2337880 bytes，带嵌入 PBR 的独立审查包。
- `native/huts.blend`：A 为 149 parts／3084 triangles，B 为 155 parts／3156 triangles，均有 UV。hash 见 `hut-export-report.json` 与本目录 `manifest.json`。
- 纹理沿用项目既有 Poly Haven Coated Pine 衍生图，CC0，1024×512；扫描 Charlotte Baglioni，处理 Rico Cilliers。精确来源／变换见 `public/assets/world/craft-batch6-facilities/sources.json`。无新增图像生成服务。
- 原街景 construction 测试 5/5；本轮 surface-path 测试 3/3；Python 编译与改动 TS／TSX 的 transpile syntax 通过。运行时截图证明真实 WebGL 输出，不能替代视觉接受。
- 未做 production build、完整 semantic typecheck、正常游玩 FPS 比较；截图内 render counts 只作该帧收据，不能用于性能结论。

## 后续授权队列

当前 9 族优先：公园 hut、deck／piles、low rail、lamp；街景 bench、shelter、bin、seawall metal rail、mountain timber rail。

主协调后续返修队列共 16 项，其中街景原有 5 项不重复计数：`G-seawall-rail`、`G-lamp`、`G-barrier`、`G-bin`、`G-bench`、`S-shelter`、`S-signal`、`S-timber`；Club 的 `D-pavilion`、`D-basin`；IBD 的 `I-shed`、`I-truck`、`I-crane`、`I-coil`、`I-rack`、`I-stockcrate`。顺序是当前 9 族后，新增街景 3 项 → Club 2 项 → IBD 6 项。收到队列不代表完成，也不抹去已有历史接受。Club 植被属于自然线，`WorldDjcClubGeometry` 装配入口属于主协调。

## 本地复现与交接

开发配置：`astro.batch6.facilities.config.mjs`；QA 查询 `craftReview=1`，基线另加 `craft6=baseline`。仅 task-owned 4348 曾用于本组截图，现已停服，task-owned Chrome tab 已关闭，heavy lock 已释放给自然线。

依赖使用 release 的 node_modules 链接；public 为资源链接 overlay，旧资源借自 `/tmp/bobby-world-batch5-public-r7-01a19a62`，本轮 `craft-batch6-facilities` 为私有真实目录。git status 中其余 public 的 D／T 来自 overlay，绝不能 stage 或作为删除提交。只 stage 明确拥有的源文件、工具、私有资产和本目录证据。
