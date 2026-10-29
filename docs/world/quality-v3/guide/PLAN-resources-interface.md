# G24 v3 返修：动作资源选择与接口计划（2026-10-22）

范围：G24 资产与 `tools/world/guide`，以及 `WorldGuide.tsx`、`WorldGuidePhase.ts`、`WorldGuideStop.ts`、`WorldGuideEvidence.ts`。`WorldActors` 由主线程负责。基线是 `73aa0bb6…`：1,978 三角、18 骨、5 段 clip。

## 1. 资源调查（2026-10-22 实际访问）

| 资源 | 内容 | 许可证（原文核实） | 结论 |
| --- | --- | --- | --- |
| CMU Graphics Lab Motion Capture Database（mocap.cs.cmu.edu） | 光学动捕；subject 16 有 walk、run/jog、forward jump、jump，ASF/AMC 格式，120 fps | 首页："free for all uses"。FAQ：可用于商业产品，但"不得直接转售数据，即使是转换后的形式"；希望致谢 "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." | **主源**。网站里免费分发重定向后的动画不属于"转售"；README 和 manifest 会写上致谢。 |
| Quaternius Universal Animation Library（标准免费版，GitHub 镜像 `J-Ponzo/gltf-universal-animation-library` @e24c23c，2025-06-10） | glTF + Rigify DEF 骨架；有 `Walk_Loop`、`Jog_Fwd_Loop`、`Sprint_Loop`、`Jump_Start/Loop/Land` | LICENSE 文件是 CC0 1.0 | **次源**：只用作游戏状态机分段（起跳/空中/落地）的时序参考和对照。它是制作方编排的动画，不是动捕测量。 |
| 100STYLE（Zenodo 8127870，DOI 10.1145/3522618） | 100 种风格的行走/跑步 BVH | CC BY 4.0 | 可以用（需署名），但约 1.5 GB，本轮不下载，只作备选。 |
| Ubisoft LAFAN1 | 动捕 BVH | CC BY-NC-ND 4.0 | **排除**：禁止商用，也禁止演绎。 |
| Bandai Namco Research Motiondataset | 风格动捕 | CC BY-NC 4.0 | **排除**：禁止商用。 |
| Mixamo | 动画加自动绑骨 | Adobe 服务条款；免费不等于开源，原始动画不能单独再分发 | **排除**，和 ART-LOCK v3.2「不冒称 Mixamo」一致。 |

下载的原始文件及 SHA-256 记录在 `/tmp/g24ref/hashes.txt`。原始 AMC 不进仓库（避免"直接再分发数据"），只提交派生动画和来源清单。

### CMU 16 实测（自写 ASF/AMC 正向运动学，单位按 CMU FAQ 的 0.45 × 2.54/100 换算成米）

| take | 类型 | 根速度中位数 | 步周期 | 步幅 | 膝屈最大 | 腿长（髋关节到踝） |
| --- | --- | --- | --- | --- | --- | --- |
| 16_15 | walk | 1.07 m/s | 0.86 s | 0.92 m | 70° | 0.836 m |
| 16_55 | run | 3.27 m/s | 0.48 s | 1.57 m | 107° | 同上 |
| 16_35/36 | run/jog | 2.7–2.8 m/s | 0.74 s | — | 91–104° | 同上 |
| 16_05/06/07 | forward jump | — | — | — | 71–84° | 同上 |

接触检测用的是「踝/趾离地 4.5 cm」这一粗口径，duty 只作参考。用于重定向的单步周期会重新挑选，并做逐帧检查。

## 2. 管线（可复现）

1. `tools/world/guide/mocap/`：ASF/AMC 解析与正向运动学（无第三方依赖），以及每个 take 的步周期选择（相邻两次同侧触地）。
2. **按方向重定向，不按原始旋转重定向**：在源姿态里取每段骨骼的世界方向（大腿、小腿、脊柱、上臂、前臂），映射到 G24 的 18 骨。根位移和步幅按 Froude 相似缩放：髋高从 0.96 m 到 0.67 m，时间按 √(L′/L) 缩放。
3. 足部重新求解：沿用现有两骨 IK 和以靴底真实顶点为支点的 `ground_clamp`。站立相锁住接触顶点，脚跟到脚尖滚动换支点。这一步同时修原生 Jump 起跳滑移：起跳蹬地时以趾尖顶点为固定支点，计算踝位置。
4. TABS 比例风格化：头大臂短，所以抑制头部起伏、按臂长缩放摆臂，后摆要避开右髋腰包。以上都标为「作者选择」，不冒称测量结果。
5. 先出正常速度的 animatic（Workbench，侧视加 3/4 视），并和 CMU 源骨架叠放对照；再烘焙、导出 GLB，在新进程回读后跑全部原有门：严格自交、关系表、接触、回读一致性。不加任何豁免。

