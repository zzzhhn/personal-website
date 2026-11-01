# 日床接入独立审阅，2026-11-01

状态：仅完成接入源码审阅，等待主线 READY 和实际构建 hash。没有启动浏览器、服务、构建或测试，没有占用／改写当前建模任务的文件锁，没有修改 src/public。当前 docs GLB 明确不是验收候选，不用它报告颜色、UV 或运行时预算。

## 已确认

- `djc-daybed-visual.ts:15–38` 按源 Material 对象缓存一份克隆材质，四个摆放共用源 BufferGeometry 和原贴图；每个源 mesh 创建一个 count=4 的 InstancedMesh，matrixWorld 合入各实例矩阵，矩阵仅创建时上传。不是四份几何／贴图，也没有每帧更新矩阵或每床新增灯。
- `:43` 释放 owned InstancedMesh 与克隆材质，不释放 loader 共用几何、贴图；`DaybedAsset` effect 在卸载时调用。`useLoader` 的源资产会继续缓存，离开 180 m 只隐藏且 active 一旦成立不再卸载。因此是最多一份资产的有限缓存设计，不能声称离场即回收，也没有源码证据证明持续累积泄漏。
- `WorldDjcClubDaybeds.tsx:24–32` 以床区中心 `[70,56]` 的水平距离 90 m 首次激活，180 m 隐藏；首载前、Suspense 和 ErrorBoundary 保留原家具。没有独立 RAF、timer、invalidate 或控制渲染循环的写入，night 更新挂在现有 useFrame 中，源码未引入暂停后的自驱渲染。暂停稳定／后台停止仍属运行证据，不能仅由此宣称已经测过。
- `WorldDjcClubGeometry.ts:269–292` 只将原家具视觉收集到替换批次，接近坡道在收集开关之前，碰撞仍走原路径；`WorldDjcClubVisual.tsx:69` 释放新拆分出的 fallback 几何。现有测试检查原／新碰撞、座位与坡道数组相同，但本会话未重跑，不代替最终 GLB 的表面高度、轮廓与坐姿检查。
- Club 父组仍有 `noOcclusionFade:true`，不能把精细日床自动归为四条遮挡淡出射线的新热点。

## 具体风险及最小运行核对

| 项目 | 源码事实与可能后果 | 最小核对 |
| --- | --- | --- |
| 全部精细几何参与投影 | `djc-daybed-visual.ts:32–33` 对每个源 mesh 设置 castShadow=true。实例化节省 calls，未减少四床实际三角形；金属、石材、灯笼等也投影，而原合批主视觉仅 wood/fabric/foliage 投影。 | READY 后核对最终 GLB mesh／primitive／tri／材质，固定正常运行镜头与旧版各一段短样本；如有明显回退即报告，不直接全局降分辨率。 |
| 运行时未自行按材质合并几何 | 一个源 mesh 对应一个实例对象；两个 mesh 即使同材质也不会在此合并，multi-material group 仍会多次提交。生成脚本 `build.py:412–418` 计划先按材质 join 并断言八 mesh，但最终 fresh GLB 尚待交付。 | 对 READY 的真实产物核对，不把“八材质”等同于已经证明八 draw calls；有阴影／透明双面时还可能增加提交。 |
| 材质完全继承最终 GLB | 克隆保留原 transmission、alphaMode、side、贴图和采样语义，没有像北吧台一样在运行时屏蔽 transmission。脚本 `:438` 有无 transmission 的资产断言，但运行时代码自身不强制该约束。 | 最终 GLB 应确认无 transmission 扩展；若误带透射，可能重新引入场景附加 pass。当前不能用未修完的 GLB 做结论。 |
| 合并包围盒涵盖四床 | 每个实例批次的 bounds 包住 `[62,42]` 至 `[78,66]` 和 `[62,70]`；一床可见时批次内其他实例也参与提交。隐藏距离按床区中心且忽略高度。 | 作为实例化的可接受取舍先测近景；不据此提前加分床 culling 或 LOD 复杂度。 |
| 首载失败没有当场重试 | Boundary failed 后保持 fallback 直到组件重新挂载；激活后离场不会重挂。 | 正式验收须看到真实 asset 对象和成功资源请求，不能把 fallback 正常显示当成新模型加载通过。 |

没有发现仅凭接入源码即可断言的交付阻塞；最终资产、运行帧耗和视觉均未验收。

## QA 壳必要修补

只修改本目录 `qa.js`：保存名统一加 `perf-`，新增 Late night 控件，采样元数据记录实际 buffer、CSS、DPR、shot、seat，并在静态 shot 下拒绝采样。这样 Front／Close shot 只用于视觉，正式采样必须先回 Daybed approach；坐下／起身也能留下状态证据。补丁未启动页面，仅以 `node --check` 验证语法。

READY 后优先复用主线指定的 Chrome browser 2／tab 1395914201，仅一个渲染页；先 preflight 并确认当前文件锁空闲，按主线指定协议获取，不覆盖建模 owner。用实际用户窗口 buffer 做新／旧对照，若需固定画幅则记录真实 buffer。保存限定近景、傍晚／深夜、一次坐下起身与短帧样本即可，结束释放自己锁和服务，将同一页暂停后交回主线。禁止 push／部署，4341 和其他用户标签不在本会话权限内。
