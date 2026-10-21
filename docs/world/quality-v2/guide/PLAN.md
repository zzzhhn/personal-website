# G24 向导 L1 候选 · 方案与接入接口（2026-10-21，制作前）

本轮由用户拒绝上版角色触发；Fable 与主会话允许 G24 自制 L1 候选（不开 Hy3D）。不是 Mixamo 来源，动作全部由脚本在 Blender 内生成。最多三轮，每轮先看图和短片。

## 参考（已用 view_image 实看）

- 锁定正交四视：`/Users/bobby/WorkBuddy/personal-website/bobby-3d-world/art-lock/round3-lock/guide-ortho.png`
- 候选 B 三视与行走小图：`/Users/bobby/WorkBuddy/personal-website/bobby-3d-world/art-lock/round3/guide-B-helmet-visor.png`
- 文字锁：`/Users/bobby/WorkBuddy/personal-website/bobby-3d-world/art-lock/ART-LOCK-v3-characters.md`

**参考矛盾（请 Fable 定）**：文字锁写「右髋橙色腰包」「右侧青点」，但两张图里正视、侧视、背视三视一致显示腰包和青点在角色**左**侧。默认按文字锁和本轮指令放在右侧（glTF +Z）；若改左侧只需镜像一个参数。

## 尺寸契约（取证）

- 现角色胶囊：`actor-physics.ts` PLAYER_RADIUS 0.34、PLAYER_HALF_HEIGHT 0.48；物理脚底 = 胶囊中心 − 0.82，胶囊高 1.64、直径 0.68。PLAYER_CENTER_HEIGHT 0.88 含 0.06 生成空隙，不用于视觉偏移。
- 锁定正视图像素测量（正视全高 464 px）：头盔 146 px（31%，符合“约三分之一”）、躯干 130、裤 120、靴 58；头盔宽约为高的 1.05 倍。
- 目标全高 **1.72 m**（头盔顶）：靴口 0.21、髋/腰带 0.66、肩 1.10、颈 1.17、头盔底 1.18、头盔直径约 0.56。待机双臂下垂时整体宽约 0.6 m，在胶囊直径内；头盔高出胶囊顶 8 cm。
- 三角预算：声明 3,000–5,000（目标约 4k），依据是头盔圆度、肩/肘/髋/膝变形环、圆靴。没有旧正式资产可作基线；清单旧估算 4–6k。果实/狐狸的预算和通过状态不套用。

## 构造

- 身体：一个连续蒙皮网格（躯干→双臂→无指手、躯干→双腿），关节处加环，分腿清楚；夹克、奶白袖、石板蓝手套、深灰裤按区域分材质。
- 分件刚性部件（合理分件、一热权重）：头盔（含深色颈圈）、面罩、青点 → head；圆靴 → foot（裤脚埋入靴内）；腰包 → pelvis；拉链条 → spine/chest。
- 骨架 18 骨：root、pelvis、spine、chest、neck、head、左右 upperarm/forearm/hand、左右 thigh/shin/foot。每点最多 4 影响，归一化，只在相邻关节间过渡，不串到对侧肢体。保持线性蒙皮（Preserve Volume 关）。
- 材质（无贴图、不透明）：paint 夹克 #4E647D；canvas 奶白袖 #E6DCCB；accent 裤 #3A3F47、靴/手套 #4E647D、腰包 #E8803A；metal 头盔 #E6DCCB（哑光，metallic 0）；glass 面罩（不透明、半哑）；light 青点 #4FD1C5。

## 动作（in-place，24 fps，脚本生成并编辑源保留在 .blend）

| clip | 类型 | 设计速度 | 说明 |
| --- | --- | --- | --- |
| `Idle` | 循环 2.5 s | 0 | 呼吸、轻微重心左右，头部稳定 |
| `Walk` | 循环 | 约 1.5 m/s | 髋高 0.66 m 的短腿，Froude 约束下步行上限约 1.8 m/s；支撑脚以设计速度向后平移，脚底贴地 |
| `Run` | 循环 | 约 4.2 m/s | 现运行时普通 3.5 m/s 已是小跑、Shift 6.7 m/s 是冲刺，都用这段，timeScale = 实际平面速度/设计速度（限制 0.6–1.7），支撑脚不滑 |
| `Jump` | one-shot，末帧是空中姿态 | — | 起跳后 clamp 在末帧，`grounded=false` 期间一直保持，不循环挥手 |
| `Land` | one-shot 0.3 s | — | `grounded` 由 false→true 时播放，然后按速度回 Idle/Walk/Run |

