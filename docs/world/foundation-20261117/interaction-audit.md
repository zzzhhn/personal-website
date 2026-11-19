# 城岛交互清点与回归

入口基线为 `dc8d8d4fd97fac7bf3d21e0dd4202938f303acbc`。下面按 `WorldInteract` 的生产注册调用及其场景挂载条件清点。目标离开范围、换楼层、被挡住或尚未满足玩法条件时，该注册可以存在但不会进入 HUD。工厂、货场、山岛、矿场和园区有不同的挂载或状态条件，因此一次 `?qa=1` 的 `__worldInteract.list()` 只代表当时的场景。

## 输入与站位

键盘 E 和标准手柄 Y 取同一条 HUD 选择。Q 和手柄十字键上下轮换已发布的候选。点击过山车主操作和货场标有 E／Y 的主操作时，面板把所显示的原始选项提交给角色控制器，也经过注册、文案、距离、视线和区域状态的当下检查。货场签认、选槽、辅助操作和工厂工序按钮提交各自的显式选项。

普通信息牌、座位和简单机关沿用直接激活。通用取用在发现阶段确认站位，激活重新检查现场条件，走近期间每步核对路线和原目标。物件锚点或把手移动超过 15 cm、动作易主、路线堵塞或离地时，旧请求中止并给出提示。玩家主动改向也可中止，原来的持键方向仍可用于一次连贯的走近。走近结束才把动作交给所属场景，场景自己的动画和落地结果仍由该场景负责。可翻越预告只在没有物件或车辆操作时显示。

## 已核对的注册入口

