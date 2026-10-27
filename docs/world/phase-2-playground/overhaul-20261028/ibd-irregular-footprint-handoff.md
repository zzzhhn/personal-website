# IBD 不规则厂区边界交接

2026-10-28。基于共享 integration 的 `a550432` 之后多人候选工作区。参考仍为已批准的 `visual-calibration-20261027/ibd-yard-v1.png` 及匹配夜景，实施契约检查通过。本次没有改三棚、高廊、货物、19 步操作站点、灯位或灯数；未提交推送、开浏览器、运行服务或构建。

## 具体场地变化

- 西南形成真实的车辆转场前场，铺地最西扩至本地 x=-46；地面转场标线位于新前场，保留维护柜、隔离位、植被和行人接入。
- 东侧两棚之间形成最深约 9 米的排水绿化凹口。该部分确实没有厂区铺地或矩形地板碰撞体，边缘采用平齐排水格栅，没有隐藏围墙。
- 南侧为开放接入区，保留入口 `[−88,1.08,−143]` 与传送落点的安全通路。围栏不会横穿这些接入口。
- 后方边界依据三棚实际屋檐退让。首轮测试发现零件棚右后屋檐超出斜线，已将该段退至屋檐外，最终测试通过。

## 同源关系与实现

`attraction-layout.ts` 的 IBD 段提供 `IBD_FOOTPRINT`、`IBD_BOUNDARY_SEGMENTS` 和 `ibdFootprintDistance`。`IBD_YARD.center` 与入口不变；`size=[92,70]` 仅是以旧原点为中心的粗略包围范围，不能再据此绘制厂区矩形。

实际轮廓本地范围 x=[-46,34]、z=[-29,35]，外接 80×64 米，铺地面积 **4,179.4 m²**。原铺地 68×60=4,080 m²，本次面积增加约 **2.4%**。

铺地先三角化不规则轮廓，再裁成不大于 2 米的局部片面，以保持既有顶点夜间补光精度。顶面只生成一次，删除旧矩形底板与重复顶面；碰撞使用同一组面，焊接重复顶点后并入现有 `walkSurface` Trimesh。高廊原有碰撞壳不变。

围栏沿共享边界生成，实体栏杆、立柱、矮边石使用与可见盒体相同的碰撞参数。开放边不生成围栏碰撞，排水边只生成低于脚部的可见格栅。IBD 的植被避让也使用该轮廓，避免外围仍留下矩形清空区。地图 IBD 分支直接绘制 `IBD_FOOTPRINT` polygon；未改 coaster 分支。

## 本任务文件

- `src/components/world/attractions/attraction-layout.ts`：仅 IBD 段、新 IBD 导出与 IBD 植被避让条件。
- `src/components/world/WorldMap.tsx`：仅 IBD 导入及 footprint 分支。
- `src/components/world/attractions/ibd-yard-site.ts`：裁切铺地、外围、凹口与转场标线。
- `src/components/world/attractions/ibd-yard-architecture.ts`：仅替换地面生成并返回碰撞面。
- `src/components/world/attractions/ibd-yard-geometry.ts`：仅合并地面与原高廊碰撞面。
- `src/components/world/attractions/ibd-yard-geometry.test.mjs`：边界断言从旧矩形改为共享 footprint 范围。
- `src/components/world/attractions/ibd-footprint.test.mjs`：同源、面积、屋檐/站点/入口、海岸及道路退距测试。
- 本交接记录。

共享 WorldMap、attraction-layout 中原有的其他会话修改均保留，不应把整个文件差异算成本任务改动。

## 几何预算

当前静态场景 **29,669 三角形**，仍为一个静态绘制批次；其中铺地碰撞 **3,049 三角形、1,594 焊接顶点**。合并高廊后 walkSurface 共 **3,093 三角形**，固定 Cuboid 碰撞体 **257 个**。没有增加动态灯、纹理、依赖或逐帧更新。

## 检查结果

在主控释放测试资源后串行运行，已结束并释放测试资源：

```sh
node --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/ibd-footprint.test.mjs src/components/world/attractions/ibd-yard-geometry.test.mjs src/components/world/attractions/ibd-yard-guide.test.mjs
```

首轮 15/16 通过，仅屋檐包含检查失败。修正东侧后方一处边界顶点后，单独重跑 footprint 测试 **3/3 通过**。此前碰撞 **7/7**、引导 **6/6** 均通过，包括实际 Rapier 货物路线、入口/传送落点无阻挡、高廊连续通行及真实玩家坡顶回归。

新测试证明：铺地顶面面积与共享 polygon 一致且不重复覆盖；渲染与碰撞三角形位置一致；不存在旧矩形底板；三棚屋檐与全部操作站位保留；外围采样距海岸大于 6 米、实体围栏距既有道路大于 4 米。轮廓顶点距海岸最小约 11.46 米。不是所有新地面都已做真实键盘步行测试。

## 主控待实机检查

1. 正常入口与传送点入场，沿 19 步真实作业链完成首单；特别检查从原地面到裁切铺地及高廊坡口是否有卡边、弹出或落地变化。
2. 普通跟随相机绕西南转场区、东侧凹口和后方维护边走一圈，确认边界用途可读、没有悬空屋檐、隐形阻挡或穿栏。
3. 日夜同机位核对铺地无共面闪纹、排水/绿化退让与地图一致。新转场区最外沿仍依赖既有环境与顶点补光，没有为其新增灯，夜间地面及人物可读性需实际检查。
4. 查看正常地图与小地图，确认 IBD 为共享不规则 polygon，coaster 其他会话候选内容保持原样；实际测试静态 Trimesh 增大后的帧率。

未进行浏览器、GPU、完整类型检查或审美验收。源码与定向碰撞通过不代表用户已认可场地形态。
