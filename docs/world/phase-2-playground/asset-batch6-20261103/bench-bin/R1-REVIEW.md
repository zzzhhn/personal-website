# Bench／bin R1 普通视角复核

**结论：继续独立返修，不建议集成。** 长椅在约4.2m距离可见沿板长的木纹与漆面层次；垃圾桶在约3.3m距离主要是桶身稍亮、金属圈更清楚，体积和材质身份的整体提升仍弱。这是设施线自评，尚无主协调或用户视觉接受。

实际源为 `2c3f7a0c0e4b76ed20c3895d625172a87f298c13`；`astro.batch6.bench-bin.config.mjs` 仅替换现有开发QA控制的机位与报告标识，没有修改生产模块。机位从实际layout placement及原bench朝向规则派生，保存在 `next-bench-bin/review-views.json`。`benchBin=baseline` 只关闭本组，保留已审R2小屋／候车亭。

`runtime-r1/` 含四张原始JPEG、四份JSON和候选页控制台记录。每对均为1710×931、DPR1、FOV50、Balanced、noon720、曝光1、blend1、资源加载结束及阴影pending=false。每对注册资产／可见集合摘要相同。记录门要求资源集合与内存计数稳定至少1秒，并由有限QA warm-up等待气候／阴影队列完成。

| 对照 | 基线 | 候选 |
| --- | --- | --- |
| 长椅 | `bench-normal-noon-baseline.jpg` | `bench-normal-noon-candidate.jpg` |
| 垃圾桶 | `bin-normal-noon-baseline.jpg` | `bin-normal-noon-candidate.jpg` |

四图均由实际浏览器截图保存，已逐对自查，未裁剪、调色或合成。截图使用Compact控制栏。首次尝试body快捷键未生效，改用现有Compact按钮；没有将该失败动作算作隐藏成功。初次启动因稀疏检出缺少replay插件和door-contract失败，补齐两项原有受跟踪依赖后重新加载。候选页控制台没有error，保留Three.Clock与Rapier初始化的两条既有弃用warning。

本轮未扩拍近景／夜景，未将静态帧计数当作FPS或性能结论，也未做连续透明排序、正常游玩或用户视觉接受。原source manifest的`wired-source-only-unrendered`为导出前提取阶段标记，当前阶段以本报告和native报告为准。

重任务已清理：自有Chrome标签1395914323关闭后复查4350标签为空；核验PID31356完整命令为本组Astro4350后SIGTERM，wrapper退出143并按token释放共享锁。未设置viewport override，未操作用户4341。

后续只准备本组R2：优先让bin的卷边、开口深度与漆面／裸金属分工在普通距离可读；保护碰撞、COM、复位、座位、布局和远景开销。当前R1保持归档，不扩到其它设施，也不把本轮有限增益标为完成。
