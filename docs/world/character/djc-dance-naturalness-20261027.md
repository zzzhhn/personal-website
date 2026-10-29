# Club 舞步自然度与独立舞客修订

基线 `d5224e3`。本次修改只包含舞步、舞客、局部 helper、说明和独立测试。没有修改 WorldGuide、WorldActors、WorldDjcClub、音频或 store。没有启动浏览器、Blender、build、server，也没有新增动捕下载或提交。以下是几何和时序验证，视觉自然度由主线实际观察决定。

## 问题与改动

旧足底检查漏掉了髋膝形态。原速两循环的实际骨架检查发现：Groove 膝屈 35～98°，膝变化峰值 652°/s；Twist 膝屈 56～104°，骨盆上下幅度 14.6 cm，最低降至 0.446 m。G24 绑定骨盆约 0.63 m。旧 4／2 拍映射在 120 BPM 又分别把动作加速至原速的 1.317／1.367 倍。

原因包括把源演员的绝对髋高度直接缩放到不同角色比例、强制宽脚距后的逐帧下压、几乎共线的捕捉膝 pole 翻向、接触位切换时脚部倾角突变，以及举臂曲线经过 `atan2` 分支后被截断成肩膀跳变。旧测试的穿地与腿长结果不能证明动作自然。

现在保留捕捉的脚步、换重心和上肢变化节奏，用角色比例重建浅屈膝体态。循环滤波包含接缝；髋压缩和前后／左右位移有界；膝盖采用稳定的前向铰链，保留至少 12° 的缓冲屈膝；抬脚与脚倾斜连续离开接触；手臂按解剖方向和肘屈曲线重建，保持 G24 衣袖需要的约 30° 最小外展。不会把源演员的深蹲直接移到小比例角色上。

这已经是**基于真实捕捉曲线的作者约束适配**，不是保真重放原始完整舞蹈。仍只有两个可读模式：小幅前后换重心的 Groove，以及手臂更活跃的 Twist。没有用同一摆手动画变速充数量。

## 动作来源和播放速度

没有新增来源。Groove 仍取 [CMU 60_01，Salsa](https://mocap.cs.cmu.edu/search.php?subjectnumber=60) 的零基 156～314 帧，原始 60 Hz，时长 2.6333 s；Twist 仍取 [CMU 141_12，Dance, Twist](https://mocap.cs.cmu.edu/search.php?subjectnumber=141) 的 244～408 帧，原始 120 Hz，时长 1.3667 s。来源文件和哈希保留在 `tools/world/guide/dance/source/`／`fetch_sources.py`，运行捕捉数据保留在 `guide-data/cmu-club.json`。

[CMU 官方首页](https://mocap.cs.cmu.edu/)表述为 motions “free for all uses”；不将它改称为 CC0 或 MIT。致谢：The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

`CLUB_DANCE_BEATS = [8, 4]` 是明确的半拍编舞映射，不声称原捕捉伴奏就是当前音乐。120 BPM 下两条动作分别为原速的 0.658／0.683 倍。NPC 使用连续本地游标，由真实音频拍差估计速度，并限制在原速 0.55～0.95；曲目切换或 seek 不会直接改写动作相位导致跳姿势。玩家由主线接入 `clubDanceSampleTime`，不由本模块修改玩家控制器。

主线接入点只有一处：WorldGuide 的 dancing 时间分支用 `clubDanceSampleTime(step, beat, clip.duration)` 替代硬编码 4／2 拍。车辆段和移动输入无需本模块改动。已交主线协调。

## 独立舞客和串联

两套 NPC 外观完全替换原玩家网格，只共用骨架，不保留头盔、面罩、背包或玩家夹克：

- 卷发、裸露脸、赭色无袖上衣、橄榄色短裤、露出的小腿和浅色运动鞋，身高比例 0.96。
- 草帽、可见头发和裸露脸、亚麻色短袖、海军蓝长裤、浅色运动鞋，肩身更宽，身高比例 1.03。

它们是本次作者制作的低多边形网格，不是外部人物资产，也不是仅给玩家头盔换色。每位一个蒙皮主材质 draw，不含额外阴影 pass，分别 2,414／1,912 个三角形；服装、肤色、发型／帽子、轮廓与尺寸均不同。实际面部、衣服和连接处仍需浏览器审美检查。

`step` 继续接受 0／1，选择造型和偏好的编排，不再强制 NPC 永久重复一个 clip。每 16 拍切一个作者编排的小乐句，128 拍安排中有两种舞步、两次听歌休息与两次短致意，两位的顺序不同。致意为本次作者制作的 1.9 秒上身 additive 动作，不伪称动捕；头、上臂和前臂有动作，腿和骨盆保持原状态。正常动作以约 0.6～1 秒渐变串联，致意首尾为单位旋转。

暂停、后台、poolInspect、shot 停止更新；48 m 外隐藏并停止，18～48 m 为 15 Hz。无 AudioContext、timer、自有 rAF、矿场或玩家 QA 写入；NPC 已移除对 WorldGuide 模块的依赖。新网格、材质、私有骨架和 mixer 按所有权清理，共享 loader 几何／材质和共享 decoder 保留；effect 开发模式重放会重新挂接私有网格。

## 数值判据和证据

`audit-naturalness.ts` 检查当前压缩 G24＋实际 refined boots，原速 120 Hz 采样两循环。判据包含髋幅度 <3 cm、骨盆高度 >0.59 m、膝屈 10～55°、原速膝变化 <360°/s、138 BPM 映射后膝变化 <250°/s 和关节点速度 <2 m/s。基线测量另存 `baseline-d5224e3.json`。

| 指标 | Groove 修订后 | Twist 修订后 |
| --- | --- | --- |
| 原速骨盆上下幅度 | 0.46 cm | 1.41 cm |
| 原速膝屈范围 | 12.0～44.0° | 15.0～37.2° |
| 原速膝变化峰值 | 324.0°/s | 197.3°/s |
| 138 BPM 下膝变化峰值 | 245.3°/s | 155.0°/s |
| 138 BPM 下关节点速度峰值 | 0.586 m/s | 1.690 m/s |

`WorldGuideDance.test.ts` 继续检查真实靴底、接触、腿长、首尾键和退出 Walk。`WorldClubGuest.test.ts` 使用两套真正的新蒙皮网格及运动鞋检查，未借用不可见玩家靴底：最大穿地 0.060 mm、测量接触间隙 0.192 mm、接触脚踝水平变化峰值 1.73 mm／120 Hz 帧，Idle 鞋底高于地面约 1 mm。128 拍连续编排中，每位实际执行两次致意，最大关节点逐帧位移 14.8／14.5 mm；未出现相位 seek 跳姿势。另检查单 draw、独立网格／服装部件、权重和为 1、私有资源 dispose、共享素材未被修改，以及 18／48 m 和暂停边界。

验证命令：`node_modules/.bin/tsx tools/world/guide/dance/audit-naturalness.ts`、`WorldGuideDance.test.ts`、`WorldClubGuest.test.ts`。相关 TypeScript 检查通过。不宣称已经通过用户对自然度的视觉验收；还须观察新面孔／衣服观感、背面和侧面的髋膝、手臂与服装穿插、真实音乐下的过渡以及玩家实际移动退出。
