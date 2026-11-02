# Bench／bin 最终候选复核

**主协调已独立接受R2普通视角提升，所需有限夜景与交互验证通过，可交下一集成候选。** 这不等于用户审美通过、内腔所有角度完全解决或全岛GPU成本保证。bench保留R1处理，没有被bin返修改动；bin生产源冻结于`7253ec60b053370d449efde37f09f64d347b3118`。

实际游戏仍使用TS Builder，经原StreetBatch／StreetMaterial绘制。新增卷边／口沿、盖身压缝、内胆和底鞋均进入这个运行路径；portable GLB是可编辑档案的便携副本，没有被冒充为游戏实际加载的模型。native／fresh-import见`R2-NATIVE-EXPORT.md`。

`runtime-r2/`仅8张原始JPEG：bin普通R1／R2一对、bin与bench各一张必要夜景、bench坐／立、bin受推／复位。截图已实际打开自查，没有裁剪、调色或合成。普通对照与夜景为1710×931、DPR1、FOV50、Balanced、曝光1、blend1、加载结束且阴影pending=false。普通时间720，夜景0；bench-night文件的r1指保留的bench处理，所在场景使用bin R2。

普通图自评并经主协调独立复核：口沿／上段内壁、盖身分离接缝及底圈均可直接读出，提升不再只是整体提亮。开口处仍是暗部，未声称所有视角都能看清内胆底部。两张夜景中木材／漆面／裸边按原共享night系数收暗，没有给本组添加灯或自发光。

| 实际检查 | 结果与边界 |
| --- | --- |
| bench真实注册与E坐下 | fixture传送到原`street-bench-34`锚点附近，确认真实nearby=该座位，再通过实际E输入坐下；SitIdle后接触误差约`[9.16e-7,0,0]m`，未直接写seat来伪造成功 |
| bench实际E起立 | 再E后seat=null、Idle、grounded=true、movementLocked=false；原座位定位及Guide实现未改 |
| bin碰撞 | 实际Rapier玩家capsule shape-cast在受推前／复位后均首先命中`street-knock-bin-0`；这是形状检测，不宣称人工跑遍全部通路 |
| bin受推 | fixture在实际动态body上施加一次20Ns冲量，真实倾倒并水平位移约.263m；不是用户按键推撞或车辆碰撞录像 |
| bin原复位 | 不写phase／timer，观察home→knocked→fadeOut→fadeIn→home；knocked至fadeOut采样间隔30.002s。复位后水平偏差约4.8e-6m、落稳Y低约4mm，保留实际物理落稳值，未冒称全部坐标精确归零 |
| 动态合同 | 前／受推／后质量均16kg、localCOM约`[0,.300000012,0]m`、2碰撞体、未锁定；包络、原代理、L1、布局和复位实现均冻结 |

UI测试控件仅由本组开发配置注入，调用实际注册表与现有ActorDebug／Rapier body；传送和冲量作为fixture设置明确记录。昼夜图先拍，之后才做坐立／受推。自有配置编辑未被Astro自动热重载，核验原服务PID后串行重启同一服务，再载入同一页；没有并行服务。候选页控制台无error，保留Three.Clock与Rapier初始化的两条既有弃用warning。

有限成本记录：bin近景2180→4436tri，增加2256tri；原始属性／索引缓冲约增加162432B，未包含批次复制或完整GPU分配。原普通对照calls为293／293，textures为89／89；世界street名义几何摘要增加2256tri，其它注册根摘要一致。源上沿用原批次和物理槽，没有新纹理、材质实例、灯或逐帧更新，bench没有几何增量。`gl.info`是有限帧观测，不能从这些计数推导FPS或全岛性能。

14项源检查通过，R1原17文件证据仍通过；`verify_bin_r2_review.mjs`校验新图参数、实际交互合同、source/native哈希及受保护文件。生产源码3路径与7253ec6一致，8个公共shader／layout／adapter文件与ad7ee76逐字节相同。未重复全岛成本或生命周期矩阵。

清理完成：自有标签1395914331先Escape暂停后关闭，4350标签复查为空；核验PID72035完整命令为本组Astro4350后SIGTERM，wrapper退出143／finally按token释锁。未设置viewport override，未操作4341。后续集成／build／4341更新由主协调负责，本线未push、merge或部署。
