# hut＋shelter R2 独立审查

**结论：可将R2美术基线与独立唤醒补丁一起保留为集成候选。迟到贴图刷新这一源级阻断已修复；未发现另一个已证实的重复PMREM、逐实例贴图加载或碰撞双挂阻断。** 这不是两族全面完成、用户视觉接受、FPS通过或真实暂停生命周期已验收。

精确范围：设施树 `codex/world-craft-batch6-facilities`，美术 `96b63217821df3bbfc3dfc78c26e02bade3669dd`，基线 `7702c3de674f0b39ab8b0e2a098e586b54b03aee`；后续调度补丁 `ad7ee76d68ce240d9ed8e4f1657a5e637e62700c` 直接以该美术提交为父。只审hut／shelter及必要共享路径，没有查看新族、构建或打开浏览器，也未动4341。

## 身份与既有收据

- 独立核对manifest-r2的36份capture文件（18图＋18 JSON）、9份资产哈希，以及7份manifest源码哈希与96b6321 Git对象，全部匹配。本次未打开图片，只核哈希与JSON；既有画面接受范围沿用主协调，18图只代表96b6321外观。
- 独立重算8对：机位／FOV／时间／canvas／曝光／quality／night／blend一致，DJC整体、吧台、家具、营地四个背景root汇总与digest匹配；loading ready、shadow idle。shelter均为 **+3097tri／+1call**，hut normal **+1906／0**、close **+1818／0**。这些是单帧计数，六个有界root也不是全场景等载证明，不能换算FPS或GPU净成本。texture计数差7至9也不能全归为木图重复，统计包含批次内部DataTexture等资源。
- 当前hut-runtime为304个mesh、全部primitive有UV、无images，SHA为`2773a10b…d9973ac`，匹配manifest。拍摄时容器SHA另为`5135478f…205957`；首拍至最终依赖作者的304-mesh canonical native等价收据，本次未开Blender重算或重新拍最终容器，未把最终SHA冒充拍摄SHA。

## 材质、缓存与释放判断

| 项 | 源码支持的判断与边界 |
| --- | --- |
| 木材三图 | WorldFacilitySurface模块只创建一组Texture／Source，1024×512，下载合计1,045,688B；color为sRGB，rough／normal为数据图，统一flipY=false、repeat、aniso4。材质借用同一uniform及纹理，不为每mesh／LOD clone或dispose。RGBA8完整mips预算约8MiB／组，仅估算。缓存按应用生命周期保留，没有pack retain/release；这是有界保留，不是已证实泄漏，也未实测反复退出后的内存回落。 |
| 环境与夜间 | FacilityReflections借用既有renderer键、引用计数PMREM；没有新Generator循环、场景environment或逐物件灯。变体dispose从registry删除。shared night直接进shader，强度`.35×(1-.90×night)`；slot0在IBL函数提前返回零，未审旧面不获得新增IBL。共享shader仍有新分支／属性／程序版本，不能把slot0零IBL说成零GPU成本或其它旧族逐像素不变。 |
| 生命周期限制 | 环境转发、变体集合和纹理包是模块全局，由当前单Canvas／单owner使用。卸载Park会清除借用环境；多Canvas隔离或独立consumer生命周期不在本轮保证内，需主协调另做renderer scope，不能推广为通用全局缓存。 |
| Park UV／材质 | gltfPieces按groups处理material[]，先保留源UV再烘世界变换；新旧piece均生成兼容aMat／aSuv，正sign与负surface slot含义分离。PartBatch／Knockables显式取source hook再组合动画／fade及程序key，修掉clone不继承hook的问题。非hut slot0不接受表面IBL；共享动态展品hook的编译行为变化仍不等于本轮已审其它族外观。 |
| 玻璃 | 独立透明小批，alpha.45、rough.46、默认FrontSide、depthWrite=false、castShadow=false，无transmission／背景模糊pass。可称乳浊透明近似。复用StreetBatch LOD、远距alpha与frustum；标准shader接收批次color alpha。父组visibility覆盖两批；玻璃batch／私有material／两级geometry有显式cleanup。碰撞只从原proxy循环生成一次，没有给玻璃另挂body／collider。 |

## 阻断已修与非阻断风险

**已修源级阻断。** 96b6321的TextureLoader无完成通知，贴图若晚于暂停demand的有限帧到达，可能不刷新。ad7ee76只改5路径：三图onLoad通知当前root.invalidate，订阅立即补一帧，cleanup先取消再清环境引用。无timer、轮询、额外useFrame、always或PMREM。

独立运行 `node --test tools/world/facility-craft/batch6/surfaces.test.mjs`，**6/6通过**，约0.53秒；确认所测源码与ad7ee76匹配，diff whitespace通过。新增测试用实际模块代码与延后Loader回调验证先完成后订阅、迟到两图、缓存不重复load、卸载后不唤醒及重挂载；其余覆盖UV／groups／shader、proxy／seat／sign、玻璃分区及StreetBatch LOD／fade／hide／dispose。只出现Three CJS deprecation提示，无测试失败。**Node通知测试不能代替真实R3F暂停帧、晚图显示和最终再睡眠。**

**非阻断、暂不改几何：** splitShelterGlazing克隆整份属性后只分index。L0玻璃只用72／5472顶点，L1只用24／360，玻璃一侧未用属性共344,160B，且bounds包含未引用顶点。这是一次性buffer／保守包围体冗余，不是泄漏；不为该约344KB重写本轮几何。

**仍未运行证明：** StreetBatch统一sortObjects=false，单亭未增加多实例排序，但grazing／rear静图不能保证连续移动时与水面／其它透明物的排序。源测试证明glassBatch自身setHidden，组件当前保证父组隐藏；不意味着未来对opaque实例单独setHidden会自动镜像玻璃。当前固定亭没有新增reset需求，扩展时再同步两批。

## 集成待办与停止点

1. 合入96b6321时同时带上ad7ee76，保留两份身份及18图原绑定，不把补丁测试称为新图或用户接受。
2. 自然线重型窗口结束、主协调安排资源后，只做一次真实暂停冷加载复验：迟到三图能显示、已缓存再挂载不漏刷、卸载取消不唤醒旧root，有限刷新最终回到休眠；保留菜单昼夜／画质效果。当前不抢锁或另开窗口。
3. 若安排普通游玩代表成本窗口，再顺带观察玻璃转角／远距fade及透明遮挡，不默认重跑全岛六窗。当前没有连续游玩FPS、GPU时间、真实远距隐藏或反复mount/unmount资源曲线，因此这些结论继续留白。

本审查到此止，仅交回两族的源级集成判断与上述待办；不要求全局降画质或继续艺术返修。
