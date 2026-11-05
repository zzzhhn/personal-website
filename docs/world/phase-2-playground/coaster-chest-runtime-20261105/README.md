# 六锁宝箱运行派生

2026-11-05，基线 `b75c474`。保留用户认可的[首版视觉原件与旧性能证据](../coaster-chest-transfer-20261104/README.md)，只改运行时提交组织。原 GLB 和 Blender 文件的 SHA256 与首版一致，见 [structure-check.json](structure-check.json)。

| 路径 | 首版 | 当前派生 |
| --- | --- | --- |
| 箱体、箱盖可见表面 | 9 个 PBR 图元 | 同一借用几何与材质通道，9 个图元 |
| 六把锁梁 | 每把单独提交 | 关闭铜色与打开钢色两组实例，1～2 次提交 |
| 六枚锁窗及七枚任务灯 | 13 次提交 | 未亮、已亮两个索引分组，1～2 次提交 |
| 不透明双面投影 | 随上述箱体、箱盖的 9 个材质图元提交 | 箱体与盖各一个完整几何载体，共 2 批 |
| 主通道结构提交 | 28 | 13～15，包含两个不写颜色或深度的投影载体 |

普通表面的 17,940 个三角面没有减少。两个投影载体保留原箱体和盖子的全部 13,336 面、索引顺序及双面语义，盖子使用同一铰链父节点并标为动态，避免开盖后沿用静态投影。它们也会经过主通道，因此主通道结构面数升至 31,276。减少提交与增加主通道几何是明确的权衡，不能据此声称帧率提高。当前统计不包含原实体钥匙，也不把工程结构计数冒充实际渲染提交；实际裁剪、级联与全场统计由主 session 测量。

运行派生持有四份合并几何、两份实例缓冲与九个材质副本，合计派生顶点/索引/实例数据 364,536 字节。GLTF 缓存的原几何、材质、纹理及共享 PMREM 环境均不由它释放。状态切换复用已有索引和实例缓冲，只改内容、drawRange 和 count，不持续分配新的 GPU index。

已用基线实际组件的 effect 复现 StrictMode cleanup/replay 提前 dispose 仍被复用材质的问题；因此沿用项目已有的微任务重获惯例。新组件的实际 effect 测试验证：重获时保持资源，最终释放时每份自有几何、材质和实例缓冲只 dispose 一次，借用资源 dispose 为零。此结果不证明旧性能窗的长停顿来自泄漏。

入口组件的点击、钥匙、门侧钥匙函数与基线逐字一致；开盖的暂停/隐藏/大步长处理及指数缓动回调也与基线相同。材质保持原 color、roughness、metalness、clearcoat、UV 和法线；实例矩阵对应六把锁各自的原局部变换。灯光、曝光、阴影系统、原件和 review config 未改。

```sh
node --experimental-transform-types --test --test-concurrency=1 src/components/world/attractions/coaster-chest-runtime.test.mjs src/components/world/attractions/intent-progress.test.mjs src/components/world/attractions/intent-runtime.test.mjs
node tools/world/coaster-chest-transfer/verify-runtime.mjs
```

22 项测试通过：实际 GLB 的几何与 PBR 通道、128 种任务掩码、闭盖/中途/开盖变换、完整投影拓扑、原交互回调与资源生命周期；helper 独立 strict TypeScript 检查为零诊断。CPU 测试仅用占位纹理采样器，不解码图片，不能替代 WebGL 材质验收。旧 `verify.py` 的源接口检查针对首版组件；当前运行派生请使用上方新命令。

未运行 Blender、构建或浏览器。后续由主 session 做 fresh-page 的独立首版/派生页面，同机位昼夜外观、开盖与钥匙状态、实际 calls/帧时间、重复进出驻留验证。旧 125→153 calls 与 P95 32.4→44.4ms 只作为既有问题输入，尚无本轮性能结论。

## 主会话实际运行检查

2026-11-05，候选构建 `coaster-pipeline-v9`，全新页面分别加载原始精修宝箱和优化派生，三节列车均为相同优化版。1710×875、DPR 1、balanced、固定同一相机、曝光1、晴天、加载及阴影收敛，每窗90帧预热＋360帧测量；测量期间没有Blender/构建。

| 同机位 | 首版 P50 / P95 | 派生 P50 / P95 | 全场绘制 | 全场主通道三角面 |
| --- | --- | --- | --- | --- |
| 正午 | 23.1 / 49.1 ms | 17.4 / 28.1 ms | 155 → 141 | 733,800 → 747,136 |
| 深夜 | 18.5 / 33.0 ms | 17.8 / 29.2 ms | 155 → 141 | 733,800 → 747,136 |

实际日夜画面与原件一致，原件文件未改。四个样本保存于 `runtime-windows.json`，原始/派生昼夜JPEG同目录。v9记录中的 `source` 字段为空是记录字段读取错误；同期DOM读回均为 `coaster-pipeline-v9`，后续harness已改从canvas证据字段读取。

这些窗口支持采用合批派生，不能把日间首窗的较大改善全部归因于宝箱。浏览器标签此前休眠，宿主内存压力也在normal/warning间变化，后续新组合仍需复测。派生最大间隔57.2/59.1ms，偶发长帧仍在，不是整世界内存/热稳定性通过。实际交互与组合回归随后由场景集成记录补充。
