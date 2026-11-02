# Bench／bin 小组：轻量源制作

状态：**R1 已完成原生导出和两对普通视角实拍，自评 bin 增益仍弱，继续独立返修，不建议集成。** 基线为 `ad7ee76d68ce240d9ed8e4f1657a5e637e62700c`，即已审的hut／shelter方案及一次性贴图完成唤醒。原设施工作树和主协调集成候选未修改。实拍与当前判断见 `R1-REVIEW.md`。

工作树：`personal-world-craft-batch6-bench-bin`；分支：`codex/world-craft-batch6-bench-bin`。稀疏检出源／既有设施工具，node_modules与public资源借用现有链接，没有复制纹理或依赖缓存；本组新portable输出使用独立真实目录。导出与4350预览均在共享锁下串行完成，自有标签／服务器已关闭，锁已释放。

## 构造与材质

| 部位 | 当前构造与本轮处理 | 运行路径 |
| --- | --- | --- |
| bench座／背木条 | 沿用1328tri的实体木条、边厚、腿／撑／扶手；木纹沿X，端／侧面独立选择投影轴，使用已审.7×.3185546875m共享木包 | 原Builder → WorldBenchBinSurface负slot／制造UV → 原StreetStatic／StreetMaterial |
| bench漆面与裸金属 | 保留原颜色与几何，按物理身份分paint／bare metal；不往每条腿添加独立贴图或灯 | 同一原批次及R2共享shader／night／环境缓存 |
| bin桶体／顶盖／铰链 | 沿用2180tri的闭合内外桶壁、开口、顶盖、加强筋／铰链；漆面与金属圈／轴分slot | 原Builder → 新表面适配 → 原StreetKnock／StreetMaterial |
| bin内腔挡板 | 完整保留mouth.inner-baffle的旧slot0／roughness／metalness及暗响应，不把反射方案扩到内腔 | 原材质路径 |

没有改变布局、座位、碰撞、质量／COM、动态复位、远距阈值或LOD。L1全部原数组保持字节／值一致；近远外观衔接仍需之后实际查看。没有宣称旧构造已新增建模细节，也没有为每种物理表面复制三张图。

局部对照查询用 `benchBin=baseline`，仅关闭本组适配，保留已审hut／shelter基线。不要用会同时关闭上组的 `craft6=baseline` 冒充本组独立对照。

## 已验证

- 原street construction 5项、R2 surface／ready／glass 6项、本组2项，共13项通过。
- 新组开关前后，两级position／normal／color／index／parts／原hull及bench座位值一致；全部其它street族属性一致。
- bench木纹U随X变化；每个wood三角面的UV面积均非零，重复tag结果稳定；bin暗挡板材料属性完整保留。
- 提取源和manifest位于 `tools/world/facility-craft/batch6/next-bench-bin/`，状态明确为wired-source-only-unrendered。8个protected source文件与ad7ee76逐字节一致，覆盖动态／静态adapter、batch、layout、共享Surface／Park／StreetMaterial。
- `build_bench_bin.py` 已执行：bench／bin为1328／2180tri，fresh-import包围盒最大偏差均为0，详见 `NATIVE-EXPORT.md`。portable不能代表运行时night／环境／fade及轻微paint变化。

## 下一步与边界

重型窗口由主协调／自然线串行安排。已完成两族native与普通距离精确前后对照；本轮普通视距变化仍弱，先修本组，不扩其它族。小屋／候车亭的已审方案及生命周期证据不重拍。

可重复的提取与导出命令：

```sh
node tools/world/facility-craft/batch6/prepare_bench_bin.mjs
blender -b --python-exit-code 1 --python tools/world/facility-craft/batch6/build_bench_bin.py -- --surface-dir /path/to/frozen-R2/craft-batch6-facilities
```

未做production build、正常游玩成本或真实碰撞／座位运行检查，未更新4341，不能称本组完成。
