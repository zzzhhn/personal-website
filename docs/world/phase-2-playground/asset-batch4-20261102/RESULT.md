# 第四批候选交接（R2）

执行 checkout：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release`。分支 `codex/world-craft-batch4`，起点 `362e68d`。本轮产出供主协调审阅和逐文件集成，未覆盖共享集成树、未切换4341、未推送或公开部署。审阅入口为 [review.html](review.html)。

## 六个家族

| 家族 | 完成内容与实际复用 | 成本和边界 |
| --- | --- | --- |
| 石群 | G21/G22/G23，营地外圈、岩台与海墙端点；保留断裂／台阶／倒角，增加按面UV、CC0矿物响应、横向层理和接地暗部 | 620／496／376三角，实际原几何不增加；3种变体不另计家族 |
| 地表 | 原有草／沙／泥PBR，修正旋转采样法线方向，收敛草纹理尺度，细化覆盖交界 | 仍18次纹理读取，无新纹理或绘制；R2修复helper外推权重非法域 |
| 草丛 | 窄根、杯状叶肩与扫弯叶尖 | 仍45顶点／15三角，采石场花草属性ABI、风、车辆／人物扰动、草痕与恢复代码保持 |
| 树木 | Camp G16/G17/G18与低地ST1/ST2；加深原叶片中脉折面和根尖色层 | 所有树干、叶柄、叶尖、根矩阵、包络、四通道风属性和LOD拓扑保持；无新纹理，Street仍每树种／LOD一次实例化绘制 |
| 海水 | 保留四组Gerstner大波，补0.4m小波尺度、打开岸泡间隙、区分泡沫粗糙度 | 无新pass、实时倒影、灯或纹理调用；水位、CDLOD、岸距、角色扰动与清晰区保持 |
| 营地展示架 | C09，独立木板与背板、板间连接和齐平木销；连续杯壁、口沿和附着把手 | 导出6种材质／6个primitive、6,916三角，原版1,832；原位与原物理GLB保留，空白奖牌不添加虚构经历 |

九份实际运行GLB合计 **2,213,936bytes**，对应旧资产1,030,956bytes，增加1,182,980bytes。另有5,520bytes草丛GLB供检查，网页仍按相同公式生成草丛，不把它虚报为额外家族。分项见 [asset-costs.json](asset-costs.json)。石材贴图512px、roughness256px，木材512px；未靠升高分辨率扩批。

## 原生、导出与真实网页

可编辑源位于 `tools/world/nature-craft/blend/`，10个独立 `.blend`；脚本为同目录上级的 `build_props.py`、`build_trees.py`、`render_clay.py`。导出在 `public/assets/world/nature-craft/`。原始源文件和原位Camp／Street GLB未修改。石材和木材来源、哈希、许可及适配说明见 [props-sources.json](props-sources.json)；原生均打包必要纹理。

三种石群、展示架、草丛、G17及ST1有同灯架旧／native／fresh图；五树另有原米制总览。树的全五种 `--verify-only` 通过，所有有面顶点的位置／风权重、颜色、树干、根与L1几何均核对。ST1／ST2原始L1-crown各有68／48个不参与面的孤点，原生保留；fresh检查没有把孤点不存在冒充可见几何丢失。石群及展示架fresh在焊合UV／法线接缝后均为闭合几何；草叶开放边界为有意双面叶片。C09原生保留未应用倒角，fresh三角数以实际应用修改器后计算，不拿原生面数替代运行成本。

R2网页实际拍摄7个固定机位的正午／深夜，共14张图：石群、营地树、展示架、内陆地表、低地树、当前岸线、近海。所有实际buffer及CSS为1710×931，DPR1，Balanced／Clear，正午720／午夜0，时间停止，night距目标小于0.001；相机位置、目标、FOV和角色落点见 `views.json` 与对应JSON。照片未调曝光或后期。艺术机位的角色落点只是QA定位，不冒充沿路徒步到达。

岸线和海水的legacy图在R2同包重新拍摄。其余固定legacy模型图复用R1同机位基线，旧分支完整shader逐字一致，所有相关原GLB和10份新GLB在R1／R2哈希完全相同；R2只修新地表分支。R1原始legacy记录在 `runtime/baseline-r1/`，不伪装为R2新拍。R1拒收候选图和性能在 `runtime/r1-rejected/`，没有混入最终候选或性能表。

R1首先发现石材导出丢失色因子，已在原生制作阶段改为glTF可识别的共享矿物贴图乘顶点色，并重拍fresh。随后真实网页又发现地表黑缝，CPU边界测试与同包legacy对照定位到fractional pow对helper负外推权重产生NaN，经sandWeight／groundBump导数传播。R2先将新分支权重非负化并安全归一化。主执行实际打开R2原黑缝机位、岸线、地表及代表夜图，未再见黑缝。没有改地形、碰撞、全局曝光或灯光掩盖它。

## 有限真实互动

R2在普通海岸草地用原生W移动约3m：原位置草痕0.947→0.813→0，最后只剩当前脚下草痕。`candidate-n-grass-trail-*.json`和 `grass-{before-walk,after-walk,recovered}.png`保留操作和恢复。没有直接写入草痕纹理制造通过。

R2用原生S穿过G19：传感器0→1→0，阻尼记录存在，verticalImpulseTotal始终0；保存before／inside／exit／recovered图及对应JSON。树和海的普通运行0.6s窗口分别前进36个真实render frame，非静态摄影模式，motionInventory保留风和阴影属性。海面同一正常相机两张图另有局部像素变化记录；截图间隔与0.6s时钟窗口分开记录。没有通过直接修改位置之外的互动状态伪造结果。

原营地碰撞从固定 `/assets/world/camp/${id}.glb` 独立读取，视觉替换不再把新展示架网格自动当碰撞。倾斜石群的放置包络也使用原源。Street树干源和全部实例变换保持。没有修改驾驶、座位、游泳、水位或地图；本轮没有通关这些玩法，也没有人工穷尽每个树干或34m LOD交界。

## 性能与验证

每窗90个不同render frame预热，随后300个不同frame；正常步行相机，正午／Clear／Balanced，1710×931实际buffer／CSS、DPR1。最终配对相机及角色位置误差小于1e-5m，yaw／pitch／distance／FOV一致；采样期间没有截图或操作。

| 正常视角／模式 | 聚合FPS | p50 ms | p95 ms | max ms | >33.4ms | calls／triangles（窗内） |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| n-camp／candidate | 60.000 | 16.7 | 18.0 | 20.6 | 0 | [[178, 677521]] |
| n-camp／legacy | 40.446 | 20.1 | 47.5 | 120.3 | 52 | [[180, 676267]] |
| n-water／candidate | 60.001 | 16.7 | 18.0 | 19.5 | 0 | [[33, 123375]] |
| n-water／legacy | 60.001 | 16.7 | 16.9 | 19.1 | 0 | [[33, 123375]] |

最终四窗内计数各自稳定，before／after几何、纹理及program数量也分别保留。近海配对均为33calls／123,375triangles；营地候选178calls／677,521triangles、旧版180calls／676,267triangles。这是整场含阴影计数，不能当单个资产成本。

旧营地首次窗口在预热前后有几何345→370及约2mm相机收敛，已单列在 runtime/settling-legacy-camp/；该窗约59.99FPS、p95 17.6ms，没有混入最终表。完全稳定后旧版补测却降至40.45FPS、p95 47.5ms，保留这一异常而未反复刷分。此事实显示本次时序窗口存在显著波动，无法将候选／旧版差异解释为材质的独立因果效果。没有GPU计时、热状态控制或随机化重复，不能据候选约60FPS声称零成本、更快或全岛稳定60FPS。

完整相机误差、逐帧原始数据、分档和资源计数见 [runtime/summary-r2.json](runtime/summary-r2.json)。

29项定向检查全部通过，命令与输出见 [tests-final.txt](tests-final.txt)。覆盖完整legacy材质一致、252个地表边界外推lane、草丛ABI／有效三角／旧分支一致、草痕上传、既有Camp物理GLB哈希／600mm坐面接触、共享材质与已接受家具。正式Astro构建通过；12项冻结HTML／JS／GLB HTTP哈希读回匹配，见 `build-candidate.json` 与 `runtime/http-readback-r2.json`。有界12条浏览器warning/error读回保留为 `runtime/browser-warnings-r2.json`，不能扩大为全局控制台永远无错。

## 集成与保留

运行源码修改为 `WorldCamp.tsx`、`WorldGrass.tsx`、`WorldStreetTrees.tsx`、`WorldTerrain.tsx`、`WorldWater.ts`；另更新 `camp-craft-visual.test.mjs` 的物理源守卫，使其继续明确指向固定原GLB。新增生成脚本／可编辑源／GLB及本目录文档。主协调按这些精确路径集成，不覆盖其它角色或资源盘点目录。

最终候选为 `/tmp/bobby-world-batch4-r2-01a19a62`；R1包 `/tmp/bobby-world-batch4-01a19a62` 仅为拒收和旧基线审计，保留到主协调审阅结束后再由任务所有者清理。重开QA须先资源预检和取得独占FILE锁，再运行 `python3 docs/world/phase-2-playground/asset-batch4-20261102/serve.py /tmp/bobby-world-batch4-r2-01a19a62`，端口4357。普通候选也可直接按静态构建服务，不需要QA注入。

剩余限制：主协调／用户尚未对本候选给出最终美术接受；全岛、不同设备、长期热状态和GPU分项成本未验证。Street LOD几何与参数保持并通过源／导出检查，未把它声称为人工走遍所有切换点。临时服务、锁及原用户标签页恢复情况见 [收尾记录](CLOSEOUT.md)。
