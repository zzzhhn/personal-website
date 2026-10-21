# 集中集成交接（主线程维护）

本页合并跨组信息；不反复打断正在制作的会话。下一批工作开始前读取即可。上半页保留接入过程；最终状态以末节及验收包报告为准。

## Fable 最新口径

已读 `/Users/bobby/WorkBuddy/personal-website/bobby-3d-world/验收-营地返工-20261021.md`：旧设计通过作废；G24 L1 自制骨架候选先行；树 ≤900/岩 ≤100 不再是上限；碰撞属于样片验收。A–D 每项要真实证据。冻结文件由 Fable 更新，主线程没有改。

## 已落地接口

- `store.quality: 'balanced' | 'high'`，默认 `high`。WorldApp 中英画面质量按钮已接入，runtime 直接读取；只由 R3F 统一设置 DPR。
- WorldActors 的 `snapshot()` 已增加 `playerVelocity`、`playerCollider`、`playerYaw`、`physicsStep`；`playerCollider.centerHeight=.82` 是物理脚偏移，生成高度 .88 含额外 .06 空隙。
- `contacts()` 返回当前玩家或驾驶车辆的求解器接触点、距离和 other→self 法线；`inputState()` 返回真实已收键。API 仍只从 qa 页面暴露。本地浏览器已读到地面接触，法线 [0,1,0]、穿透约 1.1mm，API 基础可用；其他资产接触仍待回归。探测时有一次 Vite Outdated Optimize Dep 504，最终测试需全新页面且0错误。
- `castPlayer(from,to)` 已加入，实际物理胶囊、排除玩家自身与sensor；只查询不移动。返回 hit/toi/other，normal 暂为 null（不猜测 shape-local 法线坐标）；待最终 fixture 回归。
- `actor()` 等人物最终组件后一起接，不将按键意图伪装成动画状态。

## C03/C04 新门洞与实际碰撞壳

主线程保留旧 `tools/world/camp/shelters/` 及旧证据，新增 `tools/world/camp/shelters-v2/`。已生成 `public/assets/world/camp/C03.glb`、`C04.glb`；各 1020 triangles（相对 792 为 1.288×），新原生源与独立重导入检查通过。实际看过两份彩色六视图，证据在 `quality-v2/shelters/views/r1/`。最终 GLB 壳的 24/24 Rapier shape-cast fixture 通过（入口中心与左右偏移、实际胶囊及 1.72m 视觉净空、后/侧墙阻挡）；这不是键盘行走证据。运行碰撞/帆布运动未验证。

门洞是真实六边轮廓（两侧竖边、肩部斜边、顶横边），门帘收束在两侧；去掉前门中央落地杆，改双侧柱与屋架。C04 保持总高 2.5 m，仅把檐/脊改为 .68/2.35 m，为角色留出真实净空。实际参数在 `quality-v2/shelters/manifest.json`。

每个 GLB 根节点 extras：

```text
collisionSchema = "camp-tent-shell-v2"
collisionVertices = flattened xyz, +Y up, m, recentered with final visual geometry
collisionIndices = triangle indices into vertices
doorProfile = flattened lateral/height pairs, ordered along actual doorway edge
tentParams = JSON string of dimensions
```

`collisionVertices/Indices` 是实际橙色帆布闭合壳（包括收束门帘），可直接创建固定 `TrimeshCollider`；无需再按旧三角门硬凑矩形洞。根是原点，child 导出轴转换不应再施加到这份已转换坐标上。世界实例 position/yaw 与渲染共用。绳、缝线和微小绑带不作为障碍。若加杆件代理，采用真实左右结构，门中央不得有柱碰撞。不要用完整凸包把门和内部填死。

风动仍需保持固定边，碰撞壳静态；视觉偏移约厘米级，不得把边界摇离碰撞或撕开缝线。灯光/色板不改。

## 人物集成待核查

Guide PLAN 使用 `speedMps/grounded/visible/facing`，组件内部控制转向，父 group 不重复转。主线程最后替换胶囊视觉，按真实 body 速度更新。

计划中的 Walk 1.5 m/s、Run 4.2 m/s 与当前 W=3.5/Shift=6.7 存在动作选择差异；运行验证前集中解决，不能把“按 W 已有 Walk”写作通过而实际一直播放 Run。保持不穿地、不滑脚，移动速度变化若采用要明确记录。

## 共用验收注意

只测实际返回的数据。原始 PNG 大小、CSS 和 drawing buffer 分开；不要把 CSS 1440×900 截图放大后叫 2K。旧 48c59fd5 不变预览仅作 baseline。暂不运行全量测试或启动第二个 dev 服务；最终由主线程统筹一次 targeted 回归和 astro check。

## 主线程运行时集成进展（18:15 批次）

Runtime worker 在两次 429 后停留空闲，主线程接管 WorldCamp/Environment/Runtime 和 WorldCampPhysics/WorldWind/WorldTerrain/WorldQuality/WorldWater。其它组不用改这些文件。

