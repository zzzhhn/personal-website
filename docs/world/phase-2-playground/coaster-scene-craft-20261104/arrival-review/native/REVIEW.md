# 最终资产导出

| 包 | 对象 | 三角面 | 材质 |
| --- | ---: | ---: | ---: |
| [到达组件、列车、门锁与灯廊](coaster-arrival-assemblies.glb) | 42 | 6,948 | 28 |
| [全线轨道近档](coaster-full-structure-near.glb) | 7 | 143,260 | 7 |
| [全线轨道远档](coaster-full-structure-far.glb) | 6 | 65,148 | 6 |

导出从真实运行几何或全线制作分组源生成，用 Three.js GLTFLoader 从写出的文件重新导入，核对对象、三角面、材质、范围和结构顶点色。GLB 保留分组和可编辑 PBR 近似。运行构建负责夜间烘焙光和程序材质。 [源、文件哈希与回读记录](manifest.json)

两次 Blender 调用在执行脚本前卡于 macOS 共享文件列表的书签解析，含一次出厂设置重试。当前三套 GLB 可编辑并已回读，最终三套 `.blend` 及 Blender fresh import 待该启动问题恢复。已有入口工坊和短跨的 Blend 回读仍可在上一阶段记录核对。