| 区域及注册 ID | 准入与站位 | 成功状态、退出和重试 |
| --- | --- | --- |
| 营地 `camp-about-{tent,desk,trophy,flags,tools,guitar,dumbbell,wok,suitcase}` | 在展品读牌范围内，有视线。吉他、哑铃、行李箱读牌随实物位置更新 | 打开对应内容卡，题名、课程或兴趣分页面仍可翻阅。E、Esc、关闭按钮或走远关闭。 |
| 营地 `camp-bench-{i}-{a,b}`。街区 `street-bench-{i}`、`street-shelter-seat` | 从座椅的可达侧进入。座椅表面继续是物理支撑 | 进入 `seat`。E、移步或跳跃起身。起身查找可让胶囊落脚的位置。 |
| 营地 `camp-prop-journal`、`camp-prop-tool-{i}`、`camp-prop-dumbbell-{i}[-lower]`、`camp-prop-suitcase` | 取用要有手部所有权和落脚位置。工具按挂架的单件位置，哑铃和箱子按当前实体位置。日记在桌边落脚 | 读／翻／合上日记，取／退回工具，举／放下哑铃，拉／放开箱柄。阶段改名后旧选项失效。离开、区域卸载或恢复时清理。 |
| 城镇 `town-board-{slot}`。园区 `park-project-{hut}` | 站到经历板或有项目内容的展牌前。园区入口总览牌是实体可读文字 | 打开经历／项目卡。关闭后可重新打开。 |
| 园区 `park-P13-evalforge`、`park-P14-djc`、`park-P15-hepai`、`park-P16-accompany`、`park-P18-interactive-learning` | 展品前的独立锚点，有视线。P13、P15、P18 的一次性播放状态控制提示 | 播放并计票、标记 Club、重新排一张唱片、坐下听对话、翻课程板。离座或关闭卡恢复。等播放结束可再触发。P17 是展品配套物。 |
| Club `djc-daybed-{bed}-{side}`、`djc-club-{dance,decks,project}` | 日床要求实际可达。舞池、DJ 台和项目牌各有范围。DJ／舞蹈拥有输入语境 | 入座、舞蹈、接管唱机或打开卡片。舞蹈可移步、跳跃或 E/Y 离开，DJ 可 E/Y 退出。 |
| 交易厅 `alpha-exchange-{archive,desk,bell,clearing,review,project}`、`alpha-exchange-nudge-{direction}`、`alpha-archive-{entry}` | 档案台、票槽、钟、清算、回廊和四个抽屉各用实体站位。档位只在选择期和区间内启用 | 领票、插票、换档、封单、推进历史、领取回执、复盘和读项目。年份票及铜轨也有现场指针入口。被挡、缺历史数据或阶段已变时保留进度并允许重试。 |
| 矿场 `alpha-mine-tools`、`alpha-mine-{vein}`、`alpha-mine-recovery-{index}`、`alpha-mine-pool-{bay}`、`alpha-mine-dropped`、`alpha-mine-experience` | 工具架和三条矿脉以当前矿态、工具、站位和手部条件开放。恢复台、落地矿石和两个池位另查可用性 | 装／还勘探工具，探测、敲击、拾矿、取回、投池回放、读经历。移动可取消未接触动作。F 暂存矿石，供重试。 |
| 山岛 `alpha-card`、`alpha-{bell,sand,tree,wind,stone,lantern}`、`alpha-lantern-release` | 登山卡一次可领。风档、叠石和灯笼用对应把手或取物站位，点灯时查手占用。持灯后才注册放灯 | 记录路卡、响铃、演示模型、换风档、叠石、取放灯笼。取消触发前保留源状态。 |
| 水车 `alpha-waterwheel-sluice-{0,1,2}`。回音洞 `alpha-cave-miner-lamp`、`alpha-cave-chime-{0,1,2}`、`alpha-cave-mural` | 单独闸柄距离和视线。洞灯查实际岩层路线、手位和站位。壁画还要求到达侧洞末端 | 闸门循环并报告流态。拿／还矿灯，敲铜管触发分段回声，阅读壁画可进入回声返程。移动、失去支撑、遮挡或卸载可取消取灯并回架。 |
| `alpha-ferry-board-{0,1}`、`alpha-cable-board-{0,1}`、`alpha-sled-board-0` | 渡船与缆车分「呼叫」和「登乘」，空程中不接受重复呼叫。雪橇下站仅下车。登乘开始前检查拟合的实体通道 | 正常登车、车内可申请安全退乘或在行程阶段点击跳过，到站后沿真实出口下车。障碍解除后可继续。呼叫没有生成第二辆车。 |
| 货场 `ibd-{manifest,kit,crane,coil-front,coil-rear,turn-front,turn-rear,gallery-front,gallery-rear,parts-a,parts-b,stock-a,stock-b,scale-a,scale-b,load-a,load-b,truck-a,truck-b,dispatch}` | 导览状态、货单阶段、正确楼层和站位共同决定可用动作。两张检验台、两个后库验样台和吊架先找真实可达路线。`stock-room` 是导引区 | 开单、领工具、扫描或观察、移动和翻转、拆箱、逐槽测量、称重、装卸和发货。签认必须显式选结论。拆检主入口经共享选项。已开的检验面板仍即时核对位置和路径，提供归位取消和重试。 |
| 工厂 `factory-{raw,batch,routing,frame,wheels,shell,assembly,test,compare,rework,finish,release}` | 12 个操作点查自己面板前的地面路径和支撑。达到操作位后才能选工序 | E／Y 打开并走到工作位。操作中键盘方向、左摇杆或面板驱动吊具，E／Y 或面板操作手柄。Esc／面板退出、卸载和恢复释放控制。部分工序须先在面板选项中选择。暂停清掉输入。手柄归中放开后重新启用。 |
| 过山车 `intent-workshop-{intake,bell,lookup,plan,debug,rewrite,extract,act}`、`intent-{chest,gate,board}` | 物理工坊交付六件，箱和门才推进。已拿钥匙、已开门后撤下对应提示。列车要开门、站稳并从踏步外侧平台进入 | 接件、分流、澄清、开箱、取钥匙、开门、登车。错误请求退回可重试。E 或 B 请求离车。面板跳过后回站，沿踏步离车。旧的 `intent-{route,press,visitor}` 仍有运行时函数，实际设备树挂载当前工坊。 |

