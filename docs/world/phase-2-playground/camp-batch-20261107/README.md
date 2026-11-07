# 营地剩余资产精修，2026-11-07

基线为 `3c66e8da538e83a9bbc56aa65592251b87764cca`。三个 GPT 6.1 Sol / high 分工制作，主会话负责返修意见、运行时接入、实际 WebGL 视觉检查和本地交付。本轮覆盖六类、15 处现有资产，保留营地布局及玩法。

| 分工 | 资产 | 放置数量 | 本轮变化 |
| --- | --- | ---: | --- |
| shelter | C04 小帐篷 | 2 | 布面、拼缝、包边、门帘、框架承接；修复首版撑杆穿顶和山墙缝隙 |
| shelter | C10 旗杆 | 1 | 分层底座与金属固定件、旗布折垂；保留四面旗的风与互动动作 |
| workshop | C08 书本 | 1 | 书脊、书页层次、封面、摊开的日记本；保留原翻页动画 |
| workshop | C11 技能工具墙 | 1 | 木框、孔板、金属工具、挂接件与顶盖；保留五类标签和工具摆动 |
| site | C02 展示石板台 | 8 | 交错铺砌、细缝、倒角、边缘缺口、石面粗糙与法线 |
| site | L01 出口灯柱 | 2 | 木纹柱身、铁鞋、锚固件、石脚、灯罩结构；保留原镜片亮度与地面光池 |

## 制作和接入证据

- [帐篷与旗杆源文件、Scenario 检查和返修记录](../../../../tools/world/camp-shelter-craft/README.md)。C04 最终 8,440 三角形；首版及最终版分别留存，不能把首版证据当作最终验收。
- [书本与工具墙源文件、批处理证据](../../../../tools/world/camp-workshop-craft/README.md)。第二轮按材质合批，26 批降至 15 批；标准 glTF 的顶点颜色与 UV1 ORM 调色板保留表面差异。合批前后离线对照 P95 色差不超过 1/255，最终又在游戏中检查。
- [石板台与灯柱源文件、回导和昼夜证据](../../../../tools/world/camp-site-craft/README.md)。六个材质批、2,040 个独立几何三角形；实例化后放置 5,928 个三角形。
- [最终源文件与 GLB 哈希](candidate.json) 与 [原始基线](baseline.json)。本轮四个运行 GLB 合计 3,104,804 字节，均含贴图。不是每个放置点复制一份资源。
- 运行材质保留颜色、法线、粗糙度、顶点色和现有共享 PMREM。原始 collider 与新美术模型分别拥有生命周期。

## 实际游戏前后对比

[交互对比页源码](../../../../tools/world/camp-batch-review/compare.html)，本地交付地址为 `http://127.0.0.1:4341/camp-review/`。使用相对图片路径，并显示加载失败提示。旧帐篷对比页的图片路径也已修正。

八组截图均来自 Chrome 实际 WebGL，没有后期调色。视窗 1710 × 875，渲染画布 2013 × 1030，DPR 1.1772275318111343，Balanced，曝光 1，FOV 50，晴天，白天 12:00／夜晚 00:00。每一组镜头和光照一致。截图接口实际返回 JPEG，因此文件采用 `.jpg`，没有转码。

| 视角 | 精修前 | 精修后 |
| --- | --- | --- |
| 营地总览 | [白天](evidence/before-overview-day.jpg)／[夜间](evidence/before-overview-night.jpg) | [白天](evidence/after-overview-day.jpg)／[夜间](evidence/after-overview-night.jpg) |
| 小帐篷 | [前](evidence/before-shelter-day.jpg) | [后](evidence/after-shelter-day.jpg) |
| 旗杆 | [前](evidence/before-flags-day.jpg) | [后](evidence/after-flags-day.jpg) |
| 书本与石板台 | [前](evidence/before-books-day.jpg) | [后](evidence/after-books-day.jpg) |
| 技能工具墙 | [前](evidence/before-tools-day.jpg) | [后](evidence/after-tools-day.jpg) |
| 出口灯柱 | [白天](evidence/before-lamps-day.jpg)／[夜间](evidence/before-lamps-night.jpg) | [白天](evidence/after-lamps-day.jpg)／[夜间](evidence/after-lamps-night.jpg) |

