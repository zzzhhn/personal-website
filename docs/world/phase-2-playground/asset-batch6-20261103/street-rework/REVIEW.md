# 街道设施返修验收

基线 `689484bf2e0f52c2b0cd3adc57c6c96bcd6bfd59`，实现 `a7a5c86`。本次进入游戏的变更集中在 `src/components/world/WorldStreetFacilityCraft.ts`，使用既有街道批处理和表面槽。路灯限定为带臂款，三族远距档继续使用原输出。

## 普通机位

| 设施 | 对照白天 | 返修白天 | 对照夜间 | 返修夜间 |
| --- | --- | --- | --- | --- |
| G-barrier | [图](screenshots/barrier-baseline-day.jpg) | [图](screenshots/barrier-candidate-day.jpg) | [图](screenshots/barrier-baseline-night.jpg) | [图](screenshots/barrier-candidate-night.jpg) |
| G-lamp | [图](screenshots/lamp-baseline-day.jpg) | [图](screenshots/lamp-candidate-day.jpg) | [图](screenshots/lamp-baseline-night.jpg) | [图](screenshots/lamp-candidate-night.jpg) |
| S-signal | [图](screenshots/signal-baseline-day.jpg) | [图](screenshots/signal-candidate-day.jpg) | [图](screenshots/signal-baseline-night.jpg) | [图](screenshots/signal-candidate-night.jpg) |

G-barrier 首件用 `roadblock-2`。第一版直支腿仍穿进倾斜警示板，橙白条纹出现纵向切口，保留了[淘汰图](screenshots/rejected-r1-barrier-day-unsettled.jpg)。第二版用连续折弯矩形管绕过板背，鞍座贴合两块板，铰链、横撑及鞋座之间有实际实体交叠。对两块板的可见区逐三角面裁切，支腿最小净空 12.42 毫米。[第二版样板预览](screenshots/sample-r2-barrier-preview.jpg)用于决定继续做杆件，当时仍在铺设阴影。

G-lamp 用 `lamp-0`，在杆脚、悬臂与灯头加上独立的套接件。S-signal 用 `signal-2`，在远端信号头加挑臂鞍座，在近端加两片抱杆安装件，两只背壳都有折边。橙白板反光片、路灯透镜和信号灯三色透镜的发光三角面、坐标、颜色和代码均与基线精确相等。几何检查覆盖 43 个构件接触，并比对位置、碰撞、远距档及无臂款输出。

12 张实景均为同一静态构建、1710 × 931、50° 视角、DPR 1、曝光 1、balanced。每对读回同一相机和实例位置、同一发光顶点数，阴影队列为空。信号灯昼夜两对均为黄灯，车身挡住杆底，仍完整看见两只灯头。新增套接和折边在白天更容易分辨，夜间主要读到原有发光面和地面光斑。Chrome 当前验收标签未记录错误，最终构建日志中三张材质贴图和矿区布局均返回 200。

## 运行时和资产成本

| 设施 | 实例 | 近距三角面，原版 → 返修 | 源顶点与索引字节，原版 → 返修 | 远距三角面 |
| --- | ---: | ---: | ---: | ---: |
| G-barrier | 4 | 1440 → 1680 | 178560 → 219840 | 192 |
| G-lamp | 26 | 2118 → 2550 | 178056 → 207720 | 192 |
| S-signal | 4 | 3210 → 3518 | 286560 → 330576 | 214 |

三个共享近距源网格合计增加 114960 字节。34 个实例同时进入近距时，设施三角面上界增量为 13424。继续复用街道 BatchedMesh 和现有材质，无新增贴图、提交批次或逐帧任务。取证附带整场渲染计数，计数受可见范围和当帧阴影影响，适合作为取证环境记录。六对实际绘制调用数和纹理数逐对相等。按路障、路灯、信号灯排序，白天整场三角面增量分别为 6080、7280、7032，夜间与各自白天增量一致。[逐对实录和截图哈希](render-record.json)保留了原始数值。本轮未测帧耗时。

## 可编辑文件

[native](native/) 中每族都有 Blender、GLB 和运行时近远距几何 JSON。Blender/GLB 中的近距部件按运行时命名拆开；预览材质映射近似呈现原色和槽位，游戏内灯光节奏与批处理逻辑由现有街道着色器执行。Blender 5.1.2 新场景回读 GLB 后分别为 1680、2550、3518 三角面，三个包围盒最大坐标差均为 0 米。源 JSON 由实际构造函数导出，包含原碰撞 hull 指纹。

从仓库根目录运行几何检查和截图验证。

```sh
node tools/world/facility-craft/batch6/street-rework/check.mjs
node tools/world/facility-craft/batch6/street-rework/verify-review.mjs
```

本地 Astro 配置 `astro.batch6.street-rework.local.config.mjs` 提供三个固定机位。进入 `/world/?craftReview=1&qa=1&quality=balanced`。加 `&streetRework=baseline` 进入同一构建中的第五批对照。拍摄时以实际相机、设施位置与三角面、GPU 贴图、DPR、日夜混合、阴影状态和稳定窗口为准。
