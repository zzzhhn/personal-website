# 灰盒实现 brief

基准：`1f530e15304d5078b7757e720ec8b95473971337`，分支：`codex/world-greybox`。

只交付首个任务：资产清单、可操作灰盒、8 机位证据、草稿 PR 和既有 Cloudflare 自动预览。不得建正式模型、改冻结文件、部署、合并、推 main、接新服务。

## 共享工程契约

新增文件统一放 `src/components/world/`；页面 `src/pages/world.astro`；文案 `src/components/world/world-i18n.ts`。所有 three/Rapier 代码位于 lazy import 的 WorldRuntime 下，UI 外壳不导入 three。只在 /world 加载。

- `types.ts`：`Vec3 = [number,number,number]`，`VehicleId = 'offroad'|'coupe'|'van'`，`WorldContent` 包含 experiences/projects。
- `layout.ts`：场景作者维护的唯一坐标源。导出 `CAMP_SPAWN: Vec3`，`VEHICLES`（id, position, yaw, size: Vec3, color, mass, engineForce, grip, suspension），`ROAD_POINTS: Vec3[]`，`BUILDINGS`（id, position, size, color, year），`BOOTHS`（id,position），`WORLD_SHOTS`（id,position,target），`nearestRoadPoint(position): Vec3`。
- `store.ts`：Zustand 状态，lang（en/zh），light（dusk/night），paused，activeVehicle（VehicleId|null），nearbyVehicle（VehicleId|null），canRecover，speed，zone，position:Vec3，ready，zoom（0|1|2），shot（string|null）；`setState` 由 store 提供。`recoverRequest` 数字由按钮递增。代理可增加字段并通知主代理。
- `WorldEnvironment.tsx`：default 组件；静态环境和碰撞体，灰盒建筑、营地和园区；从 store 读 light，完成 2 秒光照过渡；固定 RigidBody 的 collider userData `{surface:true}` 标路面；建筑 userData `{solid:true}`。
- `WorldActors.tsx`：default 组件；胶囊步行与三辆方块车，四射线悬挂、E 上下车、R/按钮 2 秒翻车复位、水面 2 秒拉回最近路面、三档固定方位相机和遮挡半透明。输入在 paused 时停用，blur 清空按键。actors 由 WorldRuntime 渲染在 Physics 内。
- `WorldRuntime.tsx`：root 负责 Canvas、Suspense、Physics、debug 测试 API 和 world_enter；挂 Environment/Actors。提供 `?shot=<id>` 固定机位且暂停玩法，8 机位用于证据。
- `WorldApp.tsx`：root 负责 lazy runtime，加载、出错、Esc、小地图、中英、光档、上下车提示、翻车按钮、速度。手机只说明需桌面（正式 10 秒预告片在上线门）。

## 空间与行为

+X 东，+Y 上，-Z 北。三车前向 +X。营地西南高地，六楼在东南海岸路内陆单侧，三四栋低背景体块，桥连接东北入口广场，再之字栈道六屋。三个二期地基。三车分别营地出口、海岸路边、栈道口广场。不把树、帐篷、楼或车做成正式资产，全部清晰的占位几何。

步行相机距离 12–15m，车 18–22m 加速度扩展，高机位约45度固定方向。WASD/Shift/Space/E/R，单跳；有重力、惯性、碰撞回弹；三车质量抓地悬挂有区别。可撞测试路障 30秒复位。全局沙土/橄榄/石板蓝/奶白/橙/青来自 Art Lock。

## 已知数据差异

当前 main 的 `src/content/experiences` 只有四条旧记录；现站六条双语履历实际在 `src/lib/i18n.ts`。不在新代码复制事实、不改现站内容。灰盒保留六栋占位，项目从 collection 读。内容同步待明确授权，记录为未验证项。

## 验证

脚本仅语法，物理相关测试加一次定向回归，交 PR 前只跑一次全量。看图与实玩为主体。所有代理不 push、不 commit、不修改依赖/现站原文件，汇报文件与未验证项。无项目 AGENTS.md。