## 3. 头盔（Bobby：更像圆球，不要多面体）

- 现状：UV 球 20×12，平面着色，约 440 三角。
- 计划：头盔壳提到约 32×20（约 1.2k 三角），只给头盔壳开平滑着色；面罩带和青点的边缘保留硬边（sharp edge 拆分法线）。其余部件保持低多边形平面着色。按 connected-refinement 的原则，面数加在轮廓上，不做全身统一细分。
- 预计总三角约 2.8k，在 ART-LOCK v3 的 4–6k 参考以内。水果项目的 6k 预算不当作这里的硬限。
- 锁定特征保持：奶白圆头盔、石板蓝横带面罩、右侧青点、约 1/3 身高的头。
- 相关嵌入关系按 A6 关系表重测：头盔/领口、面罩/头盔、青点/头盔。

## 4. 速度建议（给主线程 WorldActors）

G24 髋高 0.67 m。按 Froude 数 v²/(g·h) 评估：人的走跑转换在 Fr≈0.5 附近。

| 档 | 建议 | Fr | 说明 |
| --- | --- | --- | --- |
| Walk | **2.0 m/s**（上限 2.2） | 0.61 | 快走。2.7 m/s 时 Fr=1.11，任何走路姿势都会读成竞走或滑行。如果一定要 2.7，应改为「慢跑档」，直接用 Run 片段，不用 Walk。 |
| Run | **6.2 m/s 可承受**（建议 5.6–6.2） | 4.8–5.8 | 冲刺跑：步周期约 0.40 s，单步约 1.2 m，约为腿长的 2.1 倍，和人类冲刺的比例相当。Run 片段会按实际选定速度制作，让 timeScale 约等于 1。 |

## 5. 接口计划（我改 WorldGuide 侧，Actors 侧由主线程实现）

`WorldGuideMotion`（readMotion 返回）新增，全部可选、向后兼容：

```ts
intent?: 'idle' | 'walk' | 'run';      // 来自输入：有无方向键、Shift；不由速度阈值推断
verticalSpeedMps?: number;              // 刚体 linvel.y，用于空中上升/顶点/下落的混合
jumpSeq?: number;                       // 每次真实起跳 +1（setLinvel 那一帧），用于触发 JumpStart
probeGround?: (x: number, z: number, fromY: number) => { y: number; nx: number; ny: number; nz: number } | null;
                                        // 竖直向下射线，排除玩家碰撞体；供脚部贴地和停步 IK 共用
```

- 动画选择改为看 `intent`；没有 intent 时用 `targetSpeedMps` 落在 walk/run 两档中点的哪一侧，不再用 `speedMps > 2.4` 的固定阈值。走跑速度常量改成从 GLB 读出的 `clipDesignSpeedMps`，加上 Actors 传入的值，不在两边硬编码。
- Jump 状态：JumpStart 在 `jumpSeq` 变化时触发；空中按 `verticalSpeedMps` 在上升、顶点、下落之间混合；落地沿用 grounded 上升沿，按落地前的竖直速度选择轻/重 Land。现在物理在按键当帧就起跳（5.7 m/s，约 1.66 m 高、滞空约 1.16 s）。如果主线程愿意加约 80 ms 的下蹲预备，我会提供起跳帧标记；不加也能工作。
- **斜坡脚贴合，需要审阅人确认**：ART-LOCK v3.3 写明停步收脚是唯一允许的运行时 IK，不扩展到斜坡 IK。主线程实测斜坡下坡靴底穿入超过 3 cm。我的建议是给 stopIK 加一个限幅的「站立相贴地」模式：用 `probeGround` 取左右脚地面高度和法线，骨盆下降不超过 5 cm，两骨 IK 腿不拉长，脚掌对齐法线（最多 20°）。只在站立相且坡度不超过 25° 时启用，全部 IK 姿态纳入 A6 运行检查。**需要 Opus/Fable 修订 v3.3 的限制后才能启用**；在那之前只实现、只测试，不默认打开。