浅滩旧拼石及重置组件、QA 注册器和评审按钮不计作普通入口的独立动作。附近车位的 E／Y 使用车辆入口，坐上、下车和安全返营另有角色状态。Playtest 评审中的交互按钮沿用键盘事件。

## 可复现修复

- 控制器已发布物件或车辆时强行同时满足翻越条件，旧 HUD 仍显示 Space/A。挂载原 HUD 的 React 渲染回归固定这个场景，修复后 E／Y 所指和提示一致。
- 过山车面板在两个物件的候选间重新按距离排序，可能与 E／Y 当前高亮不同。现有面板渲染用例在选择了列车而箱子更近时只显示列车操作。注册换代、打开状态变化或物件移动后，先前的输入不再提交另一个对象或动作。
- 在走向取用站位的途中把原锚点或手部目标移 25 cm，旧实现继续沿已接受的站位走，缺少取消反馈。改动后同一路线立即取消，旧请求提交 0 次，按新目标重试提交 1 次。
- 过山车初次登车路线此前在 `ActorRide.boardingPath` 中缺省。接入 Rapier 检查后，原站位距首阶前缘 26 cm，连无遮挡的站台也会被自己的首阶拦下。真实浏览器的胶囊探针在路程 96.19% 处击中 `coaster-station-surfaces`。把站位按实际踏步前缘、34 cm 胶囊半径及 4 cm 余量向平台外移 12 cm。新站位清掉了首阶误判，临时低障碍仍能阻拦，移走后同一路线恢复。完整台阶、车厢窄位、行车和退乘也有既有场景和乘具回归。
- 工厂原料吊具的已选工序原来忽略左摇杆与 Y。同一工序测试先确认旧实现的吊头不动，修复后左摇杆带动真实控制状态，回中后 Y 在对准的接触点确认。暂停后仍压住的摇杆不会把上一次输入带进恢复帧。
- 从原料台南侧 1 m 用 Y 接受操作时，生产浏览器曾走约 6.6 cm 后误报站位被挡。按实测坐标对实际台前平面跑了两条各 1,001 个起点的 Rapier 采样线，每条有六处球形支撑探针未命中连续表面。探针现在仅在无有效支撑时按同一 XZ 依次提高 1 cm 和 3 cm 重试，仍查同一落脚范围、坡度和整段胶囊空间。前两条线和额外 3,263 个近邻起点改后均零误判，添加实体障碍仍拒绝。
- 园区试听投票、唱片墙、课程板之前播放中依然显示可操作提示，第二次 E 不执行动作但会再次请求统计。提示、起播和统计现在共用同一个可用状态，到播放结束才恢复。

## 浏览器实测与余项

在 Chrome 157.0.8103.79 的 1056 × 700 视口使用生产入口 HTML SHA-256 `903d1c48de724150360c2be1876b50b49532dc7e31ac333841e2e54b87e99725` 跑完全套。普通入口以 Balanced 启动，用 Esc 打开及关闭地图设置。另开浏览器会话跑 `?qa=1`，以 13 个明确记录的定位准备站台和工作位，并用有效存档预置过山车六件工坊任务及钥匙进度。之后使用真实键盘事件、面板按钮及模拟标准手柄。运行累计观察到 138 个实际注册 ID，上表还核对了特定进度才挂载的动作。

