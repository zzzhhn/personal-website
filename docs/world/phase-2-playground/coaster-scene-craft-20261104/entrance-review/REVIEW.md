# 入口工坊、站台与短跨实景候选

同一 QA 构建切换基线 `9c23282` 和候选 `28735d4`。候选保留已审的入料台构造。工坊由矿物平台、七台设备、入口标牌和架空输送构成，站台檐梁和柱头承托一起进入对照。短跨在两档生成器中使用统一材质角色。

| 机位 | 正午原图 | 午夜原图 |
| --- | --- | --- |
| 工坊 | [基线](runtime/workshop-day-before.jpg) · [候选](runtime/workshop-day-after.jpg) | [基线](runtime/workshop-night-before.jpg) · [候选](runtime/workshop-night-after.jpg) |
| 站台 | [基线](runtime/craft-station-day-before.jpg) · [候选](runtime/craft-station-day-after.jpg) | [基线](runtime/craft-station-night-before.jpg) · [候选](runtime/craft-station-night-after.jpg) |
| 入口 | [基线](runtime/coaster-entrance-day-before.jpg) · [候选](runtime/coaster-entrance-day-after.jpg) | [基线](runtime/coaster-entrance-night-before.jpg) · [候选](runtime/coaster-entrance-night-after.jpg) |
| 总览 | [基线](runtime/coaster-overview-day-before.jpg) · [候选](runtime/coaster-overview-day-after.jpg) | [基线](runtime/coaster-overview-night-before.jpg) · [候选](runtime/coaster-overview-night-after.jpg) |
| 轨道短跨 | [基线](runtime/craft-short-bay-day-before.jpg) · [候选](runtime/craft-short-bay-day-after.jpg) | [基线](runtime/craft-short-bay-night-before.jpg) · [候选](runtime/craft-short-bay-night-after.jpg) |

工坊地面和入口构架在普通图最易区分。原先盖住铺地的抬高矿物平台现直接着色，灰暖水泥板缝在午夜仍可见。架空节点有了蓝灰外壳和浅钢夹板。设备裸钢和橡胶已进入实际角色，普通图中它们的差异弱于地面变化。站台改动主要见于檐底和柱头，正面白色大体量仍偏平。短跨正午能辨认柱脚、帽板及轨底重复接合，午夜青色灯带仍比鞍座醒目。真实乘坐画面与整场美术验收继续在后续阶段完成。

两边均沿用同一渲染设置，晴天、balanced、曝光 1、1710 × 875 framebuffer 和 JPEG、DPR 1。所有帧均为前景，阴影队列前后为空，资源加载无失败。基线读到 242 项资源，候选 248 项。候选出现反射材质程序，基线使用原材质。共享 PMREM 只给指定钢件提供受昼夜因子控制的反射。轨底、镀锌件和涂装结构在候选静态批内按材质恢复烘焙漫反射。

工坊普通机位各 130 次绘制，渲染三角面差为 2,873。站台各 113 次，差为 2,942。短跨各 73 次，差为 1,172。计数含渲染通道。40 项定向测试通过，近远结构与工坊固定接触一致。短跨每档 3,600 姿态及三种镜头净空检查通过。冷档耗时和 GPU 耗时待实测。[原始读数、源和证据哈希](receipt.json)

入口包包含工坊、活动载具壳体、标记的站台部件与铺地，回读 32 个对象、10,432 个三角面。短跨回读 7 个对象、1,288 个三角面。两包均做了 Blend 重开和 GLB 空场景重导入，尺寸和三角面一致。导出保留米制几何、分组和可编辑 PBR 近似，程序板缝与昼夜光照通过运行构建展示。[入口 Blend](native/coaster-entrance-workshop.blend) · [入口 GLB](native/coaster-entrance-workshop.glb) · [短跨 Blend](native/coaster-short-bay.blend) · [短跨 GLB](native/coaster-short-bay.glb)
