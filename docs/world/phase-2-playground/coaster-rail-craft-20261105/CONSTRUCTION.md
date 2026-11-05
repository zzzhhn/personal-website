# 整圈轨道构造候选

基线 `5b8ef64`。本模块只返回世界坐标视觉几何，接口为 `createCoasterRailVisualCraft(detailed)`，四个 indexed 批次：`runningSteel`、`coatedSteel`、`jointSteel`、`concrete`。没有修改原路线、坐标架、物理生成器、灯光或动画；物理一致性及实际接入由主会话独立检查。

| 部件 | 真实构造 | 材质与映射 |
| --- | --- | --- |
| 双钢轨 | 原六边形截面；near 仅两侧尖角内切 6 mm，形成八边截面；far 保留六边；截面邻面共享顶点，运输方向连续法线 | 裸运行钢，U 按全程米制距离，V 按截面周长；闭环 UV 有制造方向接缝，位置与法线闭合 |
| 主脊梁 | 保留 `coasterSpineProfile`，四角内切 18 mm，底部两条窄折边分材质；near 仅样段与站房附近 4 个 1.3 m 短带侧壁内收 8 mm，嵌入 0.8 m 接头板，顶底承载面不改 | 大面蓝灰涂层，窄边和局部接头板加工钢；纵向米制 UV |
| 轨枕 | 单个封闭 I 型挤出，上下翼缘与窄腹板形成实际负空间，删除相交盒体内部面；原 cadence、两档数量与 tightRun 弦宽保留 | 蓝灰涂层；两个薄钢座片贴合简化后的轨道下承载平面 |
| sample 斜撑 | 每条原 rail-to-spine 方撑逐根保留，仅竖边内切 | 蓝灰涂层；长向 UV |
| 立柱、横梁、斜管 | 每根原 beam 的端点、长度、半径包络与各档数量保留，near 12 边、far 8 边管；管侧与锥肩圆周法线平滑，独立端盖保持硬边，不加径向细分；near 两个邻近支点各三处实际短焊套 | 蓝灰涂层；沿管长与连续圆周米制 UV；局部加工钢焊套外半径不超过原 radius×.998 |
| 柱头与基础 | 柱头锥肩、短轴承套、原位置轨道鞍座；2.5×1×2.5 m 旧基础包络内分台身和顶帽，灌浆与金属基板分开；near 仅短 sample 与站房邻近支点保留少量六角地脚 | 四批复用；far 保留肩、套、基板、灌浆和矿物体量，省略地脚 |

保形简化从原 `coasterRailSpans` 出发，强制保留三段边界，逐个验证所有原 ring 的双钢轨六角及主脊梁四角共 16 个探针。near 最大插值误差 4.994 mm，far 14.729 mm；最大弦长均为 3.395 m。附加姿态 slerp 误差为 0.00430 / 0.01155 rad。原碰撞仍须由旧生成器生产，不能用这些视觉近似代替。

| 档位 | rail | spine | tie，含 sample 斜撑 | support，含节点基础 | 总三角面 | attribute＋index 字节 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| near | 76,160 | 38,744 | 53,064 | 43,660 | 211,628 | 9,769,424 |
| far | 33,504 | 22,336 | 30,760 | 16,272 | 102,872 | 4,584,912 |

两档均 4 个材质批、0 个 groups；`groups=0` 表示每个 BufferGeometry 直接使用单一材质，并非没有四个绘制批。以上字节只计真实 typed attributes 和 index，不计 JS parts 元数据、纹理、PMREM、阴影或完整场景，不能当运行内存或性能结果。

第一轮真实网页复核后，针对立柱硬切面与主梁缺少接头层次做了一次有界修正，第二版 near 曾为 214,468 面，较首版增幅 0.684%。随后仅修复网页近景发现的柱头重复盖面，第三版最终为上表数字，near 较首版 213,012 面减少 1,384 面。圆管相邻侧面同位顶点法线差为 0；焊套全顶点没有超过原 beam 半径及端点范围。拼接带新增部件相对原截面最大外侧差为 float32 的 0.0147 mm，最大侧壁内收 8.015 mm；顶底承载面及原路线保持。该局部侧壁与原碰撞面存在约 8 mm 的授权视觉内缩，不能声称处处完全贴合旧物理表面。

第三版删除被柱头完整包住的原柱管顶盖及肩部顶盖，接触面只留套环一张盖；三段焊套只保留实际外壳，去掉埋在管内和相邻段之间的重复内部盖。没有挪物理端点，没有扩大包络，没有使用 polygonOffset。窄检查从真实 index 逐平面计数：near 248、far 144 个柱顶及肩/套交界平面都只剩单层盖；near 另删除 360 个内部焊套盖三角面。立柱管、肩及焊套单独对象因省略内部盖而有意开口，其组合遮盖仍完整；这些对象不是碰撞输入。

窄验证已覆盖有限坐标、单位法线、非退化三角面、法线/绕序一致性、原 cadence、每根 beam 和每侧基础数量、闭环位置/法线、tightRun 本地 X 轴宽度。near 座片中心与真实下承载面最大误差约 0.064 mm，轨枕 X 弦宽最大 float32 误差约 0.029 mm。25 个 sample 截面射线与旧可见面的最大差异：主脊梁 4.319 / 11.414 mm，运行钢轨 4.261 / 11.828 mm，分别对应 near / far。它们是几何近似测量，不是物理、净空、实际阴影或用户视觉验收。

复现命令：

```sh
node --experimental-transform-types tools/world/coaster-rail-craft-20261105/inspect-and-export.mjs --report tools/world/coaster-rail-craft-20261105/geometry-check.json --source tools/world/coaster-rail-craft-20261105/representative-near.source.json --centre .265 --half-length 16 --lod near
```

代表段 source 是真实 runtime 生成器的具名部件与 UV/normal/index 快照。`build-native.py` 据其创建可编辑 `.blend` 和 `.glb`，Three Y-up 到 Blender Z-up 只转换一次。Blender 5.1.2 已在授权串行槽内以 threads2、无渲染运行，覆写现有代表段文件；明确关闭保存备份，没有创建 `.blend1`。第三版源 JSON 1,067,098 字节；原生文件 268,935 字节；GLB 357,084 字节，130 个具名可编辑对象、5,492 面、4 种材质。`verify-native.mjs` 直接检查 GLB 与源 JSON 的边界差为 0，法线与 UV 存在，法线单位长度误差小于 1.3e-7；文件哈希见 `tools/world/coaster-rail-craft-20261105/native-export-check.json`。

脚本不重建外观，不修补拓扑，不做渲染；自带四种 Principled 常量仅用于离线检查，真实游戏 PBR、材质贴图及环境响应由主会话负责。没有做 Blender 重导入视觉检查、开启浏览器、构建、部署、提交或 push。首次修正后的真实网页日夜视觉与性能仍由主会话检查。

第三版生产 rail、transfer、cache 的 11 项回归通过，原物理/旧投影字节、worker 转移及缓存释放均按主会话测试验证，日志为本目录 `contract-tests.log`。测试使用仓库现有 extensionless-import loader，命令如下：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/attractions/coaster-rail-craft.test.mjs src/components/world/attractions/coaster-structure-transfer.test.mjs src/components/world/attractions/coaster-structure-cache.test.mjs
```
