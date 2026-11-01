# 灯具 r2：只修木材 tint 和 AO 生成

候选：`pool-lantern-r2.glb`。SHA256：`30022ad90d063a6d267f07c69dc1e42b76bb93d702d19b3f00ffb0212789fbbe`。文件 1,358,944 bytes，内嵌贴图 505,283 bytes。

木材去掉了 r1 的 `[.346704,.223228,.138432]` 额外乘数，改为同源日床木材的缺省 `[1,1,1]`。照片木纹色图像素没有改变。织物 baseColor、normal 图及 scale=.48、roughness=.92 均保留。

AO 从生成方式修复。现有 UV1 不重新展开，使用显式 Ambient Occlusion 节点，Distance=.06 m、Only Local，scene 256 samples、node 16 samples，烘焙 EMIT 得到几何 AO。所有检查灯架和 RIG 地面在烘焙时排除；没有手绘漂白，没有降低导出的 AO strength，仍为 1。图像仍为 512 px，边距 3 px。

先实际查看了 `lantern-r2-ao-only.png`：灯罩中心平顺近白，框边保留接触渐变；然后才导出和渲染 `lantern-r2-day-fresh-glb.png`，并直接读图。木材构造可读性明显提升，未引入新灯或全局曝光修改。网页材质效果与用户接受仍待主线验证。

| AO 检查 | r1 | r2 |
| --- | --- | --- |
| 同一外侧区域，1,116 个实际 GLB atlas 像素，均值 | 119.20/255 | 243.16/255 |
| 同一区域 5 px median 高频残差标准差 | 10.35/255 | 0.91/255 |
| 严格中心的三角面中心样本均值 | 未用该采样器统计 | .99325 |
| 严格中心 5 px median 高频残差标准差 | 未用该采样器统计 | .00130，约 0.33/255 |

较宽区域包含框边有意保留的低频接触渐变，其总标准差不等于噪声。`r2-validation.json` 分别记录中心与较宽区域；`r2-contract-validation.json` 使用 r1/r2 相同像素区域做独立比较。

最终 GLB 的每个材质 primitive 中，POSITION、NORMAL、indices、UV0、UV1 与 r1 逐字节相同，仍为 11,304 三角形、4 材质／primitive，尺寸与原点不变。原始木材／织物色图、normal 像素与 roughness 通道也逐像素相同。没有传输材质或灯光导出，diffuser extras 保留。

`pool-lantern-r2-editable.blend` 保留原生 54 个部件及 runtime 副本。脚本为 `tools/world/djc-pool-lantern-craft/build-r2.py`；先运行 `run.py --r2` 烘焙和 AO-only 审图，再运行 `run.py --r2 --finish` 导出及 fresh 日间检查，最后 `verify-r2.py` 做二进制和像素合同验证。每次重任务均使用资源预检、同一原子 FILE 锁、CPU 3 线程。

r1 的 GLB、原生源、原生／fresh／close／evening 图、网页 Noon 图及原脚本哈希已保存在 `../r1-archive/`，没有覆盖网页证据。木材 CC0 来源及授权沿用 `../texture-sources.json`，r2 AO 为当前原生几何的原创烘焙结果。

接入实际使用每材质一个 InstancedMesh，10 盏预计约 4 个主通道批次；性能结论由主线运行测量，本包不声明 FPS 改善。
