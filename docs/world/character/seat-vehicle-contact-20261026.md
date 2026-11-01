# 2026-10-26 坐姿承托与上下车适配

本次修改是对现有 G24 骨架、蒙皮和 CMU 动作的运行时接触适配。没有新增动捕、重新上传角色、下载动作包或修改 GLB。完成了轻量源码与实际 GLTFLoader 蒙皮回归；受当前磁盘及内存约束，没有启动浏览器、Blender 或构建，正常速度侧视和运行时碰撞验收仍待主线完成。

## 真正悬空的原因

原 `GUIDE_SEAT_CONTACT_Y=.2394` 来自所有 pelvis/thigh/bag 候选中的最低点，无法代表后臀承托。当前实际 `SitIdle` 末帧后臀固定双侧接触簇中心为 `[-0.4615689, 0.3552551, 0.0066039]` m，旧根高度让真正后臀高于座面 **115.855 mm**。此前“最低点与座面误差小于 3 mm”只证明错误点的高度，不能证明屁股接触。

`GuideSeatContact` 在已细化、已合并材质的实际私有场景上，先取 `SitIdle` 末帧，筛选骨盆后下方朝下的三角面，再固定其下部 14 mm 带内的后臀/上大腿交界顶点。它排除前膝、背包和脚，合并硬法线重合点，按面积及左右各半权重组成双侧四点承托簇。参考取样后恢复全部场景 TRS；原片段保持不变。

运行时在 mixer、惯性化和上身附加动作后重新计算这四个固定蒙皮点，按当前朝向把承托中心的 **X/Y/Z** 对齐 `seat.position`。不再使用固定 `SIT_FORWARD=-.4825`。后臀簇的实际四点相对承托平面最大高度偏差为 **5.034 mm**，它是有面积的曲面接触带，不是某个最低点或骨点。当前 C06 GLB 的横向半宽约 0.38 m、半长约 2.4 m；接触簇位于单座中心附近，前后跨度小于 8 cm、左右跨度小于 26 cm。

`SitIdle` 仍只播原 0.533 秒 settle 一次，然后保持末帧。新增上身层有 4.7 秒呼吸和约 19 秒一次的低频视线窗口，25 秒采样胸部最大变化 1.547°、头部 8.596°。它不写骨盆或腿；每帧 mixer 前、隐藏时和退出时都恢复，避免积累。没有恢复原先约每秒一次的前倾往返。

## 动作来源与研究结论

