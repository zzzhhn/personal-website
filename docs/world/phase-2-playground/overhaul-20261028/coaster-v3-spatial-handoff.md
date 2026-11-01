# 过山车 v3 空间代表样板交接

2026-10-28。本轮已停止模型扩散，交主控冻结候选并做日夜固定机位及真实乘坐比较。已读取 world/AGENTS、校准合同、v3 日夜图，引用检查通过。v3 图是授权范围内的实施参考，**不是审美验收通过**。本轮未开浏览器、Blender、图片服务，未下载、构建、启动服务、提交或推送。

## 当前样板

- 实际园区多边形面积 **26,365.5 m²**，为旧 110×130 m 场地的 **1.844 倍**，向北、东扩展，东侧是真实凹入海湾。IBD 中心、尺寸、入口及西侧海角控制点未改。所有园区边界点在实际海角内，最小退岸距约 **5.24 m**。
- `INTENT_COASTER.center=[50,1,-195]` 是保留的轨道／交互坐标原点，**不要拿它当新测绘中心**。新 `surveyCenter=[72,1,-221]`，`bounds={minX:-5,maxX:149,minZ:-328,maxZ:-114}`，包围盒 154×214 m；前侧额外长度用于主控新工坊。`INTENT_COASTER_FOOTPRINT` 是地图及围栏使用的不规则世界坐标边界。
- 入口 `[50,1.08,-125]`、gate 局部 z=56、宝箱、首尾轨道、六级登车踏步、车门开口及安全下车点保留。新增矿物铺地覆盖工坊局部 x[-27,-5]、z[57,77]；旧三台柜台框架已移除。没有改实体意图状态／HUD／设备／标牌／站点、WorldActors、Guide 或 transition。
- 轨道 **962.741 m**，最高轨面世界 y≈**55.824 m**。首降、驼峰、倒置及北侧弯道扩展，设备楼回旋、灯廊和站台首尾保留。服务塔向北移 48 m、主体高 54 m，后场机房移至局部 `[24,*, -92]`，避免与新首降冲突。
- 一条真实可走坡路从局部 `[16,.08,54]` 连到 `[55,8.08,14]` 观景台，最高步行面世界 y=**9.08 m**，最大坡度 **12.644°**。有斜面碰撞、桥墩、护栏、分层崖面和两座静态灯具。桥墩顶端已退到坡面下，不能只把地图轮廓当作地形变化。
- 主塔、坡路及观景台补光烘入 `nightRadiance`，本线没有新增实时灯，也未修改全局曝光、bloom 或夜间 React 灯接入。正式结构仍为两份合批几何。原有切面岩台和植被用于代表性分组，没有继续填满新区。

## 动量与净空

保留主控连续动量算法及 **70 秒**总时长，无须拉长：新增路线在首降后仍能按当前能量曲线完成。贴地起点约 **33.39 m/s**，采样峰值约 **33.92 m/s**；首降至低位快段最大绝对加速度约 **8.97 m/s²**，原 **12 m/s²**门槛未放宽。低位段速度保持测试通过，没有恢复旧的人为分段刹车。爬升距离增至 137.65 m，第 20 秒速度约 6.41 m/s；因此旧“快段是爬升六倍”的比例断言改为绝对快段超过 30 m/s，动量／加速度断言保留。

扩建造成曲线末端浮点参数略大于 1，现将能量采样末端钳到 1，避免曲线求值崩溃。银行倾斜的切线采样按固定 1.47 m 距离计算，避免路径变长后放大原灯廊段倾斜。倒置支撑改为背向观景镜头的悬臂布置，并检查柱脚对低层轨道的净距。

- 非邻近轨道最小采样间距约 **5.237 m**，座位上方 2.25 m 头部对其它轨道净距约 **3.289 m**。
- 两种第三人称在 **1,600 个等弧长位置**的乘客／目标视线通过最终结构射线检查；第一人称前方两米净空通过。
- **1,200 个位置**的一米乘客包络对实际旋转碰撞盒通过；原先只检查未旋转盒的测试已改为局部 OBB 检查。
- 新坡路的连续可见表面、站立空间、坡度及观景台顶面暖色漫反射检查通过。登车、开门、踏步、G24 座位与退出动画的 7 项原测试通过。

## 最终预算与验证

| 范围 | 静态结构三角形 | 加三节车 | 建筑碰撞描述 |
| --- | ---: | ---: | ---: |
| 近景 | 86,118 | 86,874 | 325 |
| 远景 | 41,102 | 41,858 | 242 |

计数不含主控新工坊、标牌和共享主岛地形；远景描述不会在 inactive 状态挂载。没有新增纹理或依赖。

**41／41 定向测试通过**，TypeScript 检查、差异格式检查通过：

```sh
node --test --test-concurrency=1 src/components/world/attractions/attraction-layout.test.mjs src/components/world/attractions/coaster-track.test.mjs src/components/world/attractions/coaster-art-candidate/art.test.mjs src/components/world/attractions/coaster-landscape-cliffs.test.mjs src/components/world/attractions/coaster-transition.test.mjs
```

## 共享接口与待主控项

主控已报告接入 `attractionCliffCoastHeight(x,z,distance)`，以及 `TERRAIN_GRID_V4.minZ=-360,nz=968`。本线没有编辑 WorldLandform 或 layout-v4。高度 hook 对 IBD／旧南岸返回 null，保留原海岸函数；新海崖外侧 3.5 m 内从 y=1 降至 y=-6。当前海角顶点最大 x=166、最北 z=-340，陆地崖缘在现网格内，水下网格边缘及岸线连续性仍需主控实机查看。

WorldMap 已改用同一不规则 footprint，viewBox 包含扩建海角。激活距离、HUD inside、QA 定位等共享消费者由主控按 `surveyCenter`／`bounds` 检查；不得为了修这些消费者移动保留的坐标原点。

待实机：同机位日夜塔体／海湾／坡路比较；真实行走上观景台与拐角护栏；新工坊到门和登车阶梯的连续动线；高速首降、倒置、灯廊；人物与车厢照明；帧率、显存及生成时阻塞。数值测试不证明美术通过，也不替代 Rapier 实际行走或连续碰撞证明。

## 本线文件

- `src/components/world/attractions/attraction-layout.ts`、对应测试；`src/components/world/WorldMap.tsx`。
- `coaster-track.ts`、`coaster-track.test.mjs`；`coaster-geometry.ts`、`coaster-landscape.ts`。
- 新增 `coaster-landscape-cliffs.ts`、`coaster-landscape-lighting.ts`、`coaster-landscape-cliffs.test.mjs`。
- `coaster-art-candidate/art.test.mjs` 更新为新边界及实际旋转碰撞盒检查。