- 营地 16 件已实际接模型派生碰撞，图形/碰撞使用同一 placement matrix；C08 从桌子局部位姿转世界位姿后独立挂碰撞。移除全部旧营地道具碰撞箱，只保留地面/pad。
- 真实浏览器 smoke：206 colliders、62 营地 shape、无 fallback；1920×1080 实际 drawing buffer、4x MSAA、4096 阴影、约82k三角/187 calls。开发缓存仍出现2个 Vite504，最终需freshbuild复核。尚未宣称行为验收通过。
- 新世界地面材质已接；水面法线涟漪已接；帆布仅橙色布面运行时细分供厘米级形变，缝线/屋脊/檐/端部固定，几何碰撞保持静态。
- `WorldWind.windUniforms` 是唯一动效时钟，供树叶组 import；暂停/shot 不累加，reduced motion 强度渐至0。
- QA `physicsInventory()/visualInventory()/campColliders()/renderInfo()/setColliderOverlay()/animationClock()` 均接入。AABB只作粗检查，不把有门洞或叶团的整个包围盒当作实心物体。
- 非营地区域，原来被误放在decor而能穿过的展台前箱和建设中牌，已用同一visual block加入solid。

## 人物运行时已接入（主线程）

主线程负责 `WorldGuide.tsx`，guide worker 只补原生/最终GLB QA、manifest、视觉审查。组件使用真实 skinned GLB / AnimationMixer 与自制五clip，脚底 local0/父偏移-.82。`actor()` 提供实际 active clip/time/timeScale 与变形后靴底最低点。

步行参数由原3.5/6.7m/s调为1.8/4.2m/s（W/Shift），保证普通输入是可读Walk、Shift是Run；动作timeScale=实际速度/制作速度，撞墙停止迈步。未改输入/刚体驾驭架构。bot 不应沿用旧硬编码步行速度预期。最终路线同样使用实际按键闭环。

## 18:27 接手范围

Nature 与 bot 会话再次 429 失败，均停在 idle/error。主线程现已接手 `WorldNatureMotion.tsx` 与 final bot；不要在未重新分工时恢复这些文件写入。Nature 的 `_wind` 已接入同一 WorldWind 时钟，实例错相，总位移上限 .13m，阴影使用同一位移公式。树干根部、岩石固定。材料法线小幅响应是近似，最终以录像和对照图检查。

## 最终整合状态（19:20）

上述早期“待接入”“Vite504”与旧帧统计不是当前结果。全部运行时、自然资产、bot 由主线程收口，guide 线程仅交付最终模型与制作证据。最终使用 build/preview，不使用旧 Vite 缓存。

- `acceptance-r3`：64/64 复合碰撞案例，14/14 运行检查，11 个连续路点无恢复，0 JS/console/HTTP 错误，无 fallback。实际首次稳定画面 194 calls / 102043 tris，242 colliders。
- C08 是书堆；地面步行受 C07 桌阻挡，另按 Fable C1-a 在书堆高度进行 5 cm 球四向隔离查询。G23 实体矮石真实接触并抬升 0.123–0.220 m，符合 C1-b 跨越规则。
- `connections`：三条已有连接路线通过，仅跑一次。
- `motion-r2`：最终候选动作和 DPR2 专项，4/4；逐帧实际鞋底位置可读，采样接地帧下沉为 0。与完整碰撞批次的角色 hash 不同，报告明确分别绑定文件。
- 完整树、帐篷的正常速度录像另附；真实 1080p/1440p drawing buffer，未做 M1 Air 性能认证。
- Astro check 88 文件，0 errors / 0 warnings / 105 hints；build 成功。

最终角色发布 hash、Fable 结论、PR/预览会在正式交接记录更新；本段不是提前宣布接受。


## 最终角色与清单（19:35）

最终 G24 为 `d3ccc5919af10f6614e91c3d31d548c6135bb4c0ba29dbaca6da558c0ac89357`，腕部嵌入袖口修复后，`motion-r4` 4/4、超过10秒真实键盘录像、采样接地帧靴底下沉0，最大视觉补偿1.53cm。原生2006面，18骨17deform；旧运行时占位由同版Three重建348面，倍率5.764，不冒充旧GLB基线。

原生Jump局部地面滑移诊断failed（3.50cm）保留；实际Jump20个采样全离地、最低离实际地面25.8cm，解释在 `motion-r4/jump-contact-interpretation.json`。原生body BVH交叠候选非零，同样交Fable判读，不能写成整体机器通过。

资产清单80项Markdown/JSON与17个已制作GLB hash检查通过（一次只读一致性脚本）。PR正文已更新draft；Fable最终 A–D 暂因Mac锁屏无法CUA送达，已请Bobby解锁。未合并/未推main/未手动部署。
