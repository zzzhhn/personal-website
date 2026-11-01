# Batch 2 候选网页验收，2026-11-01

性能 session `01a171f1-267a-7ef0-92e5-19a47dad0a4b`，本轮仅拥有 `runtime-after/`。候选伞、箱已真实出现在网页；箱 A 完成实际开盖，以及一个检验槽的取样、M8 接触读数、归位和工具收起。所采机位未见明显的新外壳穿模或箱盖方向错误。材质最终接受由主协调看实图决定，本记录不是整批八件、搬运或发货流程验收。

## 版本、加载和资源安排

- 冻结目录 `/tmp/bobby-world-batch2-c5f79ee1-20261101`。本轮开始和结束均核对 HTML、runtime、伞 GLB、箱 GLB 四项完整 SHA-256，全部与主协调 receipt 一致；副本见 `verified-build.json`。
- HTML `c5f79ee1b48787bb6644ec309fcab3f6072ffe116163665ce6d6caab2c49d0e2`；runtime `_astro/WorldRuntime.BM-BS5VK.js`，SHA `d920e5270f1fbb55d954b52a52bc428ac3a0c14053d63f2a836d494f4badc194`。
- 临时 4356 仅向该冻结 HTML 响应注入本目录 `qa.js`，产品 bundle、src、public、dist、稳定 4341 均未修改。
- 复用 Chrome 2 / tab `1395914218`，没有新开标签或浏览器。开始 preflight pressure 2、swap 12.15 GiB、disk 4.35 GiB；期间 pressure 2、swap 10.52 GiB、disk 6.92 GiB；收尾见 `resource-end.json`：pressure 2、swap 11.32 GiB、disk 5.92 GiB。均串行执行，无并行 build/Blender；这些整机数值不归因于网站。
- atomic FILE lock owner `batch2-perf-after-01a171f1`；本轮独占期只运行一个 QA 服务和一个渲染页。
- 伞快照记录 GLB 完整响应 2,471,556 bytes，`djc-crafted-umbrellas` 和新材质节点已出现；箱快照记录 GLB 4,161,428 bytes 和 `ibd-crafted-crate-lid`，截图可见新木板/五金。加载完成、真实 frame 前进后才采样，未用 fallback 图冒充候选。
- 浏览器捕获到的四条 warning 均为两次加载各自的 Three.Clock、初始化参数弃用提示；未捕获 asset boundary 错误。服务器日志未见 4xx/5xx。

## 构图与缓冲范围

统一 Balanced、Clear、关闭时间流动，正午 720 / 午夜 0。重放了 baseline 的实际角色落点、yaw/pitch、相机位置和正常 preset；原始 snapshot JSON 保留精确数值。

本轮开始自然 CSS 已变为 1710×875，初始探针 `candidate-umbrella-snapshot-1.json` 为 buffer 2013×1030，**不用于采样或主要截图**。为重放原构图，临时 viewport 固定 CSS 1710×931；该工具同时将 DPR 覆盖为 1，因此本轮主要图和四个样本实际 buffer 均为 **1710×931**。旧 baseline 的实际 buffer 是 1951×1062，不能称两轮图片像素级同 buffer，不能直接比较旧 54.2 FPS。本轮采样后已 reset viewport。

候选正午/午夜伞近景相机相同，箱开盖正午/午夜相机相同；与旧基线落点/朝向相同，FOV 仅有原生相机收敛阈值导致的千分之一级差异。工具展开时使用产品自然 inspection 镜头，位置 `[-80.7,4.9,-185]`、target `[-78,2.55,-187.35]`、FOV 42；未另造测试镜头。

## 主要图和状态索引

| 内容 | 图 | snapshot JSON |
| --- | --- | --- |
| 伞正常第三人称原位接近，正午 | `candidate-umbrella-approach-noon.jpg` | `candidate-umbrella-snapshot-2.json` |
| 伞完整近景，正午 | `candidate-umbrella-close-noon.jpg` | `candidate-umbrella-snapshot-4.json` |
| 伞同机位午夜 | `candidate-umbrella-close-midnight.jpg` | `candidate-umbrella-snapshot-5.json` |
| 干燥通路实际步行接近 | `candidate-umbrella-dry-approach-noon.jpg` | `candidate-dry-snapshot-6.json` |
| 箱 A 闭合正午 | `candidate-ibd-closed-approach-noon.jpg` | `candidate-ibd-snapshot-7.json` |
| 箱 A 实际开盖正午 | `candidate-ibd-open-approach-noon.jpg` | `candidate-ibd-snapshot-9.json` |
| 箱 A 同机位开盖午夜 | `candidate-ibd-open-approach-midnight.jpg` | `candidate-ibd-snapshot-10.json` |
| 自然 inspection 取样/量具展开近景 | `candidate-ibd-tool-presented-noon.jpg` | `candidate-tool-snapshot-11.json` |
| 真实合拢，M8 接触读数 | `candidate-ibd-tool-measured-m8-noon.jpg` | `candidate-tool-snapshot-12.json` |
| Pocket 1 已验、原槽归位 | `candidate-ibd-tool-pocket1-returned-noon.jpg` | `candidate-tool-snapshot-13.json` |
| 退出 inspection，工具收起 | `candidate-ibd-tool-stowed-noon.jpg` | `candidate-tool-snapshot-14.json` |