| 路线 | 实测结果 |
| --- | --- |
| 渡船大陆站 | 键盘 E 登船，点击跳过，落脚山岛站，W 继续走 1.13 m |
| 缆车下站 | 模拟标准 Y 登乘，点击跳过，落脚上站，W 继续走 1.21 m |
| 雪橇上站 | 键盘 E 登乘，点击跳过，落脚下站，W 继续走 1.32 m |
| 过山车站台 | 点击面板沿台阶登车，E 申请离车，点击跳过，走下车后 W 继续走 1.09 m |
| 回音洞矿灯 | 模拟标准 Y 单次取灯，HUD 切换到挂回提示并显示矿灯已拿 |
| 工厂磁吊 | 从南侧 1 m 模拟标准 Y 接受，角色走到原料台。面板选择底盘料，左摇杆移动磁吊，Y 确认吸取，离开按钮退出 |
| 货场 A 台 | 从 2.07 m 的侧通道先打开外箱，再点主面板进入选槽并取样。合拢后读到 M8，点击归位并离开 |
| 货场 B 台 | 从 2.07 m 的侧通道用 Q／手柄十字键在秤与检验台之间选择。打开检验台后用模拟 Y 取样，合拢后读到 M8，点击归位并离开 |
| 园区 P13、P15、P18 | E 起播一次，运行中再按 E 时没有启动新的播放。结束后提示恢复 |

整套退出码为 0，无页面异常或游戏控制台错误。静态预览的 `/api/events` 记录请求返回了 501，脚本单独记录该响应。

在仓库根目录使用已有的 Playwright 安装运行 [交互回归脚本](../../../tools/world/playtest/foundation-interactions.mjs)。以下默认跑全套，可在端口后追加路线名，例如 `coaster`、`factory` 或 `yard`。

```sh
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interactions.mjs http://127.0.0.1:4343
```

定向用例跑过取用与 HUD、工厂活动、四类乘具适配器、洞口实物及 Rapier、两张与后库货场作业台、渡船踏步、完整过山车走阶、跳过后就绪及退出。原有整套跑测另有 `check:coaster-scene` 的 16 项和 TypeScript 通过。真实手柄、目标机 Safari 及所有区域逐项手感待实玩。

## 过山车踏步中途受阻

旧版本在角色走向第 3 阶时插入一块约 1.2 m 高的 Rapier 箱体，角色仍走进车厢并进入坐下阶段。修复后，每次推进登车、上下阶和离开站台动作时，按这一帧实际根位位移扫完整胶囊。经过台阶时仅略过六块实体踏步和一块门槛的已验证接触面。箱体、门和站房其余实体继续参与检测。受阻保持上一个可达位置和当前脚步。上车途中按 E／B 会先转身，再沿已经走过的路径退出。退路受阻会停住等候。移走障碍后可继续，回到原站位后也可从同一提示重新登车。

在含真实站房、车站轨道和踏步的 Rapier 回归中，上阶途中插入挡路箱体，角色连续 30 帧保持同一位置与脚步。请求退出后保留前方箱体，在退路另加一个箱体，角色也在接触前停住。先移走后方箱体即回原站位。移走前方箱体，从原站台再登车可到行车阶段。随后在下车途中把新箱体放到实际门槛，再按 E 仍停在门槛前，移走后走下台阶并落地。

Chrome `157.0.8103.79` 用普通入口打开世界，另开 QA 会话定位到同一站台并添加、移除一个真实 Rapier 箱体。普通入口 HTML SHA-256 为 `d981bceda1bfa3f8592f3508116f30c66b33f64f6222162e8f32f289c2aea501`。面板点击登车和重试，E 请求退出，跳过按钮和 HUD 状态均走实际游戏输入。上阶受阻、转身退路受阻、下车门槛受阻分别停在世界坐标 X `52.856`、`53.210`、`50.553` m。取消与下车两次都走回原站位，重新获得地面支撑，并出现同一个登车提示。页面异常和游戏控制台错误均为 0，本地 `/api/events` 返回 404。`coaster-obstacle` 需要开发预览提供 QA 放箱体接口。

```sh
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interactions.mjs http://127.0.0.1:4358 coaster-obstacle
```

## 共享输入冲突、取消与覆盖余量