坐下/起身、上下车列为后续，本轮不做。腿用两段解析 IK 对脚踝目标求解后烘焙成逐帧 deform-bone 关键帧；髋部上下起伏和小幅转动、胸反转、手臂与对侧腿反相摆动，幅度克制。

## 预期产物路径

- 运行时最终（Draco）：`public/assets/world/guide/G24.glb`
- 未压缩 skin 证明版：`tools/world/guide/out/G24_uncompressed.glb`（不进 public）；两者哈希各自记录，分别 fresh import 验证。Draco 对动画数据不压缩，若量化破坏 JOINTS/WEIGHTS 或无明显收益，如实报告。
- 源与脚本：`tools/world/guide/`（build / animate / export / QA / render），`tools/world/guide/blend/G24.blend`
- 证据：`docs/world/quality-v2/guide/`（六视图、姿态拼图、正常速度 10 s GLB 回放、qa_report.json、manifest.json、README）

## WorldGuide 接入接口（`src/components/world/WorldGuide.tsx`）

```ts
export interface WorldGuideProps {
  speedMps: number;   // 父组件从 body 实际 linvel 取平面速度（撞墙即 0），100 ms 更新即可；组件内部平滑
  grounded: boolean;  // false 时保持 Jump 末帧空中姿态，false→true 播 Land
  visible: boolean;   // 上车时 false；不渲染也不推进 mixer
  facing: number;     // yaw 弧度，绕 +Y，模型 +X 为前；组件内部以有限转速平滑转向
  fallback?: ReactNode; // GLB 加载中/失败时显示，由父组件传旧灰盒
}
```

- 组件自己读 `useWorldStore` 的 `paused || shot`，暂停时冻结 mixer（与 Physics paused 一致）。
- 组件根节点自行设置 `rotation.y = facing`；父 group **不要再旋转**，避免双重朝向。
- 放置：父 group 在 RigidBody 内，position `[0, -(PLAYER_RADIUS + PLAYER_HALF_HEIGHT), 0]`；模型脚底 local y=0。
- Draco 解码器与营地相同：本地 `/assets/world/draco/`。
- 不改 WorldActors / WorldRuntime / WorldCamp；接入由主会话做。

## 验证（按 rig skill，报告里逐项标 executed_pass / executed_fail / not_tested）

- 原生：真实 armature + Armature modifier + 命名 deform 组；权重非负、和为 1、每点≤4；rest 变形为恒等；米制包围盒。
- 姿态：Idle/Walk/Run/Jump/Land 全帧抽样加应力姿态（深屈膝、臂抬高），检查报告体积变化、非相邻三角穿插候选（BVH 粗筛加三角相交确认）、腿长/骨长恒定。
- 接触：支撑帧靴底采样点高度偏差、穿地，加虚拟根速度 v·t 后的水平漂移；阈值先用 skill 建议值（漂移 ≤1% 身长、支撑高度偏差 ≤0.5% 身高、穿地 ≤0.25% 身高），如实报值；循环首尾位置与速度连续。
- GLB：skill 自带 `inspect_glb_rig.py` 检查未压缩版；另一个 Blender 进程 factory-startup 导入最终 GLB，逐 clip 按秒比对原生与导入的关节位置和变形包围盒（含半帧），比对材质参数。本机没有 Khronos validator，不声称官方验证。
- 图像：从最终 GLB fresh import 渲染的静态六视图、1080p 正常速度 10 s 回放（侧视 + 3/4，各段顺序播放）、关节特写姿态拼图；每轮我先看图/抽帧再决定修改。
- 预告：动作是脚本生成的逐帧 deform 关键帧，不是动画师可用的 IK/FK 控制 rig。

另外：只读评估 C03–C10 是否满足四个 skills，结果写在 `docs/world/quality-v2/guide/C03-C10-skill-review.md`，不改旧产物。
