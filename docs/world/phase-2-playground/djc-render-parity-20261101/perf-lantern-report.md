# 十盏池边灯有限运行回执，2026-11-01

限定工作已完成：真实新GLB加载、正常近距新旧日间与新版深夜图、单段正常300帧、干净日床图。新版灯组未使用fallback，所拍底座没有明显悬空／埋地。图像是否达到最终交付要求由主协调实际审阅，本回执不代替审美接受；4341尚未更新。

## 候选与加载

已重算核对本目录 `build-final.json` 四项完整SHA256：HTML `bcfda3daf323ab68…`、WorldRuntime.DDEokzaR.js `663c946054e27abc…`、日床AO `99a0abd938b967d9…`、pool-lantern-v1.glb `8a8cd28f44fa9b2e…`。同包 `qa=1&djcLanterns=legacy` 对比，未改src/public、构建或资产。

`perf-lantern-new-a1-lantern-5.json` 及后续8／9记录实际新灯请求：decodedBodySize=1,318,580、transferSize=1,318,880。`djc-crafted-pool-lanterns` 存在，`djc-original-pool-lanterns` 不存在；4个材质实例批次之外的同名前缀visuals是容器，不计作第五个mesh。legacy记录无crafted灯组／无新灯请求，符合开关预期。

位置来源为生产 `DJC_POOL_LANTERN_POSITIONS` 的10个原底座，所拍一盏中心 `[60.843151,1.4,31.038906]`。GLB只有一个无额外TRS的mesh节点、四个primitive，几何本地最低Y=0、最高Y≈.77，故按既有摆放底面为worldY1.4、顶面≈2.17。该数值是资产／接入合同，照片用于核对可见落位，未穷举十处底面碰撞。

## 短帧时对比

| 条件 | FPS | p50 ms | p95 ms | calls中位 | triangles中位 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 前轮无新灯 `perf-after-b1-sample-2.json` | 60.0024 | 16.7 | 18.0 | 118 | 1,575,265 |
| 本轮十灯 `perf-lantern-new-a1-sample-2.json` | 60.0024 | 16.7 | 17.4 | 130 | 1,747,979 |

均为Daybed approach／Noon720／Clear／Balanced、shot=null、seat=null、mode=always；CSS1710×931、实际buffer1951×1062、DPR1.1412731405。跳过30帧后记录300个不同render frame ID，GPU ms=null。新灯增加实际提交与面数，本机此有限视角短样本仍约60FPS；不能声称新增几何没有成本或p95差值证明性能改善。未重测legacy性能或其它玩法。

## 照片与机位

- `perf-lantern-refined-noon.jpg`：新版日间，正常V第一人称近距，外框、扩散板纹理、底座可见。
- `perf-lantern-refined-midnight.jpg`：完全相同相机的新版深夜，night=1，发光面呈暖色。
- `perf-lantern-legacy-noon.jpg`：同包旧灯、同一盏／同朝向／同FOV及buffer的日间对照。
- `perf-lantern-daybed-noon-clean.jpg`：原有Close固定机位、日床材质修复的干净正午图，不是性能采样。

全部使用本机QA壳的 `Hide QA 8s` 临时隐藏覆盖层后截图，未改产品界面。JSON证据保留。

新版近景由安全高处落地后真实步行靠近，再正常按V两次进入第一人称；grounded=true。新灯日／夜相机均 `[61.484539,2.319702,29.414685]`，yaw=-π/2、pitch=.12。旧灯通过新增壳按钮在相同目标落点布置，落地沉降后相机 `[61.456413,2.307475,29.343957]`，相差约.077m；方向、FOV和buffer相同，但**不是严格像素级相机对齐**。未为几厘米误差扩展调试。旧灯／新版实际位置与相机见相应lantern JSON，探索构图snapshot-4／6不作为最终近景。

## emission与日志

资产原生diffuser材质 `DJC_Lantern_Diffuser_Runtime` 的emissiveFactor约 `[.001,.000552,.000188]`，extras明确 dayEmissiveIntensity=0、nightEmissiveColor=`#ffc478`、nightEmissiveIntensity=1.4。生产clone随后按role覆盖颜色，运行公式为 `day+(night-day)*night.value`。照片对应JSON的night=0／1，因此公式目标分别为0／1.4。**这是实际资产数据＋源码公式＋页面night状态的证据，不冒充直接读取了GPU材质uniform。** 没有为此改产品debug接口。

`perf-lantern-console.json` 保存本次读取的最多8条warn/error，error计数0；可见Three.Clock与初始化参数弃用警告（捕获范围包含先前同tab记录），不等于完整运行全程零错误。

## 收尾

预检memory warning、swap9.65GiB、disk8.19GiB；只复用Chrome2／tab1395914218、一个静态服务，没有并行本任务重工作。QA壳仅增加定位、有限JSON和临时隐藏控件。

完成后同页legacy设置暂停、markHandoff，停止自有4356/PID46673；核对owner `performance-lantern-01a171f1` 后释放文件锁。未新开实例／标签、未推送／部署或修改4341。已把全部图路径和结果交主线，等待审阅和promote指令。
