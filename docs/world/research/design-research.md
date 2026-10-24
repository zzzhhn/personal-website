# /world 设计调研：Bruno Simon、GTA5、原神与 morluto/rea（2026-10-24，ui 会话）

## 0. 结论先行

1. **界面要「长在世界里、只在需要时出现」。** 三个参照物共同的做法：常驻 HUD 只有小地图和极少文字；交互提示在靠近时才出现、离开就收起；地名在进入区域时浮现几秒后自己消失。我们现在的问题是底部常驻一大段操作说明、提示是一个通用黑框，像调试界面。本轮改成：首次进入的按键引导（用过一次就淡出）、靠近时的按键提示（E／手柄 Y，多个目标可以 Q 切换）、进入区域的地名浮现、带地标的小地图和可点地图设航点的大地图。
2. **内容卡片是本轮最大的体验缺口。** Bruno 的项目展示是「走到展位、按键、看到大图和链接」；原神的阅读物是居中纸面、一键关。我们的卡片按同一思路做：居中、纸质暖白（Art Lock 奶白 `#E6DCCB` 系）、衬线大标题（现站已有 Instrument Serif），事实全部来自现站数据源，E／Esc／点击关闭。
3. **不加任务、成就、奖励、计时。** Bruno 新站有成就、排行榜、圈速赛（rea 在包里看到 `achievements`、`leaderboard`、`circuit`、`timer`），GTA 有任务标记，原神有每日委托；这些都属于冻结 PRD §9 的禁做项，不借。
4. **航点做，声音本轮不做。** 航点是「看地图 → 去那里」的导航，不附带奖励或完成判定，符合 §15.3「浏览内容不构成任务系统」；声音需要先选定并登记 CC0 素材、并和园区 DJC 展位的全场音乐（§3.3）统一设计，本轮不做，理由见 §6。
5. **rea 实际跑通了。** 用 rea-agents 6.7.0 对 headless Chrome 里的 bruno-simon.com 跑了 list-browser-targets、inspect-web-page、analyze-web-bundle、capture-web-screenshot，拿到脚本体积、依赖指纹和 71 个声音路径等证据（§4）。

证据等级说明：标「源码」的是读过 MIT 开源代码；标「rea」的是本次 rea 采集的被动观测；标「资料」的是网上公开资料（附链接）；标「推断」的是我的设计判断，没有直接证据。

## 1. Bruno Simon

### 1.1 folio-2019（源码，MIT，`/tmp/folio-2019`）

- **开场**：加载完成后不直接开始，先给一个「开始」点，按下后 `reveal.go()` 用 gsap 在 3 秒内把 matcap 材质从无到有铺开，0.5 秒后地面阴影再淡入，同时播放 reveal 声音（`World/index.js` 83–160 行）。开场是一段「世界被点亮」的动画，不是进度条结束就切画面。
- **操控**：键盘方向键／WASD 驱动小车，触屏有虚拟摇杆（`World/Controls.js`）；车是唯一的身体。
- **物理玩具**：cannon.js 刚体，砖墙、保龄球瓶、路锥都能撞倒；撞击声音量与碰撞速度挂钩（`World/Sounds.js` 的 `velocityMin`、`volumeMin/Max`、`rateMin`），撞得越狠越响、音高越低。
- **彩蛋**：Konami 秘籍（`World/EasterEggs.js` 27–52 行），地上还写着提示；不影响主流程。
- **声音**：Howler；按 `m` 键全局静音（`World/Sounds.js` 183–205 行），开 debug 时默认静音，页面隐藏时自动静音。
- **项目展示**：每个项目是一排地面上的大画板（`World/Sections/Project.js`），旁边地上有一块可踩的「Open」区域，车开进去按 Enter 才 `window.open` 外链（192–197 行）。**外链需要二次确认**这一点和我们 PRD §3.3「再按一次打开现站对应页」一致。
- **区域交互的表现**：`World/Area.js` 进入区域时地面边框加亮、一圈栅栏升起、出现 Enter 键图标；离开时反向收起。提示是世界内的几何，不是屏幕角落的文字。
- **加载与性能**：matcap 代替实时光照、阴影是贴在地上的假阴影平面（`World/Shadows.js`），GLB 用 Draco；静态资源 models 5.3 MB、sounds 7.2 MB。

