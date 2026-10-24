# 全岛可玩候选 · 2026-10-24

## Status

80 个既有稳定 ID 均已实现并接入候选，Hy3D 关闭。此为整岛试玩交付，**不是整体动作、美术或 Bobby 体验验收通过**。运行时代码基线为 `fb6c613ef6ab096391d9f73a5ec7039ba1958340`；后续文档提交不改变运行时。

## Result

六楼按现站履历源映射，园区六展品、课程翻页、双语内容卡、营地座位及街道物件接入；三车为 L1 正式模型，保留重量、惯性、睡眠动态道具与恢复。G10/G11/P04 共用生成器，P05/P19/F04 为同族木牌，G28 局部入口只打开既有菜单。没有复制 GTA 地图或素材，没有修改冻结目录或现站其它页面。

人物增加 CMU/100STYLE 来源与署名、有限惯性化和坐姿收口。P16 镜头区分安全碰撞枢轴与身体取景，气泡固定屏幕字号并限制在视口内。海保留平直波面，近网格0.35m；连续法线仅归档候选。

性能采用逐楼 LOD、原生 LOD1 的中远级联车影、真实相机裁剪草。近景树叶、车体几何、太阳 atlas/PCF 未降档。园区移除已确认的旧 spur 重复视觉并补33cm木石交接，原碰撞数组哈希未变；仍有局部砖/板缝观感残留，见盲审。

## Verification

| 实测 | 结果 | 证据 |
| --- | --- | --- |
| 80项 Markdown/JSON | 80/80一致；当前主GLB哈希一致，执行一次 | [inventory](inventory-final.json) |
| 类型 / 构建 | Astro 253文件0error/0warning；生产构建成功 | 仓库外 astro-publish.log / build-publish.log |
| v4受影响驾驶/恢复集合 | 21/21，0页面异常；随后视觉修复保留物理数据 | final-route/report.json |
| 普通入口真实游玩 | 136/136行走段、8机位、187.058秒1080p录像；无QA/传送/静止补时 | [tour](final-tour.md) |
| 最终预算 | 22个玩法视角＋5组150帧切换；静态峰值235calls/453093tri，动态峰值240calls/492281tri；含所有投影 | publish-budget/budget-report.json |
| 对账 | 所有固定采样calls/tri与gl.info逐项一致；6盏point light | [机器摘要](final-verification.json) |
| 草裁剪A/B | 三机位像素差0，节省14430–25710tri；转镜头无实例空帧 | evidence/motion-followup/grass-cull/ |
| 车影LOD | 3车18距离采样通过；主画面body geometry正确恢复、轮矩阵一致 | vehicle-shadow-lod/lod-check.json |
| 接缝受影响短走 | 5/5；原铺装物理数组SHA256 `aef1bed6dd101a6501f8d077d7c0e26159f5f538746ee74ecbbcdb6d824363ad` | [plaza](plaza-seam.md) |
| 100Mbps冷启动 | 覆盖层就绪4156ms，首次观察到真实移动5067ms；绘制缓冲1920×1080 | final-load/load-report.json |
| 实际传输 | 就绪10047896B，资源静止10294472B；未开gzip，不拿gzip估计验收 | 同上 |

完整原始日志、录像、轨迹在 `/Users/bobby/Desktop/3D-personal-world/evidence/integ/`。表中区域预算按同帧总线流动使用；probe里的旧分项计划不是新的独立验收线。各区在不同机位的独立峰值不能相加。没有抬高300calls/500k硬线，也没有作M1帧率认证。

本地普通入口与生产静态测量均保留 `/api/events`404及对应Console error。生产冷启动另记录18次cancelled/ERR_ABORTED资源请求，后续资源静止、真实移动均完成；因此不称网络全零。Cloudflare函数与发布字节在推送后单独核验，不用本地缺端点冒充线上通过。

## Handoff

- 动作仍有旧起步/切换滑移及坡地浮空/下陷未关，见 [人物交接](../character/FINAL-HANDOFF.md)。坐姿局部数值通过不能覆盖它们；隔离动作候选1310201也未通过完整起步80mm，未合入本版。
- [独立盲审](visual-review-20261024.md)认为可探索性试玩，未判视觉完成。两张接缝补图显示明显改善，但仍有斜向浅条/木缝残留；城区与桥面暗部、水面反射形状及材质尺度继续保留为观感项。
- G27轮胎理想圆柱诊断仍有2.11cm残余；不是全速度/全物体零穿入。M1 Air、Safari、实物手柄与Bobby接受未验证。G28保留原无阻挡触发例外。

给 Bobby 的亲手复核只需三点：整岛第一眼与夜景是否愿意继续探索；走跑跳、镜头与三车惯性是否顺手；从六楼到六展品的内容/交互是否自然。不上main、不合并PR、不手动部署；回滚用分支上明确提交的revert，保留证据。