主会话检查了全部八组运行时画面。帐篷缝线和布面、工具挂接、灯柱材质与结构的变化较明显；书页层次属于近距离细节，不能把远景小变化描述成全场景巨变。用户审美验收仍待反馈。

## 行走、交互和暂停

- 从小帐篷前门实际走入、原路走出，连续记录着地状态；检查出口两根灯柱之间的通行。
- 教育卡片、翻页、技能五分类卡片、工具摆动、四面旗帜的互动反馈均保留。证据在 `interaction-*.json` 与 `walk-*.json`。
- C04／C08／C10 collider 类型、部件、实例与 AABB 前后完全相同；L01／C11 原 collider 创建逻辑未修改。
- 暂停前后风时钟及旗帜角度完全相同，见 `pause-start.json`／`pause-end.json`。
- 候选页浏览器控制台没有捕获到 error。生产构建成功；正式 4341 页面已实际行走，验收工具栏不存在，控制台无 error，见 [正式页截图](evidence/production-4341.jpg) 与 [读回](evidence/production-browser.json)。
- 4341 对比页的 16 张图片均已由浏览器成功解码，昼夜切换及滑杆已验证，见 [图片加载记录](evidence/comparison-images.json) 与 [对比页截图](evidence/comparison-page-shelter.jpg)。

## 性能结果与边界

每组预热 90 帧、采样 360 帧，等待资源与阴影收敛，测量时不运行 Blender 或构建。单一既有浏览器页面，测试机处于内存警告状态，剩余磁盘约 11 GiB。结果是本机局部证据，不能当作全岛或所有设备的性能保证。

| 条件 | 旧版 P50／P95 ms | 新版 P50／P95 ms | 旧／新 draw calls |
| --- | --- | --- | --- |
| 固定总览，白天 | 18.1／28.1 | 22.9／24.9 | 443／455 |
| 固定总览，深夜 | 19.8／38.5 | 24.1／25.2 | 444／456 |
| 营地默认玩家视角，物理与风运行 | 16.7／27.0 | 16.7／17.7 | 194／197 |

固定总览新增约 31,192 个渲染三角形和 12 个 draw calls。中位帧耗增加 4.3～4.8 ms，确有成本；合批消除了 11 次额外绘制，但没有消除全部中位帧耗差异。采样窗口内尾延迟改善，不能据此宣称普遍更快。默认玩家视角本次中位帧耗持平，接近 60 FPS。

固定 shot 会停止部分游戏更新，因此另外加入了真实运行对照：通过可见“回到营地”功能恢复同一玩家位置、相机和时间，保留风、物理和交互更新。实际走动用于功能验收，帧耗采样期间玩家静止。

渲染器几何／纹理计数受已访问区域、缓存加载历史影响，不能把两个不同浏览历史下的总数差直接当成本轮 GPU 内存增量。没有测量 GPU 时间或显存峰值，也不声称已完成泄漏压力测试。

[机器可读结果](verification.json)。运行 `python3 tools/world/camp-batch-review/verify_evidence.py` 可复核配对截图尺寸、相机／曝光、源文件及 GLB 哈希、collider、交互和性能采样条件。`evidence/unbatched/`、`evidence/occluded-camera-drafts/` 是诊断过程，不作为最终成果。

## 回退与发布范围

4341 仅更新本地试玩，不发布公网。原试玩根 `/tmp/bobby-scenario-tent-playable-20261107` 保留。`?campBatch=legacy` 可在同一构建恢复本轮六类旧视觉，之前已交付的大帐篷精修不受影响。原 ground、IBD、town、tent 对比页继续保留。
