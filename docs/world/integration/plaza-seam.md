# 广场与栈道视觉交接窄修

基线 `10f285f`，4344。只改 `WorldTerrainPaving.ts`、`WorldTerrainRoads.tsx` 和 `WorldParkWalk.tsx` 的视觉交接，未改 Actors、Guide、TownAssets、Shadows、layout、GLB 或物理生成逻辑。

## 确认的根因与反证

1. **不是“两层都在1.15”**：实读 frozen bridge / park-spur 的 road、side 顶面均 `1.14`。正式广场旗石在 `1.15..1.156`，其倒角下缘为 `1.138..1.144`，垫层为 `1.138`；旧 spur 的路面会穿入部分倒角和砖缝。它延伸至 `x=50.6918`，而正式广场从 `x=43.6` 起，因此这段有重复视觉所有权。
2. **大片黑三角不能全归为顶面 z-fighting**：同视角临时隐藏整个 `world-paving-v4` 后，砖缝外观基本不变；另做 park 阴影临时关闭对照也没有证明其全部来源。最新基线同视角未稳定重现旧44a339e截图里的全部大片碎片，不把截图审阅猜测追认为已确认根因。A/B原图/脚本在仓库外保留。
3. **木石交界存在明确33cm缺口**：石砖止于 `PLAZA.x1-.35=53.15`，木栈道视觉从 `PLAZA.x1-.02=53.48` 起。缺口露出垫层/压顶的端面，形成锯齿边；不是单纯增加木板面数能解决。

## 修改

- `park-plaza` 正式认领后，仅将旧 `park-spur` 视觉裁到 `x<=43.6`，不删除整个桥面，不修改任何高度。未认领时使用原始完整视觉；正式替换卸载/失败后的既有 fallback 逻辑继续存在。
- 首段木板的**视觉裁切面**改到已有石砖边缘 `x=53.15`，补齐33cm交接。板顶仍是原 `DECK_Y=1.14`，不抬高全场，不动任何支撑盒、刚体或标高。
- 原铺装 `v/top/walls/fv/ftop/fwalls` 一字节语义不改。前后序列化SHA256均 `aef1bed6dd101a6501f8d077d7c0e26159f5f538746ee74ecbbcdb6d824363ad`；新的只是独立 render 变体。正式态 chunk1视觉 3557 三角、fallback原3568；实际同实例 claim 诊断看到总顶点 10761→10794（含 forecourt）。
- ParkWalk 的 `surfaces.push`、支撑盒计算及桥/广场原碰撞数组生成代码完全未改；首段 `quad` 只用于板面生成，原 `start/len/mid` 碰撞计算不变。GLB 文件未改。

## 实测与看图

- 同视角：[修前](plaza-seam-before.jpg)、[修后默认](plaza-seam-after-default.jpg)、[修后近景](plaza-seam-after-near.jpg)。亲看木石交界已连续，旧露出的锯齿端面消失；石砖仍保留真实灰色砖缝，不把缝全部涂平。不能据此声称旧截图所有黑三角均已消除。
- 一次桥/广场/栈道相关短走：仅 QA 隔离起点 `[39,2.3,-43.53]`，随后5段全是真实WASD、HUD位置闭环，5/5到达，经桥头→van南侧→van东侧→广场木石接缝→栈道。没有后续传送，没有车辆/全交互测试；完整目标与最终位置在 [小JSON](plaza-seam.json)。
- [普通入口截图](plaza-seam-normal-entry.jpg) 来自无QA的 `/world/` 真实营地出生点，并非把QA园区图改URL冒充普通入口。普通入口画面正常。
- 运行时观测无 pageerror。当前 Astro：**1 error / 0 warnings / 135 hints**；唯一 error 是合入基线 `WorldTownAssets.tsx:123` 的 `Object.fromEntries(...) as Record<Region,BufferGeometry[]>` TS2352，按边界未越权修它，已发主线程。本批三个文件无诊断错误，不称整项目0 error；未声称Console/HTTP全零。
- 完整诊断A/B、脚本、碰撞hash、日志：`/Users/bobby/Desktop/3D-personal-world/evidence/street-integration/plaza-seam/`。未跑全岛、库存或新GLB回读。

Bobby最可能批评“缝还在”：正常砖缝/木板1.5cm留缝属于原结构；本批修的是露出下层端面的33cm断口和已确认旧spur覆盖，未用调亮截图、抬高全部面或删物理来掩盖。其余暗碎片若在main新机位稳定复现，仍需按那一版继续定位，不能追认美术全过。
