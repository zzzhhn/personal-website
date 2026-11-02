# 第五批：设施构造与两项自然资产深化返修

基线：`2f22560fff2174195d8ce70b855ae4b871a388a7`。隔离 checkout：`personal-world-craft-batch5`，分支：`codex/world-craft-batch5`。

当前授权：真实制作约 15 项，保留原生源、候选、对照至主协调验收；交主协调审阅后集成。不得改 `personal-world-djc-release` 的源或 dist，不直接改共享 integration、4341，不 push/deploy。

## 范围与所有权

| 负责 | 真正不同对象 | 拥有路径 |
| --- | --- | --- |
| street-eight | 长椅、候车亭、路灯、交通信号机、垃圾箱、施工路障、海堤栏杆、山路木栏 | `WorldStreetAssets.ts`、独立 `WorldStreetFacilityCraft.ts`、必要 `WorldStreetStatic.tsx` 视觉/物理分离；`tools/world/facility-craft/street/`；`public/assets/world/facility-craft/street/`；本目录 STREET.md |
| camp-five | 吉他、哑铃、炉灶与炒锅、行李箱、桌上提灯 | `WorldCampContent.tsx`、独立 `WorldCampFacilityCraft.tsx`；`tools/world/facility-craft/camp/`；`public/assets/world/facility-craft/camp/`；本目录 CAMP.md |
| nature-two | 代表树主次枝和冠层空隙；草地/裸土斑块过渡，均属深化返修 | `WorldCamp.tsx` 中树的独立 URL 选择、`WorldTerrain.tsx`、`tools/world/facility-craft/nature/`；`public/assets/world/facility-craft/nature/`；本目录 NATURE.md |
| 主执行 | 资源锁、离线/网页采图、构建、总验证、汇总、git 提交 | 本目录其余文件；跨模块协调 |

保留世界识别、布局、碰撞代理、座位、交互、昼夜、风动/踏压/恢复。改进可更换旧视觉形体并增加合理近景/LOD，不能把旧顶点或旧三角形数当质量上限。设施需结构与材料反应可读，不能只换色/加随机螺栓。树先做一个代表样板，地表先做代表区域，同机位网页日夜前后图交主协调评审后再扩大。

## 资源与证据

首次预检：memory pressure 2，swap 9.7 GiB，free disk 35.43 GiB。脚本/轻量检验并行；Blender/render/build/browser 仅主执行拿 `/tmp/bobby-world-phase2-heavy.lock` 后串行。协作者不得起重型作业或浏览器。主协调优先使用本轮浏览器。

依赖通过现有 node_modules 链接复用。原有 public 的只读 symlink overlay 位于 `/tmp/bobby-world-batch5-public-01a19a62`，禁止透过链接修改原目录；构建以任务专用 `astro.batch5.config.mjs` 指向此覆盖层，不修改默认构建配置。新资产写 checkout 内独立 `public/assets/world/facility-craft` 真目录，再链接进覆盖层。保留原始 GLB SHA 与固定物理接口；原生、fresh GLB、实际网页、交互、性能分别记录，未验不报通过。只 stage 显式自有路径，绝不 stage overlay 链接。

主协调已获用户授权自动沟通：完成可审阅子批、跨任务取舍或整批结束时，主执行聚合后发送源线程 `01a121e9-58d6-7aa2-80e2-10005566c39c`，不重复发常规进度。
