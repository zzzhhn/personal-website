# 分层岩壁与近处矿面，2026-10-26

分支 `codex/quarry-layered-bedrock`，从 `3870aef` 建立，工作目录为独立的 `personal-world-phase2-art`。仅修改矿区生成源、原生模型、公共资产和本交接；未改 runtime、HUD、网络、草 shader 或 4341，未推送或部署。

主线已亲自查看最终唯一近景，接受为待浏览器验收的资产候选。未声称达到参考图最终精度；资源受限时不再追加重型任务，浏览器保持关闭。

## 模型变化

岩体取消每片四角向中心收拢的星形扇面。横向层理使用连续折叠坐标，顶面与相邻侧面共用同一顶点变形，再显式三角化供可见模型和碰撞使用。后侧薄唇朝坑内生长，避免前表面反折越过后表面。下层主矿面增加两个浅裂槽，使用穿过相邻 cell 的细采样，未用独立墙皮遮盖原面。

矿带使用共享八点截面、实际终点封口、内埋背面和窄矿物脊；边缘为宿主石色，有不规则宽度、细分支和少量内嵌碎粒。下层细支接近两条真实宿主浅裂。主带沿宿主真实 BVH 投射，遇到无法连续投射的转折仍分开，不声称整面完全贯通。三态动态矿点继续读取本版原生宿主并插值颜色；静态与动态石材保留相同纹理载荷、米制 UV、法线强度和原因子色。

木桥补出纵梁、横枕、落地支柱与接头铁件，板色改为小幅非周期变化。近看的下层承矿石座改为不对称斜脚与分层断口，保留原 `.52 m` 顶面及矿石支撑范围。下层岩脚沿用原块数，局部加入折肩。植被只调整少量簇群与留白；预览从集成目录读取当前 `quarryFloraStyle=3` tuft、宽叶和小花 bank，不以静止预览替代风动验收。

## 通行合同

根据角色线连续 KCC 复现，原卡点 `[-14.2,0,-5.6]` 位于无正式路线的矮凹槽。经主线和角色线同意，封合 raw `x(-14.6,-13.1), z(-9,-3)` 为 `0..2.7 m` 连续实体岩体，并将原 `.95 m` 箱子从 `[-13,0,-5.7]` 移至 `[-3.8,0,-17]` 储物区。

正式西侧低通道 `x[-17,-14.6]`、西坡中心 `x=-11.8`、两条 lowExits、三层矿点、stand、oreRest、工具握点和接触节点保持原合同。新木桥梁枕计入 solid proxies，必须连同最终资产复测。

## 核验记录

首轮候选的 21 项物理／相机／真实工具节点检查全部通过，包含 720 个相机位置。角色线另回报 foundation 与 continuous traversal 共 20／20，通过旧凹槽实体封合、两出口双向、西坡及新桥；该回执仅对应首轮 `colliders=d02ff7ba…`、`layout=b25b0d67…`，不能代替细化后的复测。

两张首轮左右对比记录于 `evidence/layered-comparison.json`，其资产哈希属于历史候选。近景审阅发现主矿带过宽、断口与坡脚过整齐，因此继续了局部细化。首轮集成测试另存 `evidence/layered-first-pass-integration-qa.json`，最终集成回执为 `evidence/layered-integration-qa.json`。

最终仅导出一张 `references/quarry-v4-fracture-detail.png`，相机眼高 1.55 m，960 × 760。作者已实际查看；原生、重开与最终 GLB 均无退化面、坏绕序或 `Mesh.validate` 修复，包围盒往返偏差为 19.07 微米。独立岩体与矿带均无开放边／非流形边；24 颗边缘碎粒计入原 stone 批次。

| 最终资产 | 统计 | SHA-256 |
| --- | --- | --- |
| quarry-static.glb | 76,856 三角形，6 批次，2,301,720 bytes | `61b22e1fd5cc1572df088946dfbf366fe3ca14fc39166e4cf3e23858b0aea10d` |
| veins.glb | 4,428 三角形，1,077,004 bytes | `ebcc25eb7bf2f1a32a22b359c4f341b191db09213963a2ff884df8fae5ce43b3` |
| colliders.json | 4,829 surface／16,201 solid 三角形 | `1316cedc6b207d7458f8bb5b5ae114e829f4555e1ee3b75f644d4cfcff86572e` |
| layout.json | 最终 manifest | `5ac05059833ca8fd4b547a2326e217e0898d3e911d63df252fb8dd3cc9afc4df` |

静态三角形较 `3870aef` 增加约 9.0%，低于约定的 20% 上限。石材两张 PNG 载荷在静态／动态 GLB 中逐字节相同，法线 scale 均为 0.4。九个状态接触点到实际表面的最大距离约 0.04955 mm。

最终同版纯 Python 检查覆盖 128 个组件，拓扑和路线支撑失败均为零。集成目录 `f99ab3d377bc218ff0902c81c4e40fd1d1f5b6ba` 显式加载上述最终资产执行 physics、camera 和 guide-mine，21／21 通过，零跳过，包含 720 个实际矿区相机位置。

角色线按原断言完成最终 foundation／continuous traversal 20／20，零失败、零跳过。两出口双向、核心／外围西坡、箱东侧及正式西通道均通过；旧夹槽为 `spawn-overlaps-solid`，即原点已封实，不能表述为“从夹槽成功走出”。角色报告提交为 `19cfbb9`，路径 `docs/world/phase-2-playground/quarry-detail-final-dynamic-qa-20261026.md`，测试代码 `92fbc0d`。作者已读取该报告及原始日志，核对其三个资产哈希均与本版一致；摘要回执固化在 `evidence/layered-dynamic-qa.json`。这 20 项与前述 21 项保留独立证据，不称为额外浏览器验收。

## 复现

先运行资源预检并获得 `/tmp/bobby-world-phase2-heavy.lock`，仅使用一个 Blender 后台进程、两线程。设置 `QUARRY_FLORA_SOURCE_ROOT` 为包含当前 runtime 植物 bank 的集成目录，执行 `tools/world/alpha-mine/refine.py -- detail`。该入口重建静态与动态、保存重开原生模型、独立导入最终 GLB，并只渲染一张 1.55 m 眼高近景；静态预算限定为 `70513 × 1.2` 三角形以内、6 材质批次。

`qa_layout.py` 为纯 Python 拓扑和支撑采样，不能代替连续角色动态测试。主线 runtime 测试应显式以 `ALPHA_MINE_TEST_ASSETS` 和 `ALPHA_MINE_ASSET_DIR` 指向本分支公共资产目录，使用仓库 `tools/world/alpha-mine-tests/register.mjs` 解析扩展名省略的 TS 导入。

预览为精确 GLB、临时平地／灯光／水面及当前植物静止姿态。实际岛屿光照、浏览器视觉、风与踩踏、持续性能及用户审美接受仍由主线试玩确认。
