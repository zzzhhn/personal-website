# 2026-10-30 资源与性能只读审阅

范围：integration `codex/world-alpha-pilot`，读取时 HEAD `f248bc2`，包含未提交候选源码；没有修改运行代码。
资源：preflight memory pressure 2、swap 8.47 GiB、free disk 4.68 GiB；swap 不是当前泄漏证据。
只读源码与轻量文本检查，没有浏览器、构建、测试、图像服务或子代理；未占用主线重型锁，4341／4343 未操作。
以下路径均相对 `src/components/world/`；事实来自当前源码，收益与用户体验仍待实机验证。优先级表示验证顺序。

## 1．先测工厂片元噪声的无效计算

- 证据：`factory/factory-lighting.ts:87–94,133–151` 每片元写出三次四角 hash 噪声；`factoryDetail` 淡出仅乘结果，金属等不适用表面也先算噪声再乘材质掩码。代码没有按掩码或 detail 为零跳过计算。
- `:72–85,161–164` 另有房间包络与七灯距离衰减；灯域外已有提前返回，域内按片元计算。这是正式运行的着色成本，不是七盏新增 Three 灯，也不能由三角预算推导其 GPU 时间。
- 工厂建筑及传送带离场仍挂载（`attractions/WorldAttractions.tsx:12–22`，`factory/WorldFactory.tsx:85–95`），远处仍可见时仍着色；视锥剔除后不等于继续全厂片元运算。
- 最小修复候选：先保留片元补光；在材质掩码为零时跳过对应噪声，在 detail 为零时跳过两种细噪声。保留粗噪声和原渐变，不改分辨率、色彩或灯光范围。
- 该测：固定近／远镜头、正午／午夜，比较相同像素与 GPU 时间；GLSL 编译器可能优化，分支也有代价，不能把源码调用数直接算成硬件指令或承诺收益。

## 2．传送带仅改一段，却重新提交整批矩阵

- 证据：`factory/factory-conveyor.ts:101–119,157–177` process 只改一个 line 的 angle，`upload()` 仍遍历全部 rollers；某条链 run 改变后，`uploadBelts()` 仍遍历全部 chain placements。
- 两处均只设 `instanceMatrix.needsUpdate`，没有 update ranges；CPU 重组不动实例矩阵，并请求整属性更新。新增链条是一个 instanced draw，但 draw 数少不表示动态上传成本为零。
- 边界：`:137–154` 在暂停、非活动、无操作或进度不增时返回；路径数组仅在 operation／routeLine 切换时创建，逐实例计算复用 scratch。远处没有持续传送动画，也未发现逐帧建几何。
- 最小修复候选：保留同一 mesh 和实例顺序，预存各 line／run 的连续区间，只改 dirty 区间，并登记对应矩阵属性 update range；初始化仍全量写入。
- 该测：真实 process／extract／正反 route 的 setMatrixAt 次数和上传字节；暂停、离场、无进度时应为零，未动实例矩阵不变，端点、返工和恢复后相位连续。此项尚无毫秒收益测量。

## 3．座舱安全查询保留，先减少每帧临时对象

- 证据：`attractions/attraction-camera-cabin.ts:22–40` 成功连续帧新建 position、seat、position.clone 三个 Vector3、展开校验数组和结果／历史对象；两次 overlap 各建 Ball，移动时 `camera-collision.ts:29–36` sweep 再建 Ball 和若干对象。
- 正常连续移动帧最多两次 overlap 加一次 sweep；60 Hz 下对应每秒 180 次查询调用，非耗时测量。`WorldActors.tsx:1363–1368` 仅活动第一人称座舱调用，暂停在 `:1321` 已返回，离场不调用。
- 最小修复候选：类内复用 current／previous position 与 seat，标量有限值校验、copy 更新历史；可按 radius 复用 JS Ball。保留旧端点复查与整段 sweep，不能通过少做安全查询换取性能。
- 该测：整趟 30／60／120 Hz 与 FOV、生命周期切换的原安全断言；额外测临时分配和查询总耗时。复用 JS Ball 不等于消除 Rapier 内部临时分配，也未证明这里是帧尖峰主因。

## 道路、驻留与休眠边界

- `WorldTerrainRoads.tsx:193–217` memo 构建 visual、main、parkReady；`WorldTerrainPaving.ts:413–469` 裁剪无 useFrame。记录里的约 72 ms 是准备成本，本轮没有重测，不能称为每帧成本。
- `visual` 闭包保留新 strip grid 及切片数组；有 park spur 的 chunk 会再执行一次 `visual(c,true)`，同时常驻 main／parkReady 两份几何。双版本机制原已存在，本次新增的是裁剪工作、grid 和原始 collisionPos 副本。
- 按输入 interior 5606→9276，增加 3670 三角；`geometryOf` 的非索引 10 float／vertex 对单份几何意味着约 430 KiB 新属性数据，CPU 属性及实际上传后的 GPU 各有相应负担。不是全场景内存估计，不包含另一版本、grid、驱动开销，也没有新增物理三角或 draw。
- 如冷启动证实受此影响，再把裁剪 grid 限于一次准备作用域并复用裁剪结果做 plaza 处理；保留独立原始碰撞数组。先量构建次数、各属性 byteLength 与释放后 heap，不抢先引入更复杂缓存。
- `factory-production-detail.ts:12–19` 合并静态批次；`WorldFactory.tsx:57–64` 一次构建和烘焙。输入所述 64684 tri 未在本轮重测；静态细节增加常驻几何／碰撞和可见绘制成本，不增加逐帧 JS 构建。
- `factory-worklife.ts:153–161` 工人离场隐藏、暂停不推进，卸载释放几何／材质／骨架；`WorldFactory.tsx:74,82–83` 传送带有对应销毁与暂停保护。未发现本轮范围内可确认的累积泄漏。
- `performance-render-policy.ts:3–4` 隐藏 never、暂停 demand；菜单触发的有限绘制仍需着色，不能期望零成本。上述新代码没有自行建立常驻 timer 或 invalidate 循环。
- 正式运行：冷挂载准备、可见帧着色／矩阵上传及骑乘查询；DEV HMR：受影响模块或组件重算／重挂载可能重复准备及编译。当前 memo 并不意味着 HMR 零成本，HMR 峰值也不能归因成生产持续更新。

交付检查：仅此报告，行数与 `git diff --check` 检查；代码正确性、性能收益和浏览器视觉验收均未替代主线检查。
