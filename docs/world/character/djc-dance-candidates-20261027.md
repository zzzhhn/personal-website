# DJC 两种真实动捕适配候选

统合更新：本模块已接入 Club。玩家两种舞步切换、步行退出和实际音频时钟已完成浏览器检查，详见[本轮实现与证据](../phase-2-playground/djc-beach-club/implementation-20261027.md)。下文保留独立模块交接时的边界和测量数据；审美与动作自然度仍待用户体验反馈。

2026-10-27。独立动作模块与离线几何测试完成；尚未通过浏览器背面、侧面和实际切换的视觉验收。没有修改角色 GLB、WorldGuide、WorldActors 或全局 store。

## 来源与风格边界

| Runtime 名称 | 实际来源 | 零基源帧、原速时长 | 当前风格边界 |
| --- | --- | --- | --- |
| ClubGroove | [CMU 60_01](https://mocap.cs.cmu.edu/search.php?subjectnumber=60)，官方标注 salsa dance，60 Hz | 156～314；2.6333 秒 | Salsa 基本步适配；有前后换重心。不是精确的横向 step-touch。 |
| ClubDisco | [CMU 141_12](https://mocap.cs.cmu.edu/search.php?subjectnumber=141)，官方标注 Dance, Twist，120 Hz | 244～408；1.3667 秒 | 有活力的 Twist 适配；不能说原始捕捉是 Disco。 |

精确 step-touch／Disco 编舞需求仍需后续选材或自制。这两条是可接入和试玩的真实动作候选，不把程序摆手当动捕。曾额外检查 CMU 05_11（sideways steps, pirouette），其前段横步后接转身，未纳入运行资产；没有保留这段被拒绝的源文件。

[CMU 官方首页](https://mocap.cs.cmu.edu/)明确授予 motions “free for all uses”。[官方 FAQ](https://mocap.cs.cmu.edu/faqs.php)说明单位换算等数据使用信息。这里记录该官方授权表述，不将其误称为 CC0 或 MIT。保留致谢：The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

原始 ASF／AMC 在 `tools/world/guide/dance/source/`，四文件合计约 2.15 MiB。`fetch_sources.py` 限定这四个 URL、每文件最多 4 MiB，并验证 SHA-256，不爬全库。`prepare.py` 复用现有 `mocap/asf_amc.py` 和 `cmu_motion.py`。运行 JSON 为 `src/components/world/guide-data/cmu-club.json`，约 161 KiB，包含裁切范围、来源链接、哈希、关节位置／旋转及接触掩码。

## 实现与接入

```ts
import { createClubDanceClips } from './WorldGuideDance';
const danceClips = createClubDanceClips(scene);
const animations = [...baseAnimations, ...danceClips];
```

请在角色私有 scene 完成 `refineGuideBoots` 后、创建 AnimationMixer／AnimationActions 前调用。工厂内部克隆骨架，不改变传入 scene、原始 clip、geometry 或角色缓存。输出是独立 `AnimationClip[]`，固定 `ClubGroove`／`ClubDisco`；骨名沿用实际 GLTFLoader 清洗后的名称。只写骨骼 quaternion 和 pelvis 的局部 position，不写 group／root 位移，不创建音频、计时器、Worker 或浏览器对象。

主线需要将这两个名称加入 `LoopRepeat` 集合和动作选择分支。生成的 `clip.userData` 包含现有角色管线可读取的 `frames`、`contactL`／`contactR`、`loop`、`designSpeedMps=0`，以及来源、风格适配、脚底模式和 reach 诊断。不要把 `designSpeedMps=0` 送进步态除速逻辑。

动作裁切、重采样、去掉累计位移和五次端点姿态修正均记录在 JSON。运行时一次性适配当前 G24 比例：测量实际腿长，按捕捉膝盖方向作解析两骨 IK，用当前渲染靴底校准落地，固定测量接触段的脚踝水平位置，并平滑衔接 swing。G24 宽靴要求双脚中心至少 25 cm，脚部倾斜有界；这些是角色适配，不声称属于原始动捕。

世界物理仍归 WorldActors；禁止让跳舞状态关闭 capsule。退出时立即恢复移动输入，动作使用约 0.22 秒淡出。调用者需在舞蹈期间禁用 idle 手势、stop-step 和矿工具／vault 等冲突写入层，不能让自动 Turn／Idle 覆盖舞蹈。地面坡度修正可以读 contact mask，但应确认没有与舞蹈的离线落地重复施加偏移。

舞蹈没有宣称捕捉时对应某首音乐，也没有内置 BPM 或乐句推断。音频时钟、当前曲目 BPM／firstBeatOffset、舞蹈相位及播放率应由 Club 音频服务统一驱动。若给 clip 分配每循环 4 拍，这是后续编舞映射，必须实测节奏与适合的变速范围。

## 轻量验证

执行 `node_modules/.bin/tsx tools/world/guide/dance/WorldGuideDance.test.ts`。测试原生解码当前压缩 G24，应用实际 `refineGuideBoots`，无需 renderer／浏览器／Blender／临时服务器；以 120 Hz 采样真实蒙皮靴底，不仅检查骨头高度。

| 指标 | ClubGroove | ClubDisco |
| --- | --- | --- |
| 最大脚中心半径 | 0.2603 m | 0.2358 m |
| 最大脚底穿地 | 0.84 mm | 0.42 mm |
| 测量接触期间最大脚底间隙 | 1.34 mm | 3.76 mm |
| 接触期间最大脚踝水平位移／120 Hz 帧 | 0.18 mm | 0.87 mm |
| 最大关节点位移／120 Hz 帧 | 16.80 mm | 36.82 mm |
| 最大腿部 reach 误差 | 0 | 0 |

另验证 clip 有限数据、循环首尾键完全一致、腿长不变、工厂不改调用者 scene，以及每条舞步四个非整拍相位淡出到当前 Walk。0.22 秒淡出后 Walk 权重为 1、舞步权重为 0；淡出中最大关节点位移为 40.10 mm／120 Hz 帧。该淡出测试证明 mixer 连续交接，不代替带真实移动、坡地与现有 IK 层的运行验收；未将淡出后的足底接触宣称为已验收。

单文件 TypeScript 检查通过。尚缺浏览器中的背面／侧面感官验收、动作与实际歌曲对齐、移动退出和坡地重入验证；未宣称最终质量。

## 独立场景舞客

`WorldClubDancer.tsx` 提供命名和默认导出 `WorldClubDancer`。参数为 `position: [number, number, number]`（平台脚底原点）、`facing: number`、`step: 0 | 1`、`beat: () => number`（真实音频连续拍数）、`playing: () => boolean`。父组件控制位置和实例数，最多两位；它不是玩家、真人在线用户或独立物理角色。

组件只克隆现有 loader 缓存 G24，应用同一 `refineGuideBoots`、独立舞步和低 draw 合批。`mergeGuideMaterials` 为共享 helper，从玩家模块命名导入，但不实例化 WorldGuide，不调用其 QA、矿场、角色控制或 sockets。每位舞客只有私有 mixer／骨架；卸载清理 mixer、私有骨架、合批材质／geometry 与靴型 geometry，不销毁 loader 共用素材或共享 Draco 服务。

没有新 AudioContext、timer、Worker 或自身 rAF，全部依托 R3F `useFrame`。世界暂停、poolInspect、shot 或浏览器后台时立即停止动画更新；距离相机超过 48 m 时隐藏且停止更新；18～48 m 降为 15 Hz，恢复时从实际音频拍数取样，不追赶漏帧。无音乐时渐变回原 Idle，step 改变也平滑交接。Groove 采用每循环 4 拍、Twist 采用 2 拍，这是明确的编舞映射；相位按固定站位错开，不虚构原始捕捉曲目或节拍信息。

舞客已通过轻量 TypeScript 检查。加载失败由局部 boundary 隐藏；工厂中途失败时也清理已创建的私有资源，因为该路径不会进入 effect 卸载。复核确认 Three 的 SkeletonUtils 克隆使用独立 Skeleton／bones，bone texture 不与 loader 共享；`uncacheRoot` 后动作可以通过 `play()` 重新绑定，符合 React effect 的开发模式重放。现场播放、阴影、距离切换和实际设备的资源表现由主线验证，未运行浏览器或完整构建。
