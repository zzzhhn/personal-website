# Playtest bot：QA API 精确需求（v1，2026-10-21）

提出方：playtest 会话（`tools/world/playtest/`、`docs/world/quality-v2/playtest/`）。我只读、不改 `src/`。下面所有接口都挂在 `window.__worldDebug`，仅在 `?qa=1` 时存在，生产包不应受影响。现有 `snapshot/teleportPlayer/teleportVehicle/enter/exit/drive/flip/water/recover/clearInput/state/set/stats/sceneObjects` 保持不变，我的 baseline 只用这些。

优先级：**P0** 没有它，碰撞判定只能靠位置推断（会被“grounded / 低速”假阳性骗过）。**P1** 明显提升判定和证据质量。**P2** 可选。

## A. 主线程（WorldActors.tsx）

### A1 P0 `snapshot()` 增加字段
```ts
playerVelocity: Vec3 | null;          // body.linvel()
playerCollider: { radius: number; halfHeight: number; centerHeight: number }; // 常量即可
playerYaw: number;                     // guide.rotation.y，用于角色朝向/动作检查
physicsStep: number;                   // 累计物理步数（每次 useBeforePhysicsStep +1），判定暂停/截图时物理是否冻结
```

### A2 P0 `contacts(): Contact[]` —— 玩家（或当前车辆）此刻的真实接触
```ts
type Contact = {
  self: 'player' | VehicleId;
  other: { colliderHandle: number; name: string | null; assetId: string | null; kind: 'surface' | 'solid' | 'vehicle' | 'obstacle' | 'unknown' };
  normal: Vec3;          // 世界坐标，从 other 指向 self
  distance: number;      // contact manifold 最小 penetration/gap，负值=穿透
  points: Vec3[];        // 世界坐标接触点（最多 4 个）
};
```
实现建议：`world.contactPairsWith(playerCollider, other => world.contactPair(...))`，读 `manifold.normal()` / `solverContactPoint` / `contactDist`。`name/assetId` 来自 A3 的登记表。只读，不改物理。

### A3 P0 每个 collider 的身份登记（主线程或 runtime worker 谁建 collider 谁登记）
每个 fixed / dynamic collider 都需要可查的 `{ name, assetId, kind }`，例如 `C03-tent-large`、`C07-desk`、`G21-rock#2`、`tree-trunk#5`、`building-sdic`、`lamp-post#3`、`bridge-rail-N`。现在 `StaticBlocks` 把几十个 cuboid 挂在同一个 RigidBody 上，只有 `{solid:true}`，接触到之后无法知道撞的是哪件物体。最低要求：`CuboidCollider` 带 `name`，或者维护 `Map<colliderHandle, Meta>`。

### A4 P1 `castPlayer(from: Vec3, to: Vec3): { hit: boolean; toi: number; other: Contact['other'] | null; normal: Vec3 | null }`
用玩家胶囊做 shape-cast（`world.castShape`），不移动物体。用途：fixture 单元测试，在不走路的前提下判定“从 A 到 B 胶囊是否被挡、被谁挡”，可以覆盖全岛几百个物体。报告里会标为 fixture，不算走路证明。

### A5 P1 动作状态 `actor(): { moving: boolean; running: boolean; airborne: boolean; animation: string | null; animationTime: number | null }`
现在角色是静态胶囊加盒子，没有动画。角色接入后，bot 用它判断“走/跑/跳是否触发了对应动作”。没有动画时请返回 `animation: null`，bot 会如实报告缺失。

### A6 P2 `inputState(): string[]`
运行时 keys Set 的副本。用于区分“bot 按了键但运行时没收到”（焦点或暂停问题）和“收到了但没动”（被挡）。

## B. runtime worker（buffer / physics inventory / overlay）

### B1 P0 `physicsInventory(): ColliderMeta[]`
```ts
type ColliderMeta = {
  handle: number; name: string; assetId: string | null; kind: 'surface'|'solid'|'vehicle'|'obstacle'|'sensor';
  shape: 'cuboid'|'capsule'|'cylinder'|'ball'|'trimesh'|'convex'|'heightfield';
  halfExtents?: Vec3; radius?: number; halfHeight?: number;   // 按 shape
  translation: Vec3; rotation: [number,number,number,number];  // 世界坐标
  aabb: { min: Vec3; max: Vec3 };
  visualRef: string | null;    // 对应 scene 节点名（如 camp-asset-C07-pad1），无视觉代理为 null
};
```
用途：每个视觉硬物和它的 collider 自动配对，算错位（AABB 中心距、覆盖率），找出“有视觉无 collider”（当前 G19–G23 全部如此）和“有 collider 无视觉”（空气墙）。

### B2 P0 `visualInventory(): { name: string; assetId: string | null; solid: boolean; aabb: {min:Vec3;max:Vec3}; instances?: {aabb:{min:Vec3;max:Vec3}}[] }[]`
只列应当可碰的硬物（树干、岩石、灌木（按设计决定是否可碰）、帐篷、家具、灯柱、牌子、栏杆、建筑、展台）。InstancedMesh 要逐 instance 给 AABB（当前 G19–G23、C04、C06、树都是 instanced，scene traverse 拿不到逐个位置）。

### B3 P1 碰撞 debug 叠图 `setColliderOverlay(on: boolean, opts?: { kinds?: string[]; color?: 'byKind'|'byMismatch' })`
在画面里画 collider 线框（Rapier `world.debugRender()` 或自绘）。`byMismatch` 让无视觉 collider 显红、无 collider 视觉硬物显黄。我用它出可见的叠图证据截图。不能进生产渲染路径。

### B4 P1 渲染 buffer 事实 `renderInfo()`
```ts
{ drawingBuffer:[w,h]; cssSize:[w,h]; pixelRatio:number; dprRange:[min,max]; viewport:[x,y,w,h];
  antialias:boolean; msaaSamples:number; toneMapping:string; outputColorSpace:string;
  shadowMapSize:number; shadowType:string; postprocessing:string[] }
```
`canvas` 和 WebGL context 我自己也能读。要这个接口是因为 r3f 的 `dpr={[1,1.5]}`、shadow 和后处理配置只有 runtime 知道，我需要报告“清晰度来自哪里”，而不是只看 DPR。

### B5 P1 时序 `frameStats(reset?: boolean)`
r3f 每帧 `delta` 以及 render/physics 两段耗时的环形缓冲（最近 600 帧）。rAF 间隔我自己能测，这个用来拆分是 GPU、物理还是 React 慢。

### B6 P1 暂停/截图冻结可验证
`animationClock(): { flags: number; fire: number; nature: number; water: number }`，各动效子系统累计时间。bot 会在 paused / shot 状态下读两次，确认不再增长。目前 CampFire 的 emissive 在暂停时仍会趋近目标（`if (!isRunning()) return` 前已更新），这属于可接受的光照过渡，但需要能分辨。

## C. 我不需要的

- 不需要新的传送接口；`teleportPlayer` 只在 fixture 使用，报告单列。
- 不需要 bot 专用移动 API；行走全部用真实键盘。
- 不需要修改 `drive()`；车辆路线也走 W/A/S/D/Space/E。
