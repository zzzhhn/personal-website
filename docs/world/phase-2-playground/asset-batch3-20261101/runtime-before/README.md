# Batch 3 旧包外观基线

2026-11-02 采集，批次目录沿用主协调指定的 `20261101`。六个正午机位覆盖九类资产：Club 平躺椅、DJ 台外壳、monitor 音箱，Camp C05 火坑、C06 长凳、C07 桌凳，IBD 拆检台、utility 工作台和控制台静态外壳。V1 另有深夜图；其余夜景按主协调缩减时段的最新指令留到候选包 legacy 窗口补齐。本轮没有性能采样、视频、正常行走或交互验收。

## 冻结来源和复用方式

- 分支 `codex/world-craft-batch3`，准备时 HEAD `0118dfc`。只拥有本目录，未改其他 session 的源码/资产，也未负责 Git 或 push。
- 服务旧包 `/tmp/bobby-world-batch2-c5f79ee1-20261101`，HTML、runtime、伞、箱四项完整 SHA-256 已匹配 batch2 delivery，记录于 `verified-build.json`。没有从当前正在修改的 src/dist 构建 before。
- `serve.py` 在临时 4356 注入可见 `qa.js`，并将本目录 `views.json` 作为 `/__views.json` 提供；冻结产品文件不改。启动命令：`python3 docs/world/phase-2-playground/asset-batch3-20261101/runtime-before/serve.py /tmp/bobby-world-batch2-c5f79ee1-20261101`。
- 唯一页面 `http://127.0.0.1:4356/world/?qa=1&quality=balanced&paused=1`，Chrome 2 / tab `1395914218`。进入世界后点击 V1 至 V6 的可见按钮，再选 Noon/Midnight，等状态 Ready，Snapshot 保存配置，Hide QA 3s 后截图。机位按钮每次读取 `views.json`，不必为位置微调重载整页。
- 相机调用旧包已有 `__worldCampQA.close(position,target)`，是固定 QA 艺术相机 `shot: camp-qa-close`，不是正常第三人称游玩通过证据。真实 renderer camera position 已与配置逐一核对一致。FOV 50°。
- 临时 viewport 固定 CSS **1710×931**，工具 DPR 为 1，七张正式图实际 buffer 全部 **1710×931**。统一 Balanced、Clear、关闭时间流动，正午 720 分钟，深夜 0 分钟。完成后已 reset viewport。后续比较需重放相同设置并核对实际 buffer，不能只读 URL 中的画质名。

## 六个机位

文件统一为 `before-<ID>-noon.jpg` 和同名 `.json`。精确可机读配置见 `view-manifest.json`；Snapshot 还包含真实 frame、静态模式、角色落点、光照、buffer 和有限加载记录，没有 scene dump。

| ID | 主要覆盖 | Camera position | Target |
| --- | --- | --- | --- |
| `v1-club-lounger` | 第二张平躺椅，伞下完整垫面/底座 | `[78.5,4.2,59]` | `[74,1.65,63]` |
| `v2-club-dj` | DJ 台及完整两侧 monitor | `[43.5,6.3,55]` | `[33,3,55]` |
| `v3-camp-fire` | C05 火坑及 C06 长凳 | `[-33.6,9.2,39]` | `[-42,5.2,30]` |
| `v4-camp-desk` | C07 桌和凳，保留原书/灯上下文 | `[-48.5,8.2,36.5]` | `[-52.6066017178,5.6,40.6066017178]` |
| `v5-ibd-inspection` | 两张拆检台及两侧 scale pedestal 外壳 | `[-74,6.3,-177.8]` | `[-74,1.8,-189]` |
| `v6-ibd-utility` | 接货/工具工作台，远处控制台上下文 | `[-85.7,4.8,-149]` | `[-92.5,2,-154.5]` |

V1 深夜另存 `before-v1-club-lounger-midnight.jpg/.json`，已核对与正午 camera、target、FOV 完全一致。该位置深夜没有邻近工灯，躺垫/底座偏暗，主要可辨轮廓；未提高曝光或添加灯光冒充材质可读性。V2 至 V6 深夜尚未采集。

IBD 控制台展示的是代表性静态壳，不代表十个实例全部逐一验收。V3 右侧远端长凳局部被既有 portal 遮挡，近端长凳和火坑完整可见，已足够作为该 family 的固定 before。

## 保留的探索图和限制

- `exploratory-lounger47-occlusion.jpg/.json`：第一张平躺椅 `[74,1.4,47]` 与既有圆形日床中心 `[74,48]` 重叠，原平垫大部分被遮挡；已通知主协调与 furniture worker。正式 V1 改拍第二张 `[74,1.4,63]`，未改产品布局。不要把 47 处不可见直接归因于候选材质。
- `exploratory-dj-speaker-crop.jpg/.json` 和 `exploratory-inspection-pedestal-crop.jpg/.json`：初始近机位裁到边缘，保留原始记录但不用作正式对照。正式 V2/V5 已后移，位置覆盖在 `views.json`。
- Snapshot 的 resourceQuietMs 表示最近已完成资源响应距采集的时间，不证明所有延迟资产都已激活。本轮正式图均有真实渲染 frame 且已完成响应静默超过 7 秒；但艺术 shot 下 IBD 箱仍显示旧 plain fallback，最近资源中也没有 crate-v1 请求。这不是本批九类静态壳的候选加载证明。
- 后续候选窗口应先释放艺术 shot、在该区正常 play 几帧触发 active/延迟 GLB，并核对 crafted 节点和完整资源响应，再切回这些艺术相机。否则依赖 active 的新静态包也可能仍显示 legacy。已将该限制明确交主协调，不为此延长本轮重型窗口。
- renderer 的 calls/triangles 仅是静态快照上下文，没有进行 warmup+300 帧、FPS、GPU/CPU 或长期资源比较。下一轮同候选包 legacy 对照另约时段。

## 资源和交还

开始 preflight：memory pressure 2、swap 10.78 GiB、disk 5.00 GiB，串行一页一服务。独占 FILE 锁 owner `batch3-perf-before-01a171f1`，最终 owned 4356 PID 52110；期间为启用可复用配置重启过 owned 服务，旧 PID 42155 已先停止。窗口结束先 Escape 暂停 V5 正午页面，保存完整 `handoff-paused-ax.txt`、reset viewport、markHandoff，再核对 token/PID 停 52110 并释放锁，已立即通知主协调可交 Blender。

收尾资源见 `resource-end.json`。4341 PID 93949 仍保持原候选冻结目录服务，未改服务或生产包。唯一标签现停在已暂停的 4356 QA 页，临时服务已关闭，后续继续时需重新提供服务。本目录只保存紧凑图/JSON/脚本与说明，等待主协调审阅和集成。