截图均在采样以外保存，隐藏了 QA 条，保留产品 HUD。伞骨和厚边可辨；箱体正午位于棚下偏暗，午夜工灯下木纹与五金可辨。没有改曝光、添加材质私有环境或补亮来掩盖明暗，实际图交主协调审阅。

## 实际操作及覆盖边界

伞原位重放沿用 baseline 的 `[76.5,3.5,42]` 输入、真实落地点 `[76.51952362060547,1.3712164163589478,42.01386642456055]`；这部分仍是浅池底近景材质对照。另用 QA `Dry approach` 放到 `[89,3.5,47]`，通过原生转向和 W 400 ms 沿池边步行，最终 `[87.56021118164062,1.8956220149993896,46.951866149902344]`、grounded true；截图清楚显示角色在干燥石板通路。

箱 A 通过产品领取 manifest、领取 tools、Hide guidance，再到原闭合机位 `[-78,1.9039127826690674,-186]`。点击产品 `Open the carton and tray`，随后 HUD 显示 `Lid open. Check the contents now.` 并切换到 `Count, gauge and inspect contents`。开盖终态沿后缘抬起，所采正常机位没有反向翻向角色或明显 pivot 漂移。

点击 contents 后执行 Pocket 1 的 `Present selected pocket → Close and read → Return to pocket`。HUD 显示 `Contact · Measured M8`，归位后出现 `✓ Pocket 1` 并选中 Pocket 2。再 `Put back and leave`，回到正常镜头，取出的样品已回箱、量具/吊架已收起；截图中未见明显的新外壳穿模。只完成这一槽，没有宣称整批数量已核实，也没有运行搬运、发货或全套卡尺回归。

## 同包 A/B 短样本

入口同一候选包。顺序为默认 candidate 的伞、箱各一窗，随后导航到 `?qa=1&djcUmbrellas=legacy&ibdCrates=legacy`，同位伞、箱各一窗。**两个 legacy 开关同时生效**，因此比较范围是包内两项视觉开关组合，不是严格分离的单资产 CPU/GPU 归因。

每窗先等加载/落地并 snapshot 核对，再跳过 90 个实际不同 render frame，记录 300 个不同 frame 的 delta/draws/tri；未在采样中截图、移动或改设置。四窗 buffer/CSS/DPR/光照/天气/角色位置一致；两伞窗 camera 差异为浮点误差，两箱窗相机位置完全相同、FOV 差 0.002369°。比较断言和完整摘要见 `ab-summary.json`，原始 sample JSON 保留全部帧。

| view / 模式 | FPS 聚合 | p50 ms | p95 ms | max ms | draws 中位 | triangles 中位 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 伞 candidate | 60.00 | 16.70 | 17.10 | 17.80 | 81 | 2,187,636 |
| 伞双 legacy | 60.01 | 16.70 | 17.60 | 17.80 | 81 | 1,921,854 |
| 箱 candidate | 60.00 | 16.70 | 18.60 | 21.40 | 131 | 716,948 |
| 箱双 legacy | 59.61 | 16.70 | 17.60 | 31.30 | 90 | 477,466 |

四窗均无大于 33.4 ms 的帧，GPU 时间为 null。伞视图 renderer 三角形计数中位增加 265,782；箱视图 draws 增加 41、三角形增加 239,482。伞窗 draws/tri 有多值分布，箱窗计数恒定；范围见摘要。这些是整个场景和渲染 passes 的计数，不等同 GLB 原始三角形数。

在本次短窗和 1710×931 缓冲下未观察到明显持续帧率退化，但候选确实增加绘制工作；约 60 FPS 不能证明成本相同或提升。没有测 GPU 时间、CPU profile、长期热量、内存泄漏、其他画质或设备，亦未与旧受扰基线硬比。只运行这两个 view，没有为追平噪声重采。

原始样本：`candidate-umbrella-sample-3.json`、`candidate-ibd-sample-8.json`、`legacy-umbrella-sample-2.json`、`legacy-ibd-sample-4.json`。

## 交还状态

已在 legacy 箱 A 闭合、正午/Balanced/Clear 位置用 Escape 暂停，恢复浏览器 viewport，唯一 tab 已 markHandoff。当前 URL 仍带双 legacy 和 `case=legacy-umbrella`，该 case 只是最初页面标签，保存箱样本时 Evidence label 已改为 `legacy-ibd`。候选页面状态已由前述图/JSON保存。

owned 4356 PID 52209 已停止，匹配 owner 的 FILE 锁已释放并立即通知主协调；复查 4356 无监听、锁不存在。4341 PID 85664 保持原冻结目录服务，未导航、刷新或改动其页面。图和数据约 1.68 MiB，本轮未提交、push 或切稳定交付入口，等待主协调实际审图后决定集成。
