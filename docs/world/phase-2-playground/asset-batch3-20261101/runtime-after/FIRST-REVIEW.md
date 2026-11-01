# 首轮候选审图，尚非最终验收

冻结包 `/tmp/bobby-world-batch3-c5434e86-20261102`，完整五项 hash 匹配记录为 `verified-build.json`。主协调已据实际图拒绝 Camp C06/C07 过黑的材质表现，并在源码复用共享 IBL；本轮随后按其指令缩减为首审图片，暂停交还重建窗口。不要将此包的 Camp 图或单个旧样本当作修正版通过。

所有图使用正式 before 相机位置/target、FOV50、Balanced/Clear、停止时间，CSS/实际 buffer1710×931、DPR1。艺术相机先正常运行激活，等待完整资源响应和实际 crafted 根节点，再锁定并重新检查；本轮 IBD 原 batch2 箱也已真实激活，不再是 before 艺术 shot 中的旧 fallback。

读回还发现光照 uniform 使用渐变收敛：四张午夜 snapshot 的 night 值在0.989908至0.999795，正午为0至0.000425，虽然时间已固定在0/720分钟，不能称严格相同的渐变终值。本轮仍只作首审；后续脚本已增加 night 与目标差小于0.001的等待及截图/样本门槛，必要时仅请求有界 demand 更新帧，不改曝光或目标光照。

| 机位 | 图片 | 对应 JSON（前缀 `candidate-after-a1-`） |
| --- | --- | --- |
| V1 平躺椅正午/午夜 | `candidate-v1-club-lounger-noon.jpg` / `candidate-v1-club-lounger-midnight.jpg` | `v1-club-lounger-snapshot-10.json` / `v1-club-lounger-snapshot-11.json` |
| V2 DJ台和两侧音箱正午/午夜 | `candidate-v2-club-dj-noon.jpg` / `candidate-v2-club-dj-midnight.jpg` | `v2-club-dj-snapshot-8.json` / `v2-club-dj-snapshot-9.json` |
| V3 火坑和长凳正午/午夜 | `candidate-v3-camp-fire-noon.jpg` / `candidate-v3-camp-fire-midnight.jpg` | `v3-camp-fire-snapshot-1.json` / `v3-camp-fire-snapshot-2.json` |
| V4 桌凳正午/午夜 | `candidate-v4-camp-desk-noon.jpg` / `candidate-v4-camp-desk-midnight.jpg` | `v4-camp-desk-snapshot-3.json` / `v4-camp-desk-snapshot-4.json` |
| V5 拆检台和控制台正午 | `candidate-v5-ibd-inspection-noon.jpg` | `v5-ibd-inspection-snapshot-6.json` |
| V6 接货/工具工作台正午 | `candidate-v6-ibd-utility-noon.jpg` | `v6-ibd-utility-snapshot-7.json` |

加载证据：Club家具响应2,891,784bytes，`djc-crafted-furniture`在场，图中三类家具可见；Camp包3,313,188bytes，`camp-craft-C05/C06/C07`三根节点和20/12/16个带名前缀的节点在场；IBD包2,962,376bytes，`ibd-static-craft`在场，图中台架、工作台及门板可辨。IBD三个family在适配层按材质合批，场景不会保留三个源family根节点；须结合整包响应、已完成根节点和三类实图判断，不能要求不存在的场景family名。

主协调已读 V3/V4 并明确不接受 C06/C07 的近黑背面/腿，修正仅 Camp 材质副本共享环境及昼夜强度，不改GLB/全局曝光。主协调已读 V5/V6，认为 IBD 白天层次正常，不添加额外补偿。Club 控制台、音箱网罩和平垫木底的实际昼夜图已交主协调。没有对这些图提曝光。

在缩减指令到达前，曾启动正常 running 的Camp一窗；到Escape暂停时已刚完成90warm+300实际帧，原始文件 `candidate-after-a1-n3-camp-sample-5.json` 保留。它属于被要求修正的旧包，**不用于最终候选A/B或通过结论**。此后没有再采性能；没有做坐站、DJ或开箱交互，也没有运行legacy包。最终功能/三代表view同包六窗A/B留到修正版窗口，V5/V6午夜仍待补。

预检pressure2、swap10.84GiB、disk4.79GiB，复用Chrome2/tab1395914218。收尾Escape暂停V1午夜，保存 `first-review-paused-ax.txt`，reset viewport、markHandoff；owned4356 PID9525已停止，匹配 `batch3-perf-after-01a171f1` / PID9525 FILE锁已释放并立即通知主协调重建。4341未动。后续保存修正版图片/receipt应使用新名称，保留本轮拒绝依据。
