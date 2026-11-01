# P04共同路灯生成器收口（2026-10-24）

本批先合入含共享street源的928d578，仅读取共同生成器，不编辑WorldStreetAssets/WorldStreetGeometry。P04现从 `WorldParkLamp.ts` 直接import `WorldStreetAssets.lampGeometry`；已删除WorldParkWalk内私有lampGeometry/farLamp实现。

参数：height=2.6m、arm=0、pole=woodMid、base=woodDark、cyanRing=false，近/远都调用共同函数的lod=0/1。实际766/146三角（19.06%），总宽/深0.47m、高2.79m。position/normal/color原样保留；aMat的glow=1映射为park暖光aEmit，删除aMat/aSuv，沿用park合批材质，没有新建光源。地面光斑改到实际arm=0灯头正下方。

碰撞从同一LOD0 Builder.hulls()的base/shaft/cap/head四壳直接生成；每壳11.25kg，总质量45kg；所有9灯共36个convex hull，Rapier读回每根实际mass=45。原0.12半宽的大盒已删除，不再作为P04 fallback。

## 实测通过

- Node重建共享生成器与属性转接：`qa-P04-shared.json`。命令：Node 22.22.2 `--experimental-strip-types tools/world/park/qa-P04.mjs`。
- `qa-P04-runtime.json`，原始 `evidence/park-integration/P04-verified/P04-bot.json`：真实键盘一次冲撞使灯柱倒下；保留真实30秒时钟，清开接触后，等待30.233秒观察到归位、fade=1、sleeping=true。归位点偏差约1.07mm。
- 真实E上van、W撞击使同一灯倒下；车最大向上速度0.0537m/s、最大中心Y=2.488，未弹飞。移开夹具车辆后等待31.493秒观察到第二次归位、fade=1、sleeping=true，质量仍45kg。
- 同源视觉/碰撞抽查：底座、杆身、灯头三处边界偏差约0.002mm、11.27mm、0.003mm；没有沿用旧大盒。三处均有真实Rapier shape cast见证点和视觉ray边界。
- 实际近远实例记录为9根近景、每根766，远景几何146；近/远比例≤30%。完整LOD组行为沿用6763657已过的距离切换与原碰撞保留验证，未重跑六展品整包。
- 最终 `astro-P04-final.log`：0 errors、0 warnings；P04 bot页面/控制台错误0。

## 修正的复位问题

原Knockables在T≥30后仍要求“上一帧fade≤0.001”才复位；正常帧步可能直接跨过这窄窗口，之后又开始淡入，导致倒地物一直留在外面。本批给既有park KnState加单次reset阶段位，跨过30秒时可靠执行一次原位/原朝向/速度清零/休眠，淡入结束后释放阶段位。没有缩短30秒计时，也没有降低倒地阈值。两次真人按键撞击后的完整31秒周期是该修复的运行证据。

首轮有效撞倒但复位超时的旧原始证据保留在 `evidence/park-integration/P04/`；第二轮机器人传送后未等落地便开始冲刺，只发生小幅推移未触发倒地，其失败在 `P04-final/`；最终夹具明确等待grounded再冲刺，未改碰撞或阈值来让bot过。

## 看图与限制

已亲看P04黄昏/夜档、人与车撞击及归位截图（`runtime/P04-*.jpg`）：共同生成器的木杆、基座收腰/套环、顶帽/暖色透镜完整，夜间地面光斑在灯下。近景模型变化来自原用户要求的G10/G11/P04同一生成器换参，而非为了LOD压低近景细度。

本次只覆盖P04及其共用park复位阶段，没有重测全岛峰值、全部展品或持续压在灯位时的占位复位。与6763657的旧P04相比，每根近景增加442、远景增加110三角；9根全近理论增加3978三角，最终总线请主线程在最终同版本峰值集合核对，不能把历史58,125园区数字当当前整区实测。

Bobby最可能的批评是“P04没有真正共用生成器、碰撞还是旧盒”：现在代码直接import共同函数，实际Builder四壳与45kg读回、三处边界抽查、人车撞倒及完整复位共同提供证据。美术判断、机器通过与Bobby试玩接受仍分开。
