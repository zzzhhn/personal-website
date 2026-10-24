# nature quality-v2：root cause、预算、节点/风动接口契约（先行版）

2026-10-21，nature 会话（group/opus55-fast）。本文件给主会话和 runtime worker 读。
接口如有变化，以本文件最新版和 `src/components/world/WorldNatureMotion.tsx` 头注释为准。

## 1. 上一版（c507506）真正的 root cause

1. **叶团 = 同一个 80 三角 icosphere 加低频 sin 鼓包**。8 件资产共用一种"高尔夫球"体素，没有叶片，也没有边缘碎度，剪影全是凸的。三棵树只差团的排布。
2. **把旧估算 ≤900/≤300/≤100 当成了隐性上限**。我按"相对旧估 0.3–0.8×"汇报，等于主动压低面数。最近游戏机位（zoom0：距离 12 m、fov 40）下，单棵树约占 1080p 画面高度的 40%，这个密度远远不够。
3. **树干是一根 8 边直棱柱，枝是 3 段短棍埋进团里**。没有根部扩张，没有分叉层级，团和团之间看不到枝，读成棒棒糖。
4. **灌木是 1–2 个球、单一色阶**，没有叶层次。
5. **岩石是约 25 点的凸包**，没有凹口、断面或倒角，三块是同一族扁拱。
6. **看图方式错误**：六视图每格 300 px，正交远景，从来没在游戏机位、1080p 下看过。机器 QA 通过被当成了"可以交"。
7. **没有风动数据**：GLB 里没有任何权重属性，runtime 无从做分层风动。
8. **没有碰撞描述**：灌木和石块的碰撞由 runtime 决定，但我没有提供贴形的 collider 数据。帐篷碰撞不属于本组。

## 2. 新预算（本组声明，非继承；按最近机位可见形体定）

| ID | 目标三角 | draw call（primitive） | 理由 |
| --- | --- | --- | --- |
| G16/G17/G18 | 各 4k–7k | 4（trunk 1 + crown 三阶 3） | 分枝 skin 连续木体约 0.6–1.2k；每团有核体加 80–150 片可辨叶（每片 4 三角） |
| G19 | 1.2k–2.5k | ≤3 | 多层叶：内深外浅 |
| G20 | 2k–3.5k | ≤3 | 两团加叶层 |
| G21/G22/G23 | 约 600 / 400 / 250 | 2 | 断面、凹台阶、单段倒角 |

- 营地当前约 4 棵树、25 件灌木和石块实例。估算本组同屏约 45–60k 三角、约 25 次 instanced draw，远低于全场 500k/300 calls。
- 相对旧版的倍率预计约 8–15×，最终以实测报告为准。
- 不使用全局均匀细分。唯一的细分是 skin 修改器后的 subsurf 1 级，只作用于木体，用来把 4 边截面变成 8 边。

## 3. GLB 节点契约（Draco，+Y 上、+X 前，根在水平包围盒中心、底 y=0）

| 资产 | 节点 | 材质 | `_WIND` 属性 |
| --- | --- | --- | --- |
| 树 G16–G18 | 根 `G1x`（空节点，extras 见下）→ `trunk`（Mesh）+ `crown`（Mesh） | trunk：`wood_trunk`；crown：`foliage_dark/mid/light` | 两者都有 |
| 灌木 G19/G20 | 根 `G19`/`G20` → `crown`（Mesh） | foliage 若干阶 | 有 |
| 石 G21–G23 | 根 `G2x` → `rock`（Mesh） | `stone_base`、`stone_top` | **无**，石头不晃 |

- foliage 材质 `doubleSided=true`，因为叶片是单面薄片。roughness 0.9，metallic 0，无发光。
- 根节点 extras 进入 three 的 `userData`，包含 `assetId`、`kind`，以及 `collider`（JSON 字符串）：
  - 树：`{"type":"cylinder","radius":0.35,"halfHeight":1.4,"center":[0,1.4,0]}`，等同旧 0.7×2.8 占位。
  - 灌木：`{"type":"cylinder",...}`，贴叶团的核体，不含外层飘叶。
  - 石：`{"type":"convexHull","points":[[x,y,z],...]}`（≤32 点，GLB 局部坐标），外加一个 `cuboid` 兜底。
  - 是否启用碰撞由 runtime 决定。灌木碰撞我建议做成"可穿过的减速"或干脆不做，这属于手感决定，由主会话和 Fable 定。

