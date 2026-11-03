# Coaster 三族与 P04 源码性能及生命周期审查

2026-11-03。核对 Coaster `357337c` 和 P04 `76e0c95` 的 Git 对象。限定范围内未发现需阻塞集成的绑定、释放或发光问题。Coaster 后续 lookout 提交不在范围内。

**Coaster。** `CoasterBatch.finish` 仅在有标记的 batch 中为每个顶点补一个非归一化 Uint8，未标记顶点写 0，保证全部子几何能合并同名属性。实际消费只有近、远 Coaster steel 和 workshop body。两档 steel 都生成屋顶与入口标记。原独立 glow mesh、列车、活动设备、移动件和胶囊沿用各自的原材质路径。共用 `compile` 保留 `nightRadiance × uIntentNight`，角色 0 返回原顶点色和材质常量。当前两个调用点无粗糙度或金属度贴图，因此覆盖标准片段输出不会抹去现有纹理。普通与 craft 的 program key 分开，两档共用 craft 程序定义。

每份合并几何净增位置顶点数同等字节，合并期间短暂同时持有各 part 的标签数组和合并数组。WeakMap 不强持有 part，finish 后逐项 dispose 并清空列表。worker 按原 TypedArray 传输并保留 normalized 标志。切档释放旧 GPU buffer，最多两档 CPU 数据由原 cache 持有，卸载时清 cache、取消 pending job。Workshop body 按原卸载路径 dispose。新增一个顶点属性和 7 个 varying 分量，craft draw 中角色 0 也承担 varying 和判断成本。片段函数把仅用于屋顶的法线归一化放在角色判断前，可按需移入屋顶分支以明确作用域，实际指令由编译器决定。屋顶和 roller 有导数计算，roller 还有正弦，建议在原本安排的视觉验收中观察角色交界和缩小时的稳定性。矿物噪声分支在这份提交中无标记消费者。代码未新增材质贴图、draw、pass 或逐帧调度。

**P04。** 只在本地两档灯柱模板保留并填充 `aMat/aSuv`，按原索引定位构造件、逐三角写槽及杆身 UV，远档同一 shaft 范围内的顶部盖单独排除。灯罩内的透镜与石基都走槽 0，原暖色 `aEmit` 数据与共享发光公式继续使用。源检查报告的近、远模板增量为 55,152 B 和 10,512 B，现有两档克隆计入后共 131,328 B CPU TypedArray。近档与隐藏物理代理共用一份运行时几何，增量不会乘以九个灯柱。临时索引几何已 dispose，模块模板保持常驻，运行时克隆随原 `Knockables` cleanup 释放，材质 dispose 从共享登记表移除。60 m LOD 与 fade 继续使用原分支。

P04 沿用 `park-static-surface-v4-knock-fade-v2` 及共享木纹图和 PMREM。新成本来自灯柱像素进入已有分支，木槽读取色、粗糙度、法线三图并建立导数切线基，涂层使用现有噪声和反射。其它 park draw 的 shader 和原有槽 0 基础运算保持原状。局部 baseline 恢复原灯柱属性布局，使用同一共享材质程序。

本次未复跑几何或接触测试，也未运行浏览器、构建或 Blender。源码字节与分支分析仅说明资源和计算来源。真实 GPU 编译、画面保真、显存和帧耗仍由主协调按已有验证范围判断。