在营地帐篷前，真实 E 与同一物理步的模拟标准手柄 Y 会先开卡又关卡。隔离生产预览上的失败记录在动作后十个物理步读到空卡片。角色现在每步只处理一个共享交互请求。同一步的 E 或面板请求已经入队时，只处理该请求。修复后，帐篷卡在组合输入后保持打开。点击关闭、单独用 Y 重开、再用 E 关闭和重开均通过。

新选择的站位突然无效时，原控制器会给出失败提示，但仍可能提交上一次已接受的动作。定向回归原本提交旧动作一次，修复后提交零次。重新选择可达的新目标则提交一次。另用 Chrome 的 QA 注册夹具移动目标 30 cm，真实角色走近途中收到目标变化提示，旧请求提交零次，Y 重试提交一次。这个夹具属于共享控制器检查，未加入场馆注册清点。

回音洞矿灯使用真实 E 启动靠近、D 改向取消，再在同一洞口用模拟 Y 重试取灯。E 归还后恢复取灯提示。园区 P14 用模拟 Y 得到 Club 的地图标记 `[24, 40]`，P16 用 E 坐下听到第一句，用模拟 Y 起身并恢复落地。新版 Chrome 路线先检查普通入口，再用同一入口的 QA 定位准备场地。页面和游戏错误为 0，本地分析接口的 404 单列。交互定向回归 20 项通过。

[冻结的注册样本](interaction-census.json)保留 138 个实际观察到的 ID。[覆盖清单生成器](../../../tools/world/playtest/foundation-interaction-coverage.mjs)按场馆和 ID 输出键盘、模拟标准手柄和面板的具体已验操作，也可以读取新的成功运行记录。这一批共享入口验证完成时，原样本有 17 个 ID 取得行为凭证，键盘、模拟手柄和面板分别涉及 14、7、9 个 ID。同一 ID 可以有多类证据。

```sh
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interaction-recovery.mjs http://127.0.0.1:4365
node tools/world/playtest/foundation-interaction-coverage.mjs
node tools/world/playtest/foundation-interaction-coverage.mjs --json /path/to/new-successful-run.jsonl
```

## 按动作族复跑

在隔离 Chrome 中先走普通入口，再以 QA 定位寻找各注册点附近能实际落地、也能看到正式提示的站位。启动、翻页、关闭、起身和乘具都用真实键盘、模拟标准手柄或现有面板。每条机器记录保留目标 ID、定位和输入前后状态。座位具体验证起身后仍落在同一层并留在座位旁。

| 场馆或动作族 | 直接核对的结果 |
| --- | --- |
| 城镇经历牌 | 6 块均打开匹配机构和角色的卡片。关闭后原提示恢复。 |
| 园区项目牌 | 5 块打开与各自提示同名的项目卡，关闭后恢复提示。 |
| 营地展项与日志 | 9 个展项的卡片内容及兴趣页均与目标匹配。实体日志 E／Y 翻完三页，合上后重新显示阅读提示。 |
| 营地与街区座位 | 营地 8 个、街区 14 个分别验证准确座位 ID 和起身落地。 |
| 山岛沿线 | 登山卡、铃、沙盘、树绳、风闸、叠石和取灯逐项核对状态。持灯后出现独立的放灯注册，Y 放飞后结束持灯。 |
| 回音洞与水车 | 三支铜管、侧洞壁画和三道闸的输入均产生对应回声、壁画反馈或开度变化。 |
| 山岛反向交通 | 山岛渡口用 E 登船，缆车上站用模拟 Y 登乘。点击跳过后分别在大陆渡口和缆车下站落地，两个出口均可继续按 W 走。缆车上站使用单独记载的登乘站位夹具。两站也实测了呼叫空程、途中重复输入和停靠后恢复登乘提示。 |

