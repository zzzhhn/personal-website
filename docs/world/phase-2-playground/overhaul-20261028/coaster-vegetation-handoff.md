# 过山车成簇植被候选交接

2026-10-28，基线 `a238b61`，共享分支 `codex/world-alpha-pilot`。源码冻结，未提交、推送、构建或启动浏览器／服务。主控负责同机位日夜、遮挡和性能验收。

## 范围与参考

已读取 `coaster-v3-overview-day-final.png`、`coaster-v3-overview-night-final.png` 和 v3 日夜参考图。参考清单实施检查通过；当前参考的授权是继续返工与视觉方向，不能表述为用户已验收这版真实效果。

本轮文件：`WorldCoasterVegetation.tsx`、`coaster-vegetation-layout.ts`、`coaster-vegetation.test.mjs`；移除 `coaster-landscape.ts` 的旧树冠、树干、对应盒碰撞和旧灌木；`WorldIntentCoaster.tsx` 只添加 import 和植被同级挂载所需 fragment。岩石、花池实体、步道、灯、站房、轨道、声音、公共风 shader、WorldStreetTrees 均未改动。地形自带的 62 丛植被仍保留。

## 实现

- 48 棵树，ST1 20 棵、ST2 28 棵，按山肩和场地空隙成簇排列；36 丛现有 G19 低矮植物填入口花池和树下。没有新模型或下载。
- 复用 WorldStreetTrees 相同的 ST1/ST2 `useLoader` 缓存键。G19 单独加载现有资产。所有合并、归零风权重、变换都只处理自有克隆，不修改缓存原模型。
- L0／L1 只切换树冠，两档均使用同一个 L0 树干。树干风权重为零，物理碰撞从同一变换后的 L0 几何生成，48 个固定 Trimesh 始终存在，不随视角／LOD 切换。叶冠及 G19 沿用 `attachNatureWind` 和世界共享时钟，含一致的风动阴影；低矮植物不投影。
- 近景进入 26 m、退出 32 m，最多 8 棵；其余树使用 L1 冠，185 m 外不显示。G19 在 65 m 内最多显示最近 24 丛。视锥加 4 m 缓冲，最多 10 Hz 更新选择。按稳定 id 排序，仅集合改变才上传矩阵，静止镜头直接跳过。无每株可见 React 组件、无新增实时光。
- 植被在 `noOcclusionFade` 过山车组外同级挂载；每批标记 `occluder`，沿用 WorldOcclusion 的局部视线淡出。实例集合改变时同步重算实例包围球，避免其射线预筛选沿用旧边界。未修改公共遮挡或相机系统。
- 布局保留公共步道、设备、已有主岛邻近树、旧岩岛和灯柱的空间；根部采样真实 infield 高度，拒绝明显断面／陡坡。约每 0.5 m 采样完整乘坐路径，避让轨道、乘员、三种视角及两档支柱／斜撑。所有原安全阈值保持不变。

## 可核验预算

均为几何三角面，阴影绘制另计。旧静态预算函数不包含这个新实例组件，集成统计必须把两部分相加。

| 项目 | 数字 |
| --- | ---: |
| ST1：L0 冠＋L0 干／L1 冠＋L0 干 | 4,526／1,490 |
| ST2：L0 冠＋L0 干／L1 冠＋L0 干 | 4,644／1,722 |
| G19，每丛 | 2,052 |
| 48 棵树全部使用远景冠 | 78,016 |
| 最坏 8 棵升级到近景的增量 | 24,288 |
| 最多 24 丛可见 G19 | 49,248 |
| 植被可见总上限 | **151,552** |
| 植被颜色绘制批次上限 | **5**，另有树木阴影绘制 |
| 移除旧植被后静态场景，含三节车厢 | 近景 106,172／远景 58,848 |
| 静态近景＋植被最坏上限 | **257,724** |

| 可直接统计的数组／文件 | 字节 |
| --- | ---: |
| 3 个现有压缩 GLB 文件合计 | 374,296 |
| 解码源几何含索引，保守计入全部三资产 | 1,502,888 |
| 5 个合并绘制几何的顶点属性 | 2,251,704 |
| 48 个树干碰撞顶点及索引 | 1,703,040 |
| 实例矩阵容量 | 8,448 |

CPU 可核验数组合计约 5.21 MiB，GPU 合并几何＋矩阵约 2.16 MiB。源树缓存若已被主岛加载，不全是新增内存；Rapier 内部数据、JS 对象、GPU 驱动分配、shader、瞬态解码内存不在此数字内。不能把它当作浏览器总内存或 FPS 保证。

## 检查证据

- 真实本地 Draco 解码，检查两档模型实际顶点和最大风偏移都位于放置包络内；树干显示与碰撞逐顶点一致。
- 独立 3,600 个加密乘坐采样覆盖三种镜头和乘员视线，含风包络的轨道／乘员最小距离为 **3.151 m**，原 1.7 m 下限保持不变。
- 加入实际树干和原场景碰撞的 Rapier 胶囊通行：**817／817 步着地**，完成整个花园环线。
- 支柱避让版本植被测试 **8／8 通过**，无跳过；原轨道、海崖、infield、上下车回归 **32／32 通过**，无跳过；此前定向严格 TypeScript 检查通过。
- 最新收尾增加同级挂载、实例包围球刷新及第 9 项闲置上传测试，等待主控释放 QA 重任务锁后作最终复核。测试文件语法和 diff 空白检查已通过。

复核命令：

```sh
node --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/coaster-vegetation.test.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler --allowImportingTsExtensions --jsx react-jsx src/components/world/attractions/WorldIntentCoaster.tsx src/components/world/attractions/WorldCoasterVegetation.tsx
```

## 日夜预期与待验收事项

白天预期看到与主岛一致的分枝和叶片层次，原大二十面体树被替换，成簇植被覆盖部分裸草。夜间树冠依靠现有世界照明，入口花池提供低位轮廓，没有新增照明；它们没有静态建筑的夜间烘焙补光，远处可能仍偏暗。

主控需检查同机位日夜画面、入口和环线的自由相机淡出、完整乘坐、26／32 m 树冠切换、65 m 低矮植物退出，以及 185 m 边界的可见跳变。保留树木阴影会增加阴影通道成本；新增上限明显高于旧粗模，必须用同机运行数据决定是否收紧。当前没有新版本运行截图、浏览器性能窗口或用户美术验收，不应把静态通过当作视觉完成。

每个实例批次的 `userData.coasterVegetationStats()` 提供当前 instances、triangles、matrixUploads，供主控运行时汇总；不要只读旧 `structure.art.trees`，它现在为 0，因为旧合批植被已迁出。