### 1.2 当前的 bruno-simon.com（rea + 源码片段 + 资料）

- **技术栈**（rea 静态指纹，§4）：three.js r183（`REVISION = "183"`），WebGPURenderer＋TSL 节点材质（`TSL` 723 处、`WebGPURenderer` 39 处），Rapier 物理（单独 230 KB 胶水 + 1.7 MB WASM，动态 import），Howler 音频，gsap 动画，KTX2／Draco／Meshopt 解码，大量 `InstancedMesh`／`BatchedMesh`。站内「Behind the scene」也写明 three.js＋TSL、Rapier、Howler（资料：[bruno-simon.com](https://bruno-simon.com/)，源码仓库 [folio-2025](https://github.com/brunosimon/folio-2025)；其 `package.json` 声明 three ^0.183.2、@dimforge/rapier3d ^0.17.3、howler ^2.2.4、gsap ^3.12.5，与 rea 的静态指纹一致）。
- **开场**（rea 截图 `evidence/ui/rea/bruno-simon-headless.png`）：黑紫网格地面中央一小块圆形场地，一辆车、一盏灯、几棵树，手写字「CLICK TO START」和一个声音图标。点击后 `Reveal.updateStep(0)` 让圆环收缩、网格出现、视距从 0.6 推到 0.3（`index.js` 99414 行附近）。**先给一个很小、很精致的局部，再把世界展开**，这是他开场的核心。
- **交互点**（rea 抓到的源码，`_InteractivePoints`，87098–87381 行）：
  - 三态：隐藏 / 收起（concealed，只显示一个小点）/ 展开（open，显示标签和按键图标）。
  - 玩家 2.5 m 内最近的一个展开，其余收起；玩家移动超过 0.2 m 才重新判定（省计算）。
  - 展开时标签和线条用 `elastic.out` 弹出，按键图标延迟 0.6 s 再弹；收起用 `back.in`。展开/收起各配一声很轻的纸张声（音量 0.25）。
  - 按键图标跟输入设备切换：键鼠显示 Enter，手柄显示 A（Xbox）或 ×（PlayStation），触屏改成屏幕按钮（`InteractiveButtons`）。
- **其他系统**（rea 抓到的类名与资源名）：`Zones`（球/圆柱进出事件）、`Respawns`（多个复活点，取最近）、`Areas`（Career、Social、Cookie、Bowling、TimeMachine 等区）、`Whispers`（多人留言火苗，走 `wss://` 服务器）、`Achievements`、`leaderboard`、`circuit`、`weatherRain`/`weatherSnow`、`map-day.webp`/`map-night.webp` 两张地图图、`modals.open("map")`（地图在世界里的报亭交互点打开）。
- **声音设计**（rea 的路由/字符串候选里列出 71 个 `sounds/...mp3`）：环境层（风、蟋蟀、湖浪、篝火）、交互层（纸张、开关、点击）、载具层（引擎怠速、碎石路、悬挂吱呀、喇叭）、奖励层（钱、钟、欢呼）。另有全局静音（`Howler.mute` 4 处、`mute` 51 处）。

**对我们有用的**：三态交互点和设备自适应按键图标、开场「局部点亮再展开」、地面上的软提示、外链二次确认、全局静音、按地区分层的环境声。**不借的**：成就、排行榜、圈速赛、多人留言（都是 §9 禁做或需要后端）。

## 2. GTA5（资料 + 推断）

- **小地图/雷达**在左下，随角色朝向旋转，北向用 N 标出，下方是血量护甲条（推断，来自公开截图的常见布局）。驾驶时雷达自动拉远（推断：速度越快看得越远）。
- **地点名**：右下角显示当前区域名（白字），下面一行是街道名；上车时右下角显示车名、厂牌与类别（资料：[Xbox 托管的 GTA V 德语说明书](https://dlassets-ssl.xboxlive.com/public/content/4f0a3089-ba2c-4f3d-9e38-102a41cbd885/GameManual/a923d2fd-bfa3-4774-b4ee-32db40eb3ac6/de-CH/index.html)、[Heads-Up Display — GTA Wiki](https://gta.wiki/w/Heads-Up_Display)）。几秒后淡出（推断）。
- **上下文按键提示**：左上角的帮助框，文字里内嵌按键符号，只在可做某事时出现（推断，本次未找到可核对的资料页）。
- **地图与航点**：暂停菜单（PC 上 Esc）进入地图、统计和设置（资料：[Pause Menu — GTA Wiki](https://gta.wiki/w/Pause_Menu)）；玩家放的航点是紫色，地图和雷达上都画出路线，任务点是黄色（资料：[GPS — GTA wiki](https://thegta.wiki/wiki/gps/)）。本条与上一条的具体细节只按搜索摘要核对，未逐页通读。
- **镜头与切换**：步行环绕镜头，上车后镜头自动回到车尾；上下车是同一个键（F／Y）。我们已经实现了这两点（PRD v1.11、WorldActors）。

**对我们有用的**：小地图在左下（我们已在左下）、地点名「大字区名 + 小字副标题」的两层结构、地图即菜单首页、航点＋小地图标记＋距离、上车时显示车名。**不借的**：任务标记、通缉星、武器轮盘、金钱。

## 3. 原神（资料 + 推断）

- **界面原则**：界面设计负责人在 App Store 访谈中说，界面尽量简化以保留沉浸感，元素放在屏幕边缘、让出视野；原本想完全去掉界面，但玩家仍需要交互（资料：[App Store 故事](https://apps.apple.com/cn/iphone/story/id1576338984?l=en-GB)）。
- **交互提示列表**：可交互物在画面右侧中部列成一列（位置为推断），F 交互、鼠标滚轮在多个目标间切换（资料：[Genshin Wiki 初心者向け情報](https://wikiwiki.jp/genshinwiki/%E5%88%9D%E5%BF%83%E8%80%85%E5%90%91%E3%81%91%E6%83%85%E5%A0%B1)、[Fandom Controls](https://genshin-impact.fandom.com/wiki/Controls)）。**我们借这个**：附近有多个可交互物时列成一列，Q 切换选中项（滚轮已被镜头缩放占用）。
- **区域名展示**：进入新区域时画面上方居中浮现区域名，左右带装饰线，几秒后淡出（推断，本次未找到可核对的资料页）。
- **地图**：大地图上地标用图标加名称标出（推断）。我们不做传送（不在 PRD 范围），只借「地图上的地标图标 + 名称」。
- **引导**：新动作第一次出现时弹一个小提示，用过之后不再出现（推断）。
- **美术渲染**：GDC 2021 Haoyu Cai 的分享「Crafting an Anime-Style Open World」讲美术方向、角色与场景设计和管线，幻灯片里有「Terrain Tint」「Grass-filling」的地形着色与铺草工具（资料：[GDC Vault](https://www.gdcvault.com/play/1027540)）。天空渐变、角色边缘光、风中草叶这几项我**没有找到**官方的具体算法资料（这几次搜索没命中），只能作为视觉参照：天空按高度两段渐变、逆光时角色轮廓有一圈亮边、草和叶子整片按低频风场同向摆动。

**对我们有用的**：边缘化、少即是多的 HUD；多目标交互列表；上方居中的区域名浮现；一次性的引导提示；地图地标图标。渲染方面（边缘光、天空、风）给 render / terrain 会话作建议，不在本会话改。

## 4. morluto/rea：方法论与实际运行记录

### 4.1 方法论（读 `/tmp/rea-src` 的 README 与 `docs/browser-observation.md`）

rea 的核心主张是「看到喜欢的功能，就去拆它，用证据回答它是怎么做的，再在自己的项目里实现并测试」。它的规矩对我们最有借鉴意义的三条：

1. **被动观测**：只附着在已经打开的浏览器上读 DOM、脚本、资源、无障碍树，不驱动页面、不执行目标代码。
2. **每个结论都带证据与局限**：每次输出都有 `evidence_id`、`confidence`（observed / low 等）、`limitations` 与 `completeness`（例如「attach_limited」「policy_filtered」）。没看到的就写没看到，而不是推测补齐。
3. **静态推断与运行观测分开**：`analyze-web-bundle` 只做静态解析，得到的路由/端点都是「候选」（confidence: low），不等于确实可达。

这和我们 TASTE 第 7 节「哪些是实测、哪些没验证」是同一种纪律，本文档的证据等级标注就是照这个写的。

### 4.2 实际运行（2026-10-24 15:14–15:19）

环境：Node v24.22.1（`codex-primary-runtime/dependencies/node/bin`），`npx -y rea-agents@latest` 解析为 **rea-agents 6.7.0**；Chrome 155.0.8059.40 headless，`--headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/rea-chrome --window-size=1920,1080`，打开 https://bruno-simon.com。原始输出在 `/Users/bobby/Desktop/3D-personal-world/evidence/ui/rea/`（仓库外）。

| 命令 | 结果 |
| --- | --- |
| `rea list-browser-targets http://127.0.0.1:9333` | 成功。1 个页面目标 `Bruno's`（https://bruno-simon.com/），排除 10 个非页面目标。首次 npx 下载用了约 85 s。 |
| `rea inspect-web-page … --observation-ms 3000 --format json` | 成功。`completeness.status = policy_filtered`（条件 attach_limited、policy_filtered：附着前已发生的网络请求不完整）。脚本 4 个：入口内联 181 B、`index-ORr3L4no.js` **4,858,321 B**（单包）、`rapier-BmPn8Tpt.js` 229,923 B（模块）、`rapier_wasm3d_bg-0Vyjx73g.wasm` 1,698,487 B。资源：CSS 40,256 B、字体 `Pally-Medium.woff2` 22,604 B、`ui/map.svg` 1,050 B。DOM 2,636 个节点（DIV 457、BUTTON 41、IMG 44）。本地存储 0 B。 |
| `rea analyze-web-bundle … --observation-ms 3000` | 成功，4 个脚本全部解析（AST 节点 1,036,866，0 解析失败）。chunk 边：入口静态 import 主包，主包 **dynamic import** Rapier。端点 1 个：`wss://srv740865.hstgr.cloud:36255`（多人留言服务）。路由候选 72 条，其中 71 条是 `sounds/...mp3`。推断 240 条全部是 low 置信的「endpoint_candidate」（实际是 WebGL 扩展名和对象属性名，如 `honk`、`interactivePoint`、`achievements`、`leaderboard`、`weatherRain`），只能当字符串指纹用。 |
| `rea inspect-web-page … --include-accessibility-text --include-console-text` | 成功。无障碍树里只有根节点名「Bruno's」，**画布世界对读屏器几乎不可见**；控制台 1 条 log。 |
| `rea inspect-web-page … --include-script-sources` | 成功，取回主包源码（5.6 MB JSON），用于上文的类名与实现片段核对（`_InteractivePoints`、`Intro`、`Reveal`、`Zones`、`Respawns`、`Whispers`、`Quality`）。 |
| `rea capture-web-screenshot` | 成功，1920×993 PNG，见 `evidence/ui/rea/bruno-simon-headless.png`。 |

没有跑通或没跑的：`--fetch-source-maps` 没跑（站点未见 sourcemap 引用，不必要）；`observe-web-session`（需要外部人工操作）没跑。网络完整性受「先打开页面再附着」限制，资源列表不含附着前已加载完的 GLB/纹理，因此**首包体积以此表为下限，不是完整首包**。

### 4.3 证据说明了什么

- Bruno 新站把「一切」打进一个 4.9 MB 的主包，只把物理 WASM 拆出去懒加载。我们的 `/world` 已经把 three/物理放进懒加载 chunk、首页不受影响，这一点比他更克制，保持。
- 他只用一个 22 KB 的手写感字体（Pally）就撑起整站气质。我们也只用现站已有的 Instrument Serif（标题）＋ Geist Sans（正文），不新增字体文件。
- 画布世界对读屏器不可见是他的短板。我们的卡片、提示、地名都放在 DOM 里，带 `role`／`aria-live`，这是能做得比参照物更好的地方。

## 5. 我们的现状（读 `wt/ui` 代码，基线 `8ac1a76`）

- 顶部左上角标题、右上角「地图与设置 Esc」；左下 150×122 小地图＋一行区名；底部常驻两行操作说明；靠近车时底部中间一个「E · 上车」黑框；靠近可交互物时只有一个占位「E · 标签」；卡片（`store.card`）还没有任何界面。
- Esc 菜单：大地图、光照、画质、语言、致谢（仅 CMU）。
- 字体：`world.astro` 只加载了 Geist Regular，`world.css` 用 `Geist, system-ui`。

## 6. 设计决定与理由

| 决定 | 理由 |
| --- | --- |
| 按键提示放在画面中下偏右的「提示列」，多目标时列成一列、Q 切换 | 原神式列表最适合我们这种同一位置可能有两三个物件（书桌、书堆、奖杯架挨着）的营地；Bruno 式世界内标签要每个物件建几何，归各区会话，屏幕列表由我统一做。滚轮已用于镜头缩放，所以用 Q（键盘）和手柄十字键上下切换。 |
| 按键图标随输入设备切换（键盘 E / 手柄 Y） | 照 Bruno 的 `setKeyIcon`。WorldActors 已用手柄 Y（button 3）交互。 |
| 地名：上方居中浮现，大字区名＋小字副题（营地 / About 等现站栏目名），3.2 s 后淡出；同一区 20 s 内不重复 | 原神的位置与 GTA 的两层结构合并；副题直接用现站 `UI.sections` 的栏目名（关于我 / 实习经历 / 项目经历），既是事实源又告诉访客这片区域对应简历哪一部分。 |
| 首次进入引导：屏幕底部三枚按键胶囊（移动 / 镜头 / 交互），每一枚在真的用过后打勾淡出；全部用过后整组消失，记入 localStorage | 替换现在常驻的两行操作说明（Bobby 说过界面像调试版）。不是任务：没有完成奖励，不阻止任何操作；Esc 菜单里随时可看完整按键表。 |
| 内容卡片：居中纸面卡，衬线标题，事实来自现站数据；E／Esc／点击遮罩或关闭按钮关闭；外链需要再点一次 | §15.3 与 PRD §3.3；外链二次确认同 Bruno 的 Open 区。 |
| 小地图：保留左下；加地标（六楼编号点、六展位、营地火、风车、码头）、玩家朝向箭头、航点 | GTA 雷达的信息量，但不旋转（我们的地图小而简单，北朝上更容易对照大地图）。 |
| 大地图（Esc 首页）：可点击设航点，再点航点取消；小地图边缘出现航点方向与距离；到达 6 m 内自动清除 | GTA 的航点；只是导航，不计分、不奖励、不强制。 |
| Esc 菜单改成两栏：左大地图、右设置／语言／按键表／致谢 | GTA 暂停菜单「地图即首页」。 |
| 致谢：CMU（必需署名）；100STYLE（CC BY 4.0，§15.4 要求在用到时署名）只在 THIRD_PARTY.md 实际登记使用后加入 | 目前 `THIRD_PARTY.md` 写的是「Allowed, not downloaded this round」，未使用就不署名，避免虚假致谢；character 会话登记后由主线程合并时加一行即可（数据结构已留好）。 |
| **声音本轮不做** | 1) 还没有选定、核验并登记任何 CC0 声音；2) PRD §3.3 的 DJC 展位要控制「整个世界的背景音乐」，声音层应和它一起设计（park 会话）；3) 默认有声会打扰在办公室打开的访客。建议下一轮：CC0 环境三层（风、海浪、篝火）＋两声 UI（卡片开/关），默认静音、首次点击后可开，Esc 菜单与 M 键切换，照 Bruno 的 `Howler.mute` 做法。 |
| 不做成就、收集计数、计时、排行榜、多人留言 | PRD §9、§15.3。 |

## 7. 采纳清单

| # | 借鉴了什么（来源） | 落在哪个文件 | 由谁做 |
| --- | --- | --- | --- |
| 1 | 靠近才出现的按键提示，设备自适应 E / Y，多目标列表 Q 切换（Bruno `_InteractivePoints`、原神 F 列表） | `src/components/world/WorldCards.tsx`、`world.css` | ui（本会话） |
| 2 | 内容卡片：居中纸面、一键关、外链二次确认（Bruno Project Open 区、原神阅读物） | `WorldCards.tsx`、`WorldCardContent.tsx`（新）、`world.css`、`types.ts`、`world.astro` | ui |
| 3 | 地点名浮现：大字区名＋栏目副题，几秒淡出（GTA 区域/街道两层、原神上方居中） | `WorldHud.tsx`（新）、`world-i18n.ts` | ui |
| 4 | 首次进入引导，用过即淡出（原神一次性提示），替换常驻操作说明 | `WorldHud.tsx`、`WorldApp.tsx` HUD 部分 | ui |
| 5 | 小地图地标、朝向、航点方向与距离（GTA 雷达） | `WorldMap.tsx`（新，从 WorldApp 拆出）、`store.ts`（`waypoint` 纯界面字段） | ui |
| 6 | Esc 菜单：地图即首页、点击设航点、设置、语言、按键表、致谢（GTA 暂停菜单） | `WorldApp.tsx` 菜单部分、`WorldMap.tsx`、`world-i18n.ts` | ui |
| 7 | 上车时右下显示车名（GTA） | `WorldApp.tsx` 底部速度表（已有车名，保留） | ui |
| 8 | 开场「局部点亮再展开」（Bruno Reveal） | 建议：加载完成后镜头从营地近景拉到默认中档，配合地形分块淡入 | render ＋ character（镜头在 WorldActors，需主线程点名） |
| 9 | 撞击声随速度变化、环境声分层、全局静音（Bruno Sounds） | 建议：CC0 素材登记到 `THIRD_PARTY.md`，`WorldAudio.ts`（新），Esc 菜单加静音开关 | 下一轮 ui ＋ park（DJC 背景音乐） |
| 10 | 世界内地面软提示：可交互物脚下一圈淡淡的光环，靠近时加亮（Bruno Area floorBorder） | 建议：各区可交互物旁边加一个共享的 `InteractRing` 贴片（不投影、发光材质）；我可以提供组件，挂载由各区决定 | 各区（camp / town / park）＋ ui 提供组件 |
| 11 | 角色逆光边缘光、按高度两段的天空渐变（原神视觉参照） | 建议：G24 材质加 Fresnel 边缘项（不超过 Art Lock 哑光约束），天空沿用 Art Lock 地平线→天顶色 | character、render |
| 12 | 整片同向的低频风场（原神视觉参照） | 已有 `WorldWind.ts`；建议草与树冠共用同一风相位，避免各摆各的 | terrain、street |
| 13 | 画布外的可读性：卡片、提示、地名都在 DOM 里并带 aria（rea 观测到 Bruno 站无障碍树几乎为空） | `WorldCards.tsx`、`WorldHud.tsx` | ui |
| 14 | 拆包：three/物理继续懒加载，主包不新增依赖、不新增字体（rea：Bruno 4.9 MB 单包） | 全部 ui 文件 | ui；render 会话持续核对首包 |

不采纳：成就、排行榜、圈速赛、多人留言、天气系统、传送锚点、任务标记（PRD §9 / §15.3 或无后端）。

## 8. 给各区会话的接入说明（ui 已实现）

- 可交互物：照旧用 `useInteractable({ id, position, radius, label: { en, zh }, kind, onInteract })`。附近有多个时 ui 自动列成列表，Q 切换，E 只触发高亮的一项。`label` 写「物件 · 内容」，如 `书桌 · 教育`。
- 打开卡片：`onInteract` 里 `useWorldStore.setState({ card: { kind, id, page? } })`。
  - `experience`：`id` = EXPERIENCES 的 `startDate`（如 `2026-09-24`）。
  - `project`：`id` = 项目 slug。Interactive Learning 的黑板把页码存在物件自己身上，每次按 E `page++` 再打开卡片（卡片打开时 E 先关卡片，所以是「关→翻→开」）；页数来自项目 MDX 的课程表（现为 4 页），取模循环，卡片内 ←/→ 也能翻。示例见 `WorldUiTest.tsx`。
  - `about`：`identity` / `education` / `awards` / `languages` / `skills` / `interests`。
  - `note`：先 `registerNote(id, { title, body })`（`WorldCardContent.tsx`），只放界面用语或现站事实。
- 不认识的 id 不会留下空卡片（自动关闭）。离开 3.2 m 自动关闭。
- 自测：`/world/?qa=1&uitest=1` 会在营地火堆北侧挂 6 个测试物；普通入口不加载。
- 航点：`store.waypoint`（[x, z]）。不附带奖励、不计分，到达 6 m 自动清除。
