# World 质量返工 v2

状态：Bobby 已否定 c507506 营地样片。73aa角色已修复此前d3的身体自交、夹克下摆和靴轮廓；QA动作候选的两档过渡与打断检查通过，2,134个实际混合姿态的分件/连接检查通过。**仍未取得Fable行为与视觉验收，普通入口未开启新的收脚候选。** 几何见`guide/final/a6/`与`runtime-relations-method.md`，动作见`motion-transitions.md`，逐项状态见`completion-audit.md`。旧失败报告保留，不用机器通过代替观感。

## 范围和验收

本轮由 Bobby 的六项实际试玩反馈触发：碰撞、人物、自然资产与地面、自然运动、高清渲染，以及可复现的自动试玩。沿用 `codex/world-greybox` 和 PR #1；不推 main、不合并、不调用 Hy3D，不扩建其他区域的正式资产。其他区纳入通用问题审计。

旧样片契约中“保持旧碰撞体”不能继续适用于已被指出错误的帐篷、灌木和石块。G24 胶囊占位必须替换为符合锁图的人形候选；自制骨架和动作不冒称 Mixamo 产物。冻结文档仍由 Fable 维护。

| 用户问题 | 已确认基线根因 | 本轮动作 | 接受证据 |
| --- | --- | --- | --- |
| 灌木、岩石穿行，帐篷空气墙 | 营地自然散布仅绘制；帐篷保留旧盒子代理 | 同源实例变换；静态岩石/灌木代理；帐篷斜面壳与开放门洞；检查家具和树干 | 叠加代理图、真实按键接近与接触记录、入口进入/侧后墙阻挡，各资产类别逐项记录 |
| 角色轮廓失真 | 玩家视觉仍为胶囊、球和两个鞋块，无骨架动画 | 锁图头盔向导，明确躯干、四肢、鞋、包；idle/walk/run/jump | 六视图、重导入 GLB、权重与动作检查、正常速度的运行视频、实际速度驱动动作 |
| 树/灌木/岩粗糙雷同 | G19–G23 仅 42–170 三角形；树型和叶结构不足 | 按轮廓、结构、材质和连接角色分配几何；三种树形、可辨叶片，岩石合理切面 | 附件 skill 对照、原生和导出面数、近远视图、接地和连接检查；不能靠全局细分充数 |
| 地面像大色块 | 营地平面主要依靠同心环顶点色；大尺度表面缺少细节 | 世界尺度表面层、低对比近景细节、沙/草过渡；必要轮廓密度 | 与资产同屏的近/中/远视图；不破坏地面高度和原连接路线；无随机三角色块 |
| 没有自然运动 | 多数模型完全静态，只有少量整体摆动 | 根部固定的枝叶微风、布面中部轻摆；风相位错开，固定结构不动 | 正常速度视频、暂停/截图/减少动态一致性、阴影与变形一致；不以整树摇摆代替枝叶运动 |
| 低分辨率观感 | dpr 上限 1.5，但没有实际 drawing buffer 证据 | 高清像素预算与可选择质量；检查抗锯齿、阴影和表面尺度 | CSS 尺寸、canvas/backbuffer 尺寸、实际 DPR、原尺寸 PNG 同时记录；截图缩放不算高清 |
| 无有效自测 | 旧脚本仅沿营地路径行走，未验证资产阻挡 | 反馈驱动按键 bot，障碍检测、卡住记录、局部碰撞 fixture、动作与分辨率检查 | 不变版本基线和最终版本的同类场景；真实行走与瞬移 fixture 分开；console/network 故障单列 |
| 通用问题漏查 | 旧验收只检查单条营地路线 | 审计城镇/栈道/路面/家具/灯杆/树木/暂停/加载/渲染，区分已证实和疑似 | 各区状态、修复项与未验证项，不能将“无报错”写作“可玩性通过” |

## 四份 skills 的落实方式

2026-10-21 已核对 Downloads 附件与 Codex 本地注册版本：四套共 25 个文件逐一 SHA-256 一致。