低音铜管曾在上一支刚响时继续显示操作提示，按 E 没有反馈。Chrome 实测将问题定位到三支铜管共用的 0.65 秒防重间隔。提示和起响现在共用同一项可用条件。复跑验证间隔内提示退出，间隔后提示恢复，三支铜管各自可启动一次。

[机器证据](interaction-action-evidence.json)还纳入原始矿区工具、低层矿脉、暂存拾回、A 池位、经历牌、货场收货和两处检验台、两枚哑铃及行李箱记录。C11 五件工具的取放记录来自从营地连续步行的浏览器路线，每件验证拿取时停用原墙位碰撞，归还时恢复同一注册。矿区 A 池的回测请求由真实 E 发起，返回数据使用测试夹具。重复的浏览器捕获按原始记录摘要合并，覆盖统计按注册 ID 计数。

原 138 个 ID 中，已有至少一项浏览器行为凭证的从 17 增至 89。条件动作中的放飞纸灯和拾回矿石也已实际挂载并操作，合计观察到 140 个，91 个有行为凭证。键盘覆盖 73 个 ID，模拟标准手柄 46 个，面板 30 个。重复输入同一份原始日志时，生成报告逐字节一致。

```sh
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interaction-families.mjs http://127.0.0.1:4394 town park camp journal seats alpha-stations alpha-exhibits alpha-return
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interaction-families.mjs http://127.0.0.1:4394 alpha-calls
node tools/world/playtest/foundation-interaction-coverage.mjs --json
```

## 交易厅、Club、工厂、矿场和过山车箱门

在同版 Chrome 中先用无参数入口打开游戏和暂停菜单。随后在 QA 页放置角色，等角色与实际表面接触且正式提示出现，再发键盘、模拟标准手柄或面板输入。每项的站位和状态变化已加入[机器证据](interaction-action-evidence.json)。

| 场馆 | 实测行为 |
| --- | --- |
| 交易厅 8 项 | 打开和关闭 Alpha Agent 项目卡。用 E 加载回放曲线，用 Y 取票，再用真实键盘持票连走七段到中央台插票。两个档位各改变 10 份，封单、拉铃推进三段，压印得到含三次选择的回执，用 Y 在楼上拨到第一段复盘。持票步行段之外用了站位夹具。历史回放的网络响应使用固定的 20 日样本。 |
| Club 10 项 | 舞池实际切换舞步并可用 W 离开。DJ 台接管时 W 不移动身体，退出后恢复场景提示。DJC 项目卡正确打开和关闭。其余 7 个圆床座位逐一使用 E 和 Y 入座、起身。 |
| 工厂 11 项 | 打开各自工位，读回工位 ID、面板标题及当时可用选项，点击离开后恢复工位提示。空白工序选项保留在证据中，尚未从原料走完全套生产循环。 |
| 矿场 6 项 | 中层、高层各辨认矿线、敲三次、拾起露出的矿石。B 位实投三种矿石并逐一出现对应曲线。三个回收台各取回对应矿石。连续持矿段用夹具定位，网络响应为固定样本。 |
| 过山车 2 项 | 用存档夹具只恢复六件任务的成绩。E 打开箱盖，随后点按钮拿到钥匙，用 Y 开门。机器证据保留三个保存状态及解锁后的登车指引。 |
| 货场闸门 1 项 | 货场独立场景夹具提供已检、已装的货单。用真实 E 升闸，角色进入扫掠区后闸门停住，退开后升齐，再用真实键盘通过闸口。 |

原圆床退出在 `djc-daybed-1-0`、`djc-daybed-1-1`、`djc-daybed-2-0` 起身后掉到约 1.37 m 的低层。共用座椅退出修复后，三处从相同圆床坡顶入座再用实际键盘或模拟 Y 起身，生产记录落在约 2.58 m，同一层且在各自座位旁。台账同时保存首次失败和修后成功记录。

