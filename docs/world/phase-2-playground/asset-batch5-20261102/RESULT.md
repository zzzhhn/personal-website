# 第五批十四项候选交接

交付 **十三件设施＋G17 R3**。街道8家族与营地5家族分别计数，山路柱梁一组、炉灶炒锅一组。G17 R3已由主协调亲阅16张自然日夜旧新图后通过该样板的视觉方向；十三件设施仍由主协调作最终视觉／集成取舍。**地表R4未通过，不在本提交的默认产品中。** `WorldTerrain.tsx` 与基线 `2f22560` 字节相同。地表R4源码、测试、冻结构建和图像另存作被否决的版本证据，后续独立样板。

## 取用与回退

工作树 `personal-world-craft-batch5`，分支 `codex/world-craft-batch5`，基线 `2f22560fff2174195d8ce70b855ae4b871a388a7`。运行时改动仅 `WorldCamp.tsx`、`WorldCampContent.tsx`、`WorldCampFacilityCraft.tsx`、`WorldStreetAssets.ts`、`WorldStreetFacilityCraft.ts`、`WorldStreetStatic.tsx` 六文件，以及真实新目录 `public/assets/world/facility-craft/`。不改布局、座位、原物理代理、灯池或碰撞源。移除 `facilityCraft=legacy` 使用候选；加此参数完整刷新回批四这些设施与G17。原 `natureCraft=legacy` 自然资产全局回退优先级保留。

固定十四项构建 `/tmp/bobby-world-batch5-r5-fourteen-01a19a62`，8页面，17.21秒；`build-r5-fourteen.json` 记录60文件与7源文件SHA。其中地表精确恢复基线，余六源文件及10个新GLB和R4相同。`astro.batch5.config.mjs` 仅任务构建包装，用 `/tmp/bobby-world-batch5-public-01a19a62` 只读基线public overlay，不替换默认配置，不把旧public资源复制进Git。4341稳定服务及主整合树未写入。

## 审阅材料

- `review.html` 汇总68张实际网页昼夜旧新图＋39张离线原始／可编辑／fresh对照。点击原图；未合成或后修截图。`sample-review.html` 为G17 R3和被否决地表R4的16张自然对照，身份已标清。
- `runtime/visual-audit-r4.json` 对68图核对实际相机位置／水平朝向、FOV50、CSS和buffer1710×931、DPR1、固定正午／午夜、balanced／clear、无fallback，另验证冻结R4的53文件。R4地表源取自 `rejected-ground-r4/WorldTerrain.tsx`，不会冒充当前默认地表。
- `runtime/r5-fourteen-baseline-ground.png`、`runtime/r5-fourteen-camp.png` 是新十四项包的地表回退和普通营地检查。旧R4设施图片用于视觉对照，六文件与GLB完全同源；不声称重拍了新包全部68张。
- 编辑工程：`tools/world/facility-craft/street/native/*.blend`、`camp/source/camp-facilities-source.blend`、`nature/blend/G17.blend`。八组街道具名JSON源约5.74MB留在tools。street GLB仅portable inspection，网页继续使用TS合批，不新增下载。
- 离线实际渲染保留 `street-review/`、`camp-review/` 和根目录树图。camp rigs旧静态收据明确标作recovered deterministic receipt，运动渲染为实际本轮生成，不把补收据写成重渲染。所有候选、原生、fresh和被否决版本保留待主协调复核。

## 验证与边界

十四项定向测试9／9（street5＋camp4）通过，资源审计确认7个原GLB SHA不变，10个新GLB完整。`tests-lanes.txt` 是含被否决地表算法的历史13／13；它不能替代地表视觉通过。当前十四项结果见 `tests-fourteen.txt`。构建与 `git diff --check` 通过。

`runtime/behavior-audit.json` 可重放检查保留的实际浏览器收据：4件营地展品真实可信KeyE均打开About并触发反馈，反馈60/650ms有效、2100ms恢复；长椅和候车亭各真实KeyE坐下／起身，座位状态正确、起身grounded。截图中的候车亭坐姿镜头被遮挡，座位状态证据不等于坐姿画面验收，也没有实际车辆撞击／复位试玩的证据。

G17于31.5m和32.5m仅活动相应LOD两批次，L0共35032tri、L1共8122tri；原根矩阵／yaw0.6、四通道风、depth／distance风绑定均核对。普通游玩相机无位移、0.5997秒共享风钟推进、36实际渲染帧；截图ROI也显示叶片变化，见 `tree-wind-visual-audit-r3.json`。这一风动收据来自R3冻结包，相应树和六源文件与十四项包一致。地面实际W移动3.76m及踏压恢复仅证明既有机制在R4仍工作，不证明R4视觉通过。

## 成本与性能未决

10个新GLB合计3,194,684 bytes，包含不下载的8个街道portable文件。G17 GLB587,904 bytes，1560叶／255可编辑件，2材质、3张256×512原创树皮图。营地包1,501,644 bytes、32900tri，场景中双哑铃按实例计38456tri；不新增贴图，PBR环境借用既有cache。街道三角数与原代理逐值一致的物理证据见 `STREET.md` 和测试。

有限帧窗均90真实帧预热＋300真实帧，正常落地、镜头与角色静止、实际1710×931、固定正午、balanced、clear，无截图控制插入采样。有效旧新街道为59.44／48.45FPS，p95 21.6／33.8ms，绘制140／140，可见三角544799／568420。有效地表R4窗为45.12／40.15FPS，p95 42.8／41.2ms，只描述被否决R4。旧营地有效55.46FPS；候选营地初次几何不稳、最终窗被暂停打断，没有可接受配对。

**帧时间验收未决，不把这些顺序单窗归因于资产，也不宣称性能通过。** 本机负载随时间变化，旧版也波动；preflight为pressure2、swap约12.7GiB、free约30.9GiB，存在其他npm／DevTools活动，进程存在不证明其导致降帧。无效窗口与原因保留 `runtime/performance-calibration-r4/`，最终中断截图／TXT保留，已到约定停止条件，不追逐最好FPS。后续若集成，由主协调另判性能取舍。