- `low-poly-furniture-design`：先确定比例、材料与连接；低多边形不是低到丢失结构。家具需检查支撑、接触、用途与读图距离。
- `blender-low-poly-pipeline`：原生源、评估后面数、导出、独立重导入、实际视图是同一交付；保持本项目 +Y 上、+X 前和米制契约。
- `blender-connected-refinement`：连续表面焊接、嵌入零件接触、关节独立，按结构角色检查；不能把所有物体机械合并或统一细分。
- `blender-rig-animation-smoke`：真实骨架与归一化权重、明确动作名、脚底接触、极限姿势与插值时刻、最终导出文件动作回放。运行时动作跟随实际速度与落地状态。

每个资产采用有意义的几何预算，保留三角形和字节统计；附件中的特定示例预算不当作所有资产的硬上限。场景总预算和性能必须用最终运行状态复核。

## 调研与采用原则

访问日期：2026-10-21。下面是实现依据，不是对当前效果的通过证明。

- [Three.js Responsive Design](https://threejs.org/manual/pages/responsive.html)：CSS 显示尺寸与实际绘图像素分开记录；在像素预算内设置渲染尺寸。不能仅凭 dpr 常数宣称 1080p/2K。
- [Rapier Colliders](https://rapier.rs/docs/user_guides/javascript/colliders/)：凸包会填满凹处；有门洞的静态帐篷壳适合简化三角网格或分片代理，车辆等动态刚体继续使用简单/组合形状。
- [Unity Terrain Layers](https://docs.unity.com/en-us/engine/6000.3/manual/creating-environments/script-terrain/terrain-textures/class-terrain-layer)：地表层的颜色、法线、粗糙度、世界尺度平铺和透明度过渡可分别控制。这里采用表面层原理，不引入 Unity。
- [Epic Landscape Materials](https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-materials?application_version=4.27)：以层权重和观察距离组织细节；本项目优先轻量材质过渡，再处理会影响轮廓的几何。
- [NVIDIA GPU Gems 3: Tree Wind](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-6-gpu-generated-procedural-wind-animations-trees)：枝条分层响应和实例相位差异可用程序风表达；本项目保留固定树根、柔性枝端和局部叶动。
- [NVIDIA GPU Gems 2: Virtual Botany](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-1-toward-photorealism-virtual-botany)：根部与顶部响应不同，运动幅度应克制；阴影和法线需要随变形保持一致。

## 证据入口

- `guide/`：人物制作、导出与动作证据。
- `nature/`：自然资产制作、面数、连接与风动证据。
- `runtime/`：碰撞、地面、清晰度和运行集成。
- `playtest/`：不可变旧预览基线、自动试玩及最终回归。

完成前不得将本页状态改为通过。最终报告要明确实测机器、实际像素尺寸、成功与失败案例，以及未验证的车辆侧向轮胎接触、目标设备性能和其他灰盒区域。


## 本轮运行结果

`playtest/acceptance-r3/report.json` 记录 64/64 复合碰撞案例、14/14 运行检查、11 路点连续按键路线无恢复、0 JS/console/HTTP 错误。桌上 C08 与可跨 G23 的口径分别由 Fable C1-a/b 明确，隔离查询不计入步行。已有三条 connection 路线通过，仅运行一次。

G24专项绑定73aa0bb6；`playtest/transitions-73aa-prototype/`与`interruptions-73aa-prototype/`有正常速度录像、完整停步/打断结果、全帧运行关系报告及无损压缩原始矩阵。`review.html`汇总真实游戏画面与最终GLB回读图。不能用早期碰撞批次或旧motion-r4四项基础检查替代本次角色专项。

实测机器 M5 Pro / 48GB，Chrome155 Metal；1080p、1440p实际drawing buffer。没有M1 Air/GPU余量认证，没有全实例/全驾驶场景认证。新候选Astro check 94文件，0 errors / 0 warnings；本地build成功。其余未验证项见`general-audit.md`。
