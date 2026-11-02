# 第五批十四项交接，R10

街道八组、营地五件和G17 R3共十四项已经完成制作与限定返修，主协调已接受各指定昼夜机位。C13采用R7细滚花版本，C15采用R9轮胎接触版本，其余已审设施和G17保留原有实际图像身份。主协调仍负责最终集成和发布决定。被否决地表R4不在十四项默认产品中，`WorldTerrain.tsx` 与基线 `2f22560` 字节相同。

工作树 `personal-world-craft-batch5`，分支 `codex/world-craft-batch5`。最新生产源码为 `6ffeeeb53a8c720905b7df72dee83beed077437c`，冻结包 `/tmp/bobby-world-batch5-r10-fourteen-01a19a62`。后续证据提交不更改该包。`build-r10-fourteen.json` 记录60个文件与12份源码身份，主协调和独立性能会话均已核对两树匹配；`entry-graph-r10.json` 确认真实HTML入口递归30个本地JS引用无缺失。8页面构建14.76秒。R6错误overlay包保留为不可启动历史版本，R7以后只使用资源白名单，不复制旧HTML或生成模块。

`facilityCraft=legacy` 完整刷新回退十三设施与G17；`natureCraft=legacy` 的全局自然回退优先级保留。没有改动布局、座位点、物理hull、质量、阻尼或原灯池。R10只给坐姿相机加入有碰撞检查的15厘米安全起点，不移动人物或座位。

## 实际视觉与行为

`review.html` 采用已审版本：C13 R7、C15 R9、其余R4，不把历史图片改称R10重拍。39张离线原始／原生／fresh图片属于最初构造记录；C13后续原生源和GLB另有身份，不冒充重新渲染。原生工程和具名几何源仍在 `tools/world/facility-craft/`。

C15当前轮底clearance为0，其他道具和legacy仍为4毫米。接触辅助仅四片小面、1 draw、8 triangles，无新贴图、灯或shadow pass。实际W轻推500毫秒后箱体偏移并倾倒，等待30秒后回到原位，睡眠稳定。`camp-contact-r9/runtime/` 保存位移、普通镜头和复位低角度截图及原始读数。可见区域没有残留接触印迹；倾倒箱体遮住部分旧接触点，没有声称四点都在图中可见。主协调结合28项测试接受了此覆盖边界。

R10在同一候车亭用原生E坐下，再从开放-X侧普通相机明确看到坐姿。实际相机距离11.911米并收敛到12米，guideHidden=false，无near-overlap，人物座位点仍为原值。再次原生E起身后seat=null且grounded。`runtime-r10/r10-shelter-sit-visible.png`、`r10-shelter-stand-visible.png` 及两份snapshot留证，R9 distance0失败记录没有删除。相机定向测试9／9、营地接触及街道测试28／28通过。独立会话已实际串行查看坐／站原图并接受相机可见性，不扩大为人体坐姿动画美术或全地图物理验收。行为图片为JPEG字节、1710×875，保留原`.png`文件名和SHA；行为图尺寸不替代性能窗口的1710×931门槛。

其余实际机制沿用原版本收据：4件营地展品真实E反馈／恢复、长椅坐立；G17在31.5／32.5米切换L0／L1，35032／8122 triangles；四通道风与depth／distance绑定，普通相机36真实帧、0.5997秒风钟推进。没有新增未拍摄的车辆撞击／复位试玩结论。

## 成本与R10固定六窗

当前10个新GLB合计3,134,780 bytes，其中8个街道portable文件不参与网页下载。营地包1,441,740 bytes、32132 triangles；实际双哑铃场景按实例计36920 triangles。G17为587,904 bytes、1560叶／255可编辑件、2材质与3张256×512原创树皮贴图。7份旧GLB已对冻结基线核SHA不变。材质绑定复用既有cache，去掉重复shadow请求。

R10唯一一组旧A→候选→旧B固定六窗全部有效，没有重采或第七窗。均90真实帧预热＋300连续测量帧、10至20秒settle、至少60帧计数稳定，visible／always、静止落地、Balanced／Clear／Noon720、1710×931 DPR1、无shot／seat／card／clubMode。各窗五项计数恒定、无shadow pending，相机和人物漂移≤0.0001米。

| 位置 | 旧A FPS／p95 ms | 候选 FPS／p95 ms | 旧B FPS／p95 ms |
| --- | --- | --- | --- |
| 营地 | 59.4059／17.4 | 59.9988／18.1 | 59.9880／17.5 |
| 街道 | 59.9796／17.8 | 59.5711／17.3 | 60.0024／17.6 |

旧A营地57ms和候选街道58ms各有一次尖峰，完整保留。旧A/B跨加载几何计数不同，营地triangles为621902／644686，街道为544799／560413，资源缓存计数也不同；不能把各窗稳定写成跨窗场景完全相同，或把结果孤立归因于某段代码。GPU时间为空。独立判读现已完成，结论为足够支持本机本地候选试玩，不代表全岛稳定60FPS、严格等载的资产净成本或零开销认证。报告与逐帧重算见 `runtime-r10/independent/FINAL-R10.md` 和 `final-audit-r10.json`，保留原SHA及canonical重放脚本路径。正式集成和发布仍由主协调决定。

首窗已保存且有效，但执行器regex完成检测误报超时。主协调与性能会话独立核对后批准保留首窗，只修literal精确回执读取，继续原剩五窗。首窗保存至第二窗准备相隔679.306秒，审阅间隔保留，不称无间断ABA。候选及旧B首载入的短控件等待超时均发生采样前，没有触发或补采窗口。全部raw、SHA、执行审计与异常说明在 `runtime-r10/`，与canonical coordinator/performance/runtime逐文件同SHA。

## 地表、恢复与取用

独立地表修复在 `personal-world-ground-shoulder`／`codex/world-ground-shoulder`。源码补丁 `d46435d` 默认关闭，仅 `groundShoulder=1` 开启；主协调已接受两张实际正午方向图，夜间、风动／踏压和成本后续QA尚未完成。它不混入本十四项冻结包，不把正午方向接受写成完整通过。

R10执行完毕后原用户标签已恢复 `http://127.0.0.1:4341/world/?start=camp&quality=balanced&paused=1`，中文暂停菜单有DOM和实际截图；临时viewport override已reset。恢复时DOM仍含初始加载提示，因此恢复证据只确认原URL与暂停菜单，不作为R10已交付4341或完整加载验收。核对owner及PID18927完整命令后仅停止自有4359服务、释放heavy lock。4341和其他标签／服务均保留，未推送、发布或切换稳定服务。详见 `runtime-r10/executor-cleanup-r10.json`。

更早构建、失败、图像和数字见 `RESULT-R5-HISTORICAL.md` 与各相邻版本文件，保持原始身份，不作为新包重测。取用生产改动与集成由主协调完成；本次只交付源文件、原生工程、GLB、冻结包和可复查证据。
