# Alpha 首批六站整合入口

**当前交付见 [DELIVERY.md](DELIVERY.md)**。最终运行时代码 b35386f，基于6205018，独立分支codex/alpha-batch1-integration-20261114。普通入口完整往返、WebKit代表性操作、日夜图、针对性性能均有证据；真实M3 Air/Safari和长期长帧不声称通过。

[REVIEW.md](REVIEW.md)保留修复/拒绝/证据边界，[ROCK-MATERIAL.md](ROCK-MATERIAL.md)记录现有CC0纹理来源与采样成本。source-lock/preview及GitHub信息见本目录和docs/world/HANDOFF-20261114.md。

## 以下为整合过程记录

### 第一轮整合候选

2026-11-14。独立工作目录 `wt/alpha-batch1-integration`，不替换4341、不推送远端。分支 `codex/alpha-batch1-integration-20261114`。

## 第一轮本地合并

本地merge b426532合入scene最终064856c与traffic已验证功能候选0ac66c7。二者早期互相cherry-pick，产生30个重叠冲突；按已声明作者所有权解决，逐文件来源见merge-resolution.json。

- scene保留新树/坏枝、纸灯/小屋、地形/材质、地图和其捕获工具及原始证据。
- traffic保留所有transports/rides及WorldActors、WorldGuide、WorldGuideAttraction、WorldNight、相关attraction adapter，并保留最新三GLB与Blender工程。
- 主协调逐项比较925个受核源码/资源/制作文件的index内容与各自冻结来源，无不一致。主岛现站其它页面未改。
- 原始stdout日志的尾随空格原样保留，没有为了git diff检查改写历史证据。src/public/tools的diff检查通过。

## 码头生成器的整合差异

scene的alpha-art比traffic增加木材UV/端面/颜色变化。主协调只替换该依赖做两次相同pier构造，比较全部材质分组：position、normal、index、groups及decks/posts/rails记录完全一致；不同的是wood/darkwood的UV/alphaEnd/颜色和metal/rope的顶点颜色。证据为pier-builder-comparison.json。

因此旧traffic码头物理包络不会仅因这次builder合并改变；实际颜色变化仍需整合看图，不能冒充视觉逐像素相同。不重跑整套船体包络。

## 最新整合状态（2026-11-14）

交通最终 `05da1cb`（含木槽/走道精修 `ff7fbab`）已合入。`e975729` 将渡船接到普通入口，统一地面登乘遮罩并避免 DEV fixture 重复注册；`465ceee` 修正坏枝使用 Rapier 的 TypeScript 能力类型。三个 GLB 与交通冻结版一致。

- 整合 build 成功（8 页）；纠正类型后 astro check 683 文件、0 errors。
- 普通 `/world/`，真实鼠标/键盘从营地抵达大陆码头、乘渡船并走下岛端码头已通过。尚不能称为完整六站游玩：原游客路线在小屋外穿过低位雪橇结构，上站穿过脚踏，峰顶尖折落在坡肩，实际行走会停滞。
- 现已用完整局部 Rapier 胶囊夹具定位到不改变地形和交通结构的干燥绕行连接。scene 在独立 checkout 只修游客地图/导向；主协调复核真实输入，不放松碰撞或坡度门槛。
- 原有船、缆车、雪橇的登乘/退出、暂停/受阻恢复，纸灯/添石和树枝互动证据继续按原冻结版本归属，不反复全量重跑。
- 生产版营地 ABBA 对比：1920×1080、Balanced、本机系统 Chrome，各 10 秒采样，baseline/candidate 的 p95 均约 16.8ms，249 calls / 842075 triangles。候选可操作等待约比基线长 0.6 秒。此窄采样未发现营地帧耗回退，不代表山岛在途性能、真实 M3 Air/Safari或系统长帧已通过。

## 剩余交付门

1. 完成可见游客导向修正，真实普通入口连走六站再返回大陆，验证小屋、风闸等动作确实完成，而非仅触发 E。
2. 冻结最终代码，完成适用的必要检查、同机位昼夜视觉检查、Alpha 区域/在途性能和 WebKit 代表性核验。
3. 明示真实 M3 Air 16GB/Safari 尚待验，继续保留长期长帧问题。通过适用本地验收后才提升试玩预览、同步 GitHub；不部署、不合并或推 main。

`evidence/` 中带 fixture 的目录是局部定位结果，失败过程原样保留，不当作完整通行通过证据。正式最终证据另列。

## 复现入口

项目依赖按 `docs/world/HANDOFF-20261112.md` 准备，沿用已有锁文件。本机独立开发端口4353用于普通入口真实输入脚本，build后的生产4355用于画面和帧耗；4341保留接手基线。

```sh
npm run dev -- --host 127.0.0.1 --port 4353
# 另一终端：默认不带任何QA或重定位
node tools/world/alpha-island/integration/ordinary-tour.mjs
# 单独运行，勿与另一个3D窗口或build同时做性能取样
npm run build
npm run preview -- --host 127.0.0.1 --port 4355
ALPHA_REVIEW_PERF=1 node tools/world/alpha-island/integration/review-views.mjs
node tools/world/alpha-island/integration/ride-performance.mjs
```

Playwright属于外部验证工具，不加入现站运行依赖。`ALPHA_PLAYWRIGHT_PACKAGE` 可指向已安装Playwright的package.json；本机默认 `/tmp/alpha-scene-browser/package.json`。系统Chrome路径可用 `ALPHA_CHROME_PATH` 覆盖。WebKit通过 `ALPHA_BROWSER=webkit` 和 `ALPHA_WEBKIT_PACKAGE`（包含playwright-core及其对应浏览器）选择；本机已有1.62.0/WebKit2336。`ALPHA_BASE_URL` 可覆盖上述脚本地址，`ALPHA_CAMERA_MANIFEST` 将相机冻结为之前的配对记录。

`ALPHA_UPPER_FIXTURE` / `ALPHA_TOP_FIXTURE` / `ALPHA_LOWER_FIXTURE` 都是显式局部复核模式，只可按fixture标注；不得拿它们冒充普通入口证明。遇到路牌/树干等可见障碍先检查脚本路线，不删除实体来过测试。