### `_WIND`（glTF 自定义属性 `_WIND`，VEC4 float，three 读入后名为 `_wind`）

逐顶点：

| 分量 | 含义 | 取值规则 |
| --- | --- | --- |
| x | **bend**，整树低频弯曲权重 | 地面 0，到树顶 1，按 (h/H)^2 曲线；基部锁死，参照 GPU Gems 2 ch1 "根 0 顶 1" |
| y | **branch**，枝摆权重 | 主干 0；沿每根枝从分叉点 0 升到枝端 1；叶团核体和其上的叶片继承所挂枝端的值，整团随枝刚性移动 |
| z | **leaf**，叶片 flutter 权重 | 木体和团核体为 0；每片叶的叶柄端 0、叶尖 1 |
| w | **phase / branch group** | 每个枝组（一根一级枝及其上所有东西）一个常量，取值 (groupIndex + 0.5)/8；主干组为 0 |

- 已实测：Blender 4.2 的 FLOAT_COLOR 点属性以 `_WIND` 的 VEC4 float 导出，无 sRGB 转换，可用 Draco 压缩（generic 12 bit）。
- 分层响应思路依据 GPU Gems 3 ch6：主干弯、枝摆、叶 flutter 三层，相位按枝组和实例错开。

## 4. `WorldNatureMotion.tsx` 接口（本组提供，runtime 接入）

```ts
import { WorldNatureMotion, attachNatureWind, NatureWindDriver } from './WorldNatureMotion';

// A) 最简接入：包住自然物渲染子树。组件每 0.5 s 扫描子树，给带 _wind 的新 Mesh/InstancedMesh 接线，
//    自带时钟驱动，卸载时还原。
<WorldNatureMotion>{/* G16–G20 的 InstancedAsset */}</WorldNatureMotion>

// B) 精确接入：在 InstancedPart 的 layout effect 里
const detach = attachNatureWind(mesh); // 对无 _wind 的 mesh 返回 no-op
// 场景里另挂一次 <NatureWindDriver />
```

`attachNatureWind(mesh)` 做的事：

1. 用缓存的 patched clone 替换 `mesh.material`（同一源材质只 clone 一次），在 begin_vertex 后注入顶点位移。
2. 给 mesh 设置共享 uniform 的 `customDepthMaterial`（RGBADepthPacking）和 `customDistanceMaterial`，阴影同步。
3. 把 `geometry.boundingSphere`/`boundingBox` 按最大振幅扩张，幂等。随后调用 `mesh.computeBoundingSphere()` 时，instanced 包围球也随之扩张，避免视锥误裁。

位移规则：

- 风向是世界 XZ（默认西南来风，跟随黄昏主光方向），在 shader 里转换到局部。
- 实例相位取自 instanceMatrix 平移。
- 三层振幅：bend 约 0.10 m × x，branch 约 0.05 m × y，leaf 约 0.03 m × z，都是低频且异相，不会整树果冻摆。
- 石头没有 `_wind`，不受影响。

时钟：

- `paused` 或 `shot` 时冻结时间，保持当前姿态，不跳变。
- `prefers-reduced-motion: reduce` 时，振幅在约 0.5 s 内渐降到 0 并保持静止；监听媒体查询变化。

## 5. 本组不改的东西

WorldCamp、WorldEnvironment、WorldRuntime、物理与镜头。帐篷碰撞、角色、地面不归本组。

## 6. 交付证据（制作后补齐）

- 每件：source 和 Draco reimport 的 QA（bounds、tris、材质、退化面、流形，以及 contact/embedded 与 welded 的区分）、六视图。
- 游戏机位 1080p 近景渲染：zoom0 和 zoom1 等效机位。
- 风动：Blender 侧用相同公式离线渲两帧对比图。three 侧的实际运行由 runtime 集成后截帧，本组只能离线验证公式。
