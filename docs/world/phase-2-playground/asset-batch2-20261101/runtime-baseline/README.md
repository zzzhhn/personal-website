# Batch 2 before 基线，2026-11-01

本目录由性能 session `01a171f1-267a-7ef0-92e5-19a47dad0a4b` 采集，供两把 Club 独立伞和 IBD 零件箱精修后对照。仅增加 QA 壳和证据，未修改产品源码、public、dist 或 4341 页面。当前共享分支为 `codex/world-craft-batch2`；其他 dirty 文件属于协调及资产工作。

## 冻结版本及统一设置

- 服务目录：`/tmp/bobby-world-craft-2ed93e9e-20261101`，与指定 4341 的冻结版本一致。完整 HTML/runtime SHA-256 见 `before-build.json`。
- 临时入口：`http://127.0.0.1:4356/world/?qa=1&quality=balanced&start=club&paused=1&case=before-umbrella`。`serve.py` 只向响应注入本目录的 `qa.js`，产品 bundle 未改。
- Chrome browser 2，tab `1395914218`；全程复用一个标签，没有创建新浏览器。
- 所有记录：CSS 1710 × 931，实际 drawing buffer **1951 × 1062**，pixel ratio 1.1412731405118963；Balanced、Clear、关闭时间流动、步行模式、无摄影 shot。正午 720 分钟，午夜 0 分钟。后续比较必须核对实际 buffer，不能只核对画质名称。
- 开始 preflight：pressure 2、swap 9.24 GiB、disk 7.74 GiB。收尾前：pressure 2、swap 12.24 GiB、disk 4.68 GiB；协调 session 另报告期间有其他 npm 活动。因此这些参考不构成新资产性能归因。

## 截图与数据索引

| 视图 | 截图 | 状态文件 |
| --- | --- | --- |
| 伞正常第三人称接近，正午 | `before-umbrella-approach-noon.jpg` | `before-umbrella-snapshot-1.json` |
| 伞完整第一人称近景，正午 | `before-umbrella-close-noon-final.jpg` | `before-umbrella-snapshot-4.json` |
| 同机位伞午夜 | `before-umbrella-close-midnight.jpg` | `before-umbrella-snapshot-5.json` |
| 箱 A 正常第三人称闭合，正午 | `before-ibd-closed-approach-noon.jpg` | `before-ibd-snapshot-6.json` |
| 箱 A 产品 UI 实际开盖，正午 | `before-ibd-open-approach-noon.jpg` | `before-ibd-snapshot-7.json` |
| 同机位箱 A 开盖，午夜 | `before-ibd-open-approach-midnight.jpg` | `before-ibd-snapshot-8.json` |

`before-umbrella-close-noon.jpg` / snapshot 3 是初次朝向的探索构图，伞面被截断，保留原始记录但不用作主要 before。伞第三人称图包含 QA 条；其余主要图已隐藏 QA，仅保留产品 HUD。

## 重放落点与相机

QA 按钮只负责放置角色和统一场景设置；箱盖通过现有产品交互打开，没有直接改 IBD store。截图中的角色已真实落地，不能把传送输入高度当作最终高度。原始 JSON 含完整 camera、grounded、velocity、HUD、buffer、光照和 renderer 计数。

### 独立伞

1. 新鲜页面从 Club 开始，点击 QA `Umbrella approach` 和 `Noon`。输入落点 `[76.5,3.5,42]`；落地后 player `[76.51952362060547,1.3712164163589478,42.01386642456055]`。这是浅池底位置，不是干燥通路接近测试。
2. 第三人称基准：yaw `-1.5707963267948966`、pitch `0.4`、preset 1、distance 12、FOV 50。camera `[76.51952362060547,6.694236524062754,30.961134496525926]`，无碰撞。
3. 原生 `V` 两次切到第一人称，再原生拖动 `[900,460] → [816,395]`，随后 `[850,430] → [1018,430]`。这是本轮真实操作轨迹；后续以 snapshot 4 的最终值校准，不以鼠标像素单独认定机位一致。
4. 主要近景：yaw `-1.1087963267948968`、pitch `-0.2375`、preset 3、firstPerson true、actualDistance 0、FOV `69.99178067940862`；camera `[76.3858018237445,1.6712164163589478,42.282415267500284]`。正午和午夜该机位完全一致。

### IBD 箱 A

1. 先用 `IBD manifest` 到 `[-91,3.8,-150]`，点击产品 `Pick up the manifest`；再 `IBD kit` 到 `[-94,3.8,-157]`，点击产品 `Collect the tools`；点击产品 `Hide guidance`，变为 `Resume guidance`。
2. 点击 QA `IBD crate` 到 `[-78,3.8,-186]`，角色落地为 `[-78,1.9039127826690674,-186]`、grounded true。从上述伞最终朝向原生拖动 `[300,360] → [787,360]`。箱 A 物件原点约 `[-78,2.1,-189]`。
3. 闭合/开盖/午夜统一第三人称：yaw `1.5697036732051028`、pitch `0.55`、preset 1、distance 12、FOV `50.00838368497436`；camera `[-77.98882183447127,8.826159529836984,-175.76971184221787]`，target `[-78,2.5539127826690673,-186]`，无碰撞。闭合记录仅有浮点级插值差异，详见 snapshot 6。
4. 通过产品 `E / Y Open the carton and tray` 实际开盖。完成后产品 HUD 显示 `Lid open. Check the contents now.`，主操作变为 `Count, gauge and inspect contents`；正午图能看见抬起箱盖及内部零件。仅开盖，没有计数、卡尺测量、搬运或发货。本轮不据此声称这些后续流程已验证。
5. QA `Midnight` 只改光照，保留同一机位和开盖状态。

## 已有短样本及限制

`before-umbrella-sample-2.json`：正常第三人称伞区，跳过 30 个实际渲染 frame 后记录 300 个不同 frame 的 delta、draws、tri。该循环报告 `mode: always`，不是暂停采样。

- 300 帧，聚合 FPS 54.2182，p50 16.70 ms，p95 17.10 ms；最长 312.20 ms，2 帧超过 50 ms。
- median draw calls 113，median triangles 1,466,344。GPU 时间不可用（null）。
- 采样开始后曾抓接近截图，且当时冻结页面尚处于较早加载时段；主机资源紧张并存在其他工作。不能将 54.2 FPS 当作稳定帧率，也不能据此判断精修资产的增减成本。
- 按协调 session 的最新缩减范围，没有追加箱子采样或重测伞样本。箱子 runtime 计数只是状态快照，不是性能样本；after 若需严格性能比较，应另约独占时段。

## 交还状态

箱子午夜图保存后已用 Escape 打开 `Map & settings` 暂停，页面保留午夜/Balanced/Clear，未改 4341。tab 已 `markHandoff()` 供后续继续，服务停止后不要直接刷新而预期仍可加载。

已停止本轮唯一临时 4356 服务 PID 58549，并核对 owner 内容 `batch2-perf-baseline-01a171f1` 后释放 `/tmp/bobby-world-phase2-heavy.lock`。收尾复查 4356 无监听，4341 PID 85664 仍在原冻结目录服务。已立即通知主协调可把 heavy 时段交给 umbrella/Blender。本目录证据总量约 0.82 MiB（不含本说明）。
