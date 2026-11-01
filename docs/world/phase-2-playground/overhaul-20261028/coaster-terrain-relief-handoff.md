# 过山车内场地形代表样板

2026-10-28，第二版。只交付独立源文件及数值验证；主控已完成接入和实际 TrimeshCollider。第一版实机图因「三层蛋糕、规则水平线、绿顶像光滑盖子」未通过，本版据此返工，尚待新运行截图。没有构建、浏览器操作、生成图片、提交或推送。

## 输入与方向

已读共享 AGENTS、`src/components/world/AGENTS.md`、`integrate-design`、visual-calibration README；v3 manifest 的 implementation 检查通过。已实际查看 v3 日景、夜景参考与 `coaster-v3-overview-day-before-refine.png`。本次又查看 `coaster-v3-overview-day-relief.png` 与 `coaster-day-v3.png`，确认失败来自整圈同高、同缩进、同色的规则环带。

参考是授权实施方向，不是当前资产的审美通过。主要借用宽岩台、连续层理和高低层相互遮挡；当前截图的大块空草地缺乏这一层次。

三组地形组成西北至中北的连续脊线：

| 组 | 本地占地大致范围 | 相对原地面高度 | 作用 |
| --- | --- | --- | --- |
| tower-back-ridge | x −51～16，z −122～−87 | 名义 9.2 m，岩脊有起伏 | 主塔后方的长脊，与设备台地加宽衔接 |
| equipment-shelf | x 4～42，z −110～−75 | 支撑核心精确 5 m | 托住设备楼现有 15×13 m 基座，外围改为自然肩坡 |
| inversion-inner-ridge | x 29～57，z −89～−51 | 名义 8.2 m，岩脊有起伏 | 设备台地向倒置内侧延续，给中北部纵深 |

第二版取消八圈等比退台，改为五段不等高斜层理。各岩柱有不同的径向位移和纵向凹槽；顶冠用两层起伏三角坡肩连接，岩壁与坡肩的颜色变化跟随局部岩柱和草斑，不再按整圈着色。设备棚只保留实际基座所需的矩形 5 m 支撑核心，外圈地形通过带孔多边形三角剖分与其相接。

每组均闭合，有实体顶面与埋入地面 0.85 m 的底面。三组彼此搭接；未做布尔并集，接触区域仍保留各自内部面。合并脊线的 248 个垂直射线采样没有裸地断口，最矮鞍部高于原地面 3.506 m。新增 8 簇灌木，共 24 个低矮叶团，各自贴到岩台实际三角面，叶团也进入同源视觉及碰撞网格。

没有新增散石、灯条、实时灯、纹理或依赖。颜色与夜间补光都写入现有合批顶点属性。补光位置对应既有塔侧暖灯、设备基座暖灯及设备青灯，不会增加运行时灯源。

## 文件与接入

- `src/components/world/attractions/coaster-terrain-relief.ts`
- `src/components/world/attractions/coaster-terrain-relief.test.mjs`
- 本交接文件。

接入结构创建函数，放在 `steel.finish()` 之前：

```ts
import { addCoasterTerrainRelief } from './coaster-terrain-relief.ts';
const relief = addCoasterTerrainRelief(steel);
return { steel: steel.finish(), glow: glow.finish(), colliders, art, relief };
```

`relief.vertices` 是 `Float32Array`，`relief.indices` 是 `Uint32Array`，已经是世界坐标。视觉网格与碰撞数组逐顶点、逐三角完全对应。接入现有 fixed body 的示意：

```tsx
<TrimeshCollider args={[geometry.relief.vertices, geometry.relief.indices]} />
```

不要再施加 `INTENT_COASTER.center` 平移，也不要用整体 cuboid 代替。`addCoasterTerrainRelief` 会将带颜色与烘焙光的几何直接放入 `CoasterBatch.parts`，之后 `finish` 按现有规则处置输入；不要额外将这份几何重复 add 或 dispose。独立验证可调用 `createCoasterTerrainRelief()`，调用方负责最终 dispose 其 `geometry`。

## 旧岛石重叠

`coaster-landscape.ts` 中这些旧 island 候选与本样板重叠，主控接入时应跳过整个旧 island 分支，包括其主体、附属散石灌木与粗 cuboid：

```ts
[-44,-86,8,7.5,13]
[24,-92,9,5,10]
[28,-113,10,6,8]
```

`[-43,-65,8,5.6,9]` 不直接重叠本次长脊，可独立判断是否还需要。`[70,-81]` 与 `[84,-57]` 在倒置外侧，本轮没有替换它们。南部岛石、既有设备、坡道、观景台和工坊都没有编辑。

## 证据

本版最终测试前资源预检：memory pressure 2，swap 9.54 GiB，空余磁盘 4.54 GiB。测试串行取得并释放 `/tmp/bobby-world-phase2-heavy.lock`。

```sh
node --experimental-strip-types --test src/components/world/attractions/coaster-terrain-relief.test.mjs
```

8/8 通过，约 0.86 秒：

- 2,562 三角形，包含 480 面灌木，低于 12,000 预算。合入原 steel 后不增加独立材质 draw call。
- 三个实体的每条索引边都有两张方向相反的邻接面、正体积、无退化面；视觉与碰撞三角形严格相同。
- 1,926 个轨道位置，约每 0.5 m，检查轨下、座面、头部到实际三角面的距离。最小值 8.375680 m。
- 1,200 个位置的 chase、comfort、first-person 射线通过；前两种检查镜头到人物与目标，第一人称检查前方 2 m。
- 站台、工坊、全部东南坡路与观景台均无地形交叠；所有新地形顶点都在本地 z ＜ −48。
- 设备基座全范围射线落在精确本地 y=5 的岩台顶面；全部顶冠可射到顶面和地下底面。
- 连接脊线最小高度 3.506 m；夜间顶点补光有限且非负，95% 以上非植被露出岩壁顶点达到测试中的最低数值阈值。草斑和灌木保留自然深色，不以加光拉高整体统计。
- 两组非设备岩脊的上部水平面占比小于 5%，各有超过 25 个不同的 0.1 m 高度分箱；这能约束回退到水平大盖子，但不能自动证明形体好看。

这些是几何、数据和数值证据。夜间数值阈值不代表画面已足够明亮，预算也不代表 FPS 通过。

## 尚待视觉核对与偏离参考

当前只做北部代表地形，前场和整个海岸没有变成参考图的多层崖地；局部灌木密度仍明显低于参考，没有复制参考的大量树木、石纹、小径与建筑入口。地形高度服从既有设备底座和全轨净空，不逐像素复制生成图。主控需在既有冻结机位拍第二版日夜运行图，重点检查断层和纵裂是否真正打破蛋糕形、岩色有没有碎成噪点、坡肩与灌木有没有悬浮，以及夜景面光是否发灰。本版数值测试通过不表示上述视觉问题已通过。