当前资产没有 `EnterVehicle` 或 `ExitVehicle` 专用片段。`tools/world/guide/mocap/prepare_extra.py` 明确从 **CMU 143_18** 的首个坐下/起立周期提取 `SitDown/SitIdle/StandUp`，转步来自 **CMU 69_16/69_18**。G24 已发布 `SitDown=0.5833 s`、`SitIdle=0.5333 s`、`StandUp=0.4667 s`；本次复用了它们，没有将程序曲线称作新动捕。CMU 官网当前可读首页仍声明全用途免费，来源及 NSF 资助致谢保留；143 查询及 FAQ 本轮抓取超时，具体 take 身份由当前本地来源脚本和已有 manifest 证明。[CMU 官方数据库](https://mocap.cs.cmu.edu/)

Adobe 的官方 Mixamo FAQ 说明动画可免费用于个人及商业作品，并要求对新角色上传后处理。其内容没有证明当前 G24 已使用 Mixamo，也没有提供可直接在当前十八骨骨架上使用的上下车片段。本次没有上传私有模型，未使用 Mixamo。[Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)

Epic 的官方 Motion Warping 文档把修改限定在明确动画窗口，向一个已知位置与旋转目标调整根运动。其 IK Retargeting 文档进一步说明不同骨数、名字、朝向的角色需要匹配骨链及接触目标，不能靠换名称得到适配。本次采用相同的目标与时间窗口原则，在 Three.js 中实现尺寸适配，未引入 UE 或声称是 UE 插件。[Epic Motion Warping](https://dev.epicgames.com/documentation/unreal-engine/motion-warping-in-unreal-engine?lang=en-US)，[Epic IK Retargeting](https://dev.epicgames.com/documentation/en-us/unreal-engine/ik-rig-animation-retargeting-in-unreal-engine)

## 上下车实现与 Actors 接口

`WorldGuideVehicle.ts` 提供正反共用的 2.4 秒时钟及分段曲线。`WorldGuide.tsx` 继续导出 `VEHICLE_TRANSITION_S`，Actors 应使用该导出，不另写常数。

| 归一化入车进度 q | 动作与根路径 |
| --- | --- |
| 0～0.30 | 依据实际位移播放 Walk/Run，走到门外锚点 |
| 0.30～0.52 | 按车辆 yaw 播放现有 TurnL/R 的转步，显示朝向随窗口转向 |
| 0.52～0.80 | 播放 CMU SitDown 的髋腿屈曲，退出播放原 StandUp |
| 0.68～1.00 | 从门口移入指定车内承托点，按当前实际蒙皮接触簇修正三轴端点 |
| 0.79～0.98 | 仅在最后车壳转移段透明渐隐，退出反向显现 |

新增的轻微胸/脊柱弯腰是明确标注的程序附加层。它在车门动作窗口形成与坐下不同的上身弯曲，隐藏/中断后恢复。旧版车门动作完全没有车内根目标，且原 1.15 秒动作把转移压在门口；本次增加真实转步、髋腿屈曲、上身弯腰、车内三轴目标。上下车期间停用地面最高 25 mm 抬根补偿，避免其破坏车内承托。

Guide 接受：

```ts
vehicle: {
  phase: 'enter' | 'exit';
  t: number; // elapsed / VEHICLE_TRANSITION_S
  door: [number, number, number]; // 世界坐标，门外站立根的地面高度
  cabin?: [number, number, number]; // 世界坐标，臀部承托目标
  yaw?: number; // 车头朝向
  approach?: [number, number, number][]; // Actors 验证过的门外绕行中间点，世界坐标
}
```

主线 Actors 提供 cabin、yaw；没有 cabin 时只保留门口后备动作，不能称车内适配完成。建议按作者源车身坐标先选以下目标，加 `vehicleHulls(id).bodyY` 后随车刚体变换：offroad `[.05,1.02,sg*.42]`、coupe `[-.40,.57,sg*.38]`、van `[1.18,1.15,sg*.45]`。这些是根据现车窗/车顶轮廓及 G24 坐姿尺寸设定的适配目标，**源车没有座椅 mesh，不能称实测座面**。`sg` 是本次使用的车门侧。

三车当前整合车身只有 body 和独立车轮，没有独立可开门几何，也没有门洞与内饰。本次没有扩大所有权去改车体，最终移入仍经过闭合车壳遮挡。因此可以说门外动作及目标适配已改善，不能说已经实现完整开门、手握门把或无穿壳的车辆进入动画。下一次美术工作需要切出门洞及门片、建立内饰，再加门把手和脚踏接触目标。

## 验证与未通过项

运行 `node --test src/components/world/guide-seat.test.mjs src/components/world/guide-vehicle.test.mjs`：**5/5 通过**，没有跳过。当前非压缩配套 GLB 的骨架与所有动作采样 digest 与生产 G24 GLB 一致；测试同时加载当前运行时靴子细化函数。几何 Draco 内容没有在 Node 中重新解码，当前四点的运行时真实解码几何仍须由浏览器 debug read-back 核实。

| 检查 | 实测结果 |
| --- | --- |
| 八个朝向含正侧面，后臀中心三轴目标 | 最大误差 `4.69e-8 m` |
| 双侧实际四点与支撑面高差 | 最大 `0.005034 m` |
| 原高度错误复现 | 后臀悬空 `0.115855 m` |
| 25 秒呼吸/低频视线，骨盆及腿逐分量 | 完全不变，中心最大漂移 `6.86e-9 m` |
| 上身附加层恢复及原 StandUp 接管 | 通过 |
| 三车目标 × 八朝向，原 SitDown 当前后臀 | 端点最大误差 `1.08e-8 m` |
| 正反曲线、可见转身/弯腰段、有限连续根路径 | 通过 |
| 两个 helper 及 WorldGuide.tsx 定向 TypeScript 检查、Guide TSX 语法转换 | 通过 |
| 正常速度浏览器侧面/背面及真实车辆 shell 遮挡 | 未运行，待主线 |
| 独立开门、门把手或脚踏 IK、碰撞/逆向按键验收 | 未实现或待主线，不作通过声明 |

QA 可读 `worldGuideDebug()` 的 `seatSupport`：四点世界坐标、权重、中心、目标、`errorXYZ`、`idleElapsed`；`vehicleStage` 返回每段进度、透明度和弯腰权重。实时立坐过程只在最终接触权重达到 1 时要求中心贴面，落座与起立中的有限混合保留原过渡。

## 同日侧视复查后的前段修正

主线报告坐姿已在真实浏览器侧视通过，后臀中心误差约 `1.5e-6 m`。上车早期仍会从车后直接走向侧门并切过后角，不能用后段承托端点精度代替走近安全。

复查实际 Walk/Turn/SitDown 时，`root` 骨均为 `[0,0,0]`，`q≤.68` 的 cabin 转移权重严格为零，没有早期车座吸附；但原来 `base→door` 的直线路径切过车角，并且门外锚仅比车侧远 0.25 m。实际 G24 完整蒙皮在 Walk/Turn/SitDown 的本地横向半宽约为 0.469/0.460/0.432 m，因此物理胶囊不相交不能证明可见手臂没有穿壳。门外锚和绕行点应按可见角色至少约 0.55 m 的余量外扩。

Guide 新增 `approach` 中间点接口，用累计弧长采样完整折线路径，不再把安全绕行点压成起终点直线；行走方向采用当前路径段切线。Actors 可以按路径长度延长实际走近时间，再把其进度重映射到标准 `t` 的前 `.30` 区间。Guide 的 gait travel 改为两帧间实际路径位移，不再从名义 0.72 秒时钟推导速度。Guide 同时阻止普通地面 `rootOff` 的 `approach/shownYawOverride` 在车辆动作之后覆盖车辆朝向和动作选择。

新增实际 GLTF 回归：前 `.68` 的 11 个阶段 × 左右门 × 8 朝向，共 **176 个样本**；车辆包络采用 coupe 长 4.3 m、宽 1.9 m，绕车后角并在车侧外 0.55 m 停留。实际 Group 与 root 骨路径误差为 **0**，转移前进入车壳水平包络的蒙皮顶点为 **0**。`q=.52→.68` 时转移权重仍为零，原 CMU 坐下已让骨盆下降 **138.6 mm**，保证屈膝发生在门外。当前两组定向测试合计 **6/6 通过**。这些是来源骨架及完整蒙皮几何回归，不替代 Actors 路径扫掠、摄像机切换及最终闭合车壳转移的浏览器验收。