生产入口 HTML SHA-256 为 `0af3bb234fd035f670bc748c3a47d21cee8d4eef559a2dae000992f57c990a0c`。同一包中，Club、工厂、矿场与箱门通过。交易厅曾在持票步行贴到中央台边时接键后停在距站位约 9 cm 处，未完成插票。随后在同一包从南侧约半米处停稳按 E 可完成整轮。使用模拟左摇杆贴近原桌沿、停稳后分别用 E 和模拟 Y 触发时，两种输入都完成整轮，实测触发距离为 8.34 和 8.22 cm。同一实体几何的 Rapier 回归在原坐标和外侧站位各完成一次接触。交易厅定向套件 40 项通过。两种站位均使用生产锚点和可达条件，偶发失败仍保留原始记录。上述完成的浏览器批次页面和游戏控制台错误为零。

这一批完成后，原 138 个注册中的 127 个取得直接浏览器行为凭证。加入两个曾实测挂载的条件动作，共 129／140。

```sh
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interaction-families.mjs http://127.0.0.1:4389 club club-seats factory exchange-project exchange-round mine-round coaster-locks
WORLD_BROWSER_MODULES=/path/to/playwright/project WORLD_EXCHANGE_DESK_RIM=keyboard node tools/world/playtest/foundation-interaction-families.mjs http://127.0.0.1:4389 exchange-round
WORLD_BROWSER_MODULES=/path/to/playwright/project WORLD_EXCHANGE_DESK_RIM=gamepad node tools/world/playtest/foundation-interaction-families.mjs http://127.0.0.1:4389 exchange-round
node tools/world/playtest/foundation-interaction-coverage.mjs --json
```

## 新货批的 11 项货场实测

Chrome 先打开普通入口，再用公开的货场起点进入新货批。接货单、拿工具两段均用真实键盘走到设备并按 E。后续脚本只定位角色，货单、检验和装载状态均来自本次游戏操作。每条记录带上生产提示、角色落脚及货单反馈。

| ID | 已观察结果 |
| --- | --- |
| `ibd-coil-front`、`ibd-coil-rear` | 分别用 E、模拟 Y 照检，货单记录对应卷材的外侧。后卷在吊开前卷后进行。 |
| `ibd-turn-front`、`ibd-turn-rear` | 分别用模拟 Y、E 开始翻卷，货单显示背面露出。 |
| `ibd-crane` | E 接管吊架，依次按住 ↑、←、↓。每段手柄到位才前进，吊件落稳后后卷开放。 |
| `ibd-gallery-front`、`ibd-gallery-rear` | 角色在高廊站稳，两处身体中心高度均约 5.92 m。分别用模拟 Y、E 观测，货单确认两面证据齐备。 |
| `ibd-scale-a`、`ibd-scale-b` | 分别用 E、模拟 Y 称重，两处都实际显示 2.00 kg。 |
| `ibd-load-a`、`ibd-load-b` | 分别用 E、模拟 Y 装车，货单装载计数由 0／2 到 1／2 再到 2／2。称重后直接测试这两个装载动作，货批仍有开箱检验和最终签认步骤。 |

生产入口 HTML SHA-256 为 `cf005320a9b74cc15d1e7d4949d6523b6ce6b27f55b1ea8c7a8f13432b0027d3`。11 项均通过，页面和游戏控制台错误为零。静态服务上的统计请求返回 501。

冻结的 138 个注册全部取得浏览器行为凭证。连同两项后来实测挂载的条件动作，共 140／140。键盘 109 个 ID、模拟标准手柄 75 个、面板 44 个。另有 12 个已知条件 ID 和交易厅目录生成的年份票尚需实测。原始记录中的站位、测试响应、工位只开关面板等范围仍适用。实物手柄与目标机 Safari 仍待实测。

```sh
WORLD_BROWSER_MODULES=/path/to/playwright/project node tools/world/playtest/foundation-interaction-yard.mjs http://127.0.0.1:4390
node tools/world/playtest/foundation-interaction-coverage.mjs --json
```
