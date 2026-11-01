# Batch 3 R2 网页验收

九类资产已获得真实网页外观证据；R2 完成长凳坐下/站起、DJ 手动推子调整/恢复/退出、IBD 清单/工具领取和开盖。所采机位没有发现明显的新台架挡住拆检或开盖错误。三个正常视角各完成 candidate/三项legacy一窗，均90帧预热后300个不同实际render frame，R1性能数据不混算。

性能结论须保留限制：本次短窗中 candidate 的p95均高于legacy；场景计数在窗内分档变化，不能把这些窗口当成完全稳定的单资产benchmark，也不能宣称无性能代价或已经定位CPU/GPU原因。主协调负责最终画面接受、集成和4341切换。

## 冻结包及资产在场

- R2目录 `/tmp/bobby-world-batch3-f359504a-20261102`，HTML SHA `f359504aa9f41d051485bfb118cb2201a98a5abd06814dde00a260fa5fee4e0c`，runtime `_astro/WorldRuntime.DL2Qiyln.js` SHA `b9f2d19834938c75915df37ab05eef05ae28514b7ad2e9e1bca91f5dc84c61d6`。
- 开始和结束均核对五项完整hash，见 `verified-build-r2.json`；三个GLB与R1完全一致。改动为Camp材质复用共享IBL及昼夜强度，未通过全局曝光补亮。
- Club `/assets/world/club/furniture/furniture-v1.glb`，2,891,784bytes，实际 `djc-crafted-furniture` 及 `djc-furniture-lounger/console/speaker` 三子根节点全部在场。
- Camp `/assets/world/camp/craft/camp-props-v1.glb`，3,313,188bytes，实际 `camp-craft-C05/C06/C07` 三根节点在场。
- IBD `/assets/world/ibd/static-craft/static-craft-v1.glb`，2,962,376bytes，实际 `ibd-static-craft` 在场，拆检台、utility台及pedestal门板分别可见。IBD适配器将三个源family按材质合批，不保留三个分family场景根节点，证据采用完整包响应、已完成根节点和三类实图联合判断。
- 可见QA先释放摄影机位，在该区正常运行超过1.8秒/30个真实frame，确认store落点、完整URL响应和根节点，才锁定艺术相机；锁定后再核对节点。legacy模式核对这些新根节点缺席，第二批伞、圆日床、箱等资产保持正常。没有把fallback当候选。

## 外观图与复用边界

六个艺术机位复用 `runtime-before/view-manifest.json`；FOV50，CSS与实际buffer1710×931、DPR1，Balanced/Clear，正午720/午夜0，关闭时间流动。艺术相机不用于性能采样。R2新增图的night uniform距目标小于0.001。

| 内容 | 主要图片 | Snapshot JSON |
| --- | --- | --- |
| R2火坑/长凳正午 | `r2-v3-camp-fire-noon.jpg` | `candidate-after-r2-v3-camp-fire-snapshot-1.json` |
| R2火坑/长凳午夜 | `r2-v3-camp-fire-midnight.jpg` | `candidate-after-r2-v3-camp-fire-snapshot-2.json` |
| R2桌凳正午 | `r2-v4-camp-desk-noon.jpg` | `candidate-after-r2-v4-camp-desk-snapshot-3.json` |
| R2桌凳午夜 | `r2-v4-camp-desk-midnight.jpg` | `candidate-after-r2-v4-camp-desk-snapshot-4.json` |
| R2拆检台/pedestal午夜 | `r2-v5-ibd-inspection-midnight.jpg` | `candidate-after-r2-v5-ibd-inspection-snapshot-10.json` |
| R2utility台午夜 | `r2-v6-ibd-utility-midnight.jpg` | `candidate-after-r2-v6-ibd-utility-snapshot-11.json` |

主协调已据R2 V3正午实图确认材质层次恢复。R1过黑的Camp图只保留为拒绝依据。按主协调明确要求，Club的 `candidate-v1-club-lounger-{noon,midnight}.jpg` 和 `candidate-v2-club-dj-{noon,midnight}.jpg` 四张已接受图，以及IBD `candidate-v5-ibd-inspection-noon.jpg` / `candidate-v6-ibd-utility-noon.jpg` 两张正午图按source/GLB未变复用，未反复重拍。它们的原始snapshot和hash归属仍见 `FIRST-REVIEW.md`，不是伪装成R2新截图；其中旧Club夜图存在已记录的night渐变余量，不称像素级完全同光照终值。R2正常样本仍对这些资产重新核实实际在场。

同一R2包补齐三处legacy午夜代表：`r2-legacy-v3-camp-fire-midnight.jpg`、`r2-legacy-v2-club-dj-midnight.jpg`、`r2-legacy-v5-ibd-inspection-midnight.jpg`；对应JSON分别为 `legacy-legacy-r2-v3-camp-fire-snapshot-1.json`、`legacy-legacy-r2-v2-club-dj-snapshot-3.json`、`legacy-legacy-r2-v5-ibd-inspection-snapshot-5.json`。没有重拍所有旧基线。

## 有限真实交互

- 长凳：QA只定位到已有seat anchor，原生E坐下，Snapshot记录 `camp-bench-0-a`；再次原生E站起，seat变为null，产品重新显示E Sit。证据 `r2-bench-seated.jpg` / `r2-bench-standing.jpg`，JSON `candidate-after-r2-interaction-seat-snapshot-5.json` / `...-6.json`。未直接设置seat制造通过。
- DJ：实际E Take the decks，展开产品手动控件，以键盘将crossfader从0调到0.01，完整AX和截图为 `r2-dj-crossfader-001-ax.txt` / `r2-dj-manual-control.jpg`，Snapshot `candidate-after-r2-interaction-dj-snapshot-8.json` 的clubMode为dj。随后恢复推子0，实际暂停两个声部，并通过Leave the decks退出。`r2-dj-restored-paused-ax.txt`记录两个Play值0及推子0；之后正常Club样本确认clubMode为null。没有将网页控件验证写成独立听感验收。
- IBD：实际点击Pick up manifest、Collect tools、Hide guidance，再到A箱按产品Open操作；完成后HUD显示 `Lid open. Check the contents now.` 和Count/gauge入口，截图 `r2-ibd-open-real.jpg`，JSON `candidate-after-r2-interaction-crate-snapshot-13.json`。新台架/控制台与开盖同框，未见明显阻挡。闭合箱性能窗先于开盖执行，以免与legacy闭合状态混比。本轮没有扩展到逐槽卡尺、整批清点、搬运或发货。

## 同包正常运行A/B

顺序：R2 candidate Camp、Club、IBD，然后在同一冻结包、同一标签导航到 `qa=1&djcFurniture=legacy&campCraft=legacy&ibdStatic=legacy&run=legacy-r2`，相同顺序执行三窗。三个开关同时切换，故是整包视觉组合对照，不是三项资产各自的独立因果实验。

每窗前后均核验：always、shot=null、paused=false、seat=null、clubMode=null、grounded、页面可见、1710×931实际buffer/CSS、DPR1、Noon720/Clear/Balanced/时间停止、night近0。使用原生鼠标按QA读回精确校准yaw/pitch/distance。Camp和IBD两组相机/target/落点仅浮点误差；Club的稳定Z落点及相机/target差1.865毫米，yaw/pitch/FOV完全一致，未为此重采。运动风、火、角色朝向未作动画相位同步。

每窗90个不同frame预热，再300个不同frame；采样期间无截图、无移动或设置操作。按钮在采样中锁定，隐藏/暂停/摄影/缓冲变化/60秒期限均作为失败，不伪造完整窗。GPU时间为null。全部六窗与检查结果见 `ab-summary-r2.json`。

| 正常view/模式 | 聚合FPS | p50 ms | p95 ms | max ms | 帧数>33.4ms | draws中位 | triangles中位 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Camp candidate | 54.66 | 16.70 | 28.50 | 49.60 | 5 | 313 | 862,840 |
| Camp legacy | 60.00 | 16.70 | 18.60 | 18.80 | 0 | 314 | 828,835 |
| Club candidate | 57.26 | 16.70 | 22.50 | 26.20 | 0 | 260 | 2,635,664 |
| Club legacy | 58.98 | 16.70 | 18.70 | 76.60 | 2 | 261 | 1,992,028 |
| IBD candidate | 57.28 | 16.70 | 26.00 | 94.40 | 9 | 142 | 823,458 |
| IBD legacy | 60.00 | 16.70 | 18.40 | 24.10 | 0 | 200 | 1,109,808 |

重要统计口径：这些是 `gl.info.render` 的整场渲染计数，不是单一资产的三角形/提交数；静态snapshot与300帧中位数不可混用。尤其IBD candidate的before为210calls/806,928tri，窗内35帧为此档，265帧为142calls/823,458tri，故中位142；legacy before为200/1,109,808，窗内200帧为此档、100帧为192/695,756。两窗camera固定，但geometry计数分别447变458、414变449，textures/programs各自不变。90warm并不证明全场异步LOD/遮挡/资源状态已稳定，现有数据不能将分档归因于某一代码路径，也不能因为IBD计数下降就声称GPU成本下降。

本次顺序短窗观察到candidate尾帧更高，值得后续性能关注；没有CPU/GPU计时、热状态控制、长期统计或随机化重复，不能排除场景状态更新和主机扰动。没有为了追平噪声重采或扩大场景。R1单窗 `candidate-after-a1-n3-camp-sample-5.json` 及更早baseline全部排除。

原始最终样本：`candidate-after-r2-n3-camp-sample-7.json`、`candidate-after-r2-n2-club-sample-9.json`、`candidate-after-r2-n5-ibd-sample-12.json`；`legacy-legacy-r2-n3-camp-sample-2.json`、`legacy-legacy-r2-n2-club-sample-4.json`、`legacy-legacy-r2-n5-ibd-sample-6.json`。

## 资源、警告和交还

开始preflight memory pressure2、swap11.91GiB、disk3.83GiB；候选结束、legacy开始前pressure2/swap11.4/disk5.04；收尾 `resource-end-r2.json` 为pressure2/swap11.77/disk3.87。始终一个现有Chrome2/tab1395914218、一个临时4356，无并行build/Blender。整机swap变化不解释为网站泄漏。

`r2-browser-warnings.json`是该标签最多12条warning/error的有界读回，含先前页面日志；R2可见的提示为Three.Clock和初始化参数弃用，未捕获新资产boundary error。不能据此声称全局console永远无错。

六窗结束已Escape暂停在三项legacy的IBD闭合正午，完整状态 `r2-handoff-paused-ax.txt`；viewport已reset、markHandoff。owned4356 PID32229已停止，核对owner `batch3-perf-r2-01a171f1` / PID32229后释放FILE锁并先行通知主协调可用。收尾4341仍为PID93949，未改服务、未切交付入口。所有新增内容仅在本目录，无src/public/skills/Git/push修改。
