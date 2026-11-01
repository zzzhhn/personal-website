# Club 日床本地精修接入

按用户 2026-11-01 最新指示，以本地 4341 验收，暂不推送或部署。

- 原生模型与同机位图由 `../djc-daybed-craft-20261101/` 提供。
- 四张日床共用按材质合批的几何、贴图和材质，以实例化绘制。没有新增实时灯光、透射 pass 或 UI 轮询。
- GLB 到达前和加载失败时显示原有家具；碰撞、坐位、坡道始终存在。
- 25 项定向检查通过，包括 8 个实际动态胶囊上坡坐位路线、4 处出池坡道、原/新视觉开关的碰撞数据完全一致。新增导入闭包 TypeScript 检查无错误。
- 浏览器已核对真实 GLB 加载、正常步行跨接边、侧后坐姿与起身。第一次审图发现接边共面闪烁，已按坐垫真实圆边裁接；保持原有物理数据，新增交叠面积和边缘探针检查。
- 第二次审图发现阴影中的材质过暗。仅调整日床私有环境响应与最高 4× 各向异性采样，源 PBR 因子、UV 和图片不变；吧台与全局照明不变。最终版本定向检查 5/5，整合 checkout 同样通过。
- `perf-runtime.md`、`perf-recheck.md` 分别记录前两轮真实浏览器范围和不足。`build-final.json` 对应第三轮材质修正构建，最终视觉与性能以第三轮报告为准。离线 Blender 图、源码检查、浏览器证据及用户审美认可分别记录。

候选检查服务：`python3 serve.py /absolute/path/to/dist`，端口 4356。QA 脚本只由本机服务注入，构建包保持不变。前后对比以 `qa=1&djcDaybeds=legacy` 与默认新模型切换，照明和相机保持相同。

## 本地交付

主协调已亲自审阅 `perf-final-close-noon.jpg` 与 `perf-final-close-midnight.jpg`，接受这轮日床局部接入。深夜保留低照度，不把它描述为与离线棚拍相同。`perf-final.md` 记录正常 approach 的 300 帧样本：约 60 FPS、p95 17.1 ms，实际缓冲 2013 × 1030；这不是整岛、全部设备或长时间运行保证。

4341 已改为独立快照 `/tmp/bobby-world-daybed-20261101`，HTML、运行包及 GLB 的 HTTP 内容逐一与 `build-final.json` 核对一致，见 `local-delivery.json`。原生模型、导出和接入代码保留在本地 `codex/djc-daybed-craft` 分支；接入补丁也已应用到整合 checkout，保留其 `useGreyboxClaim` 和其它会话改动。未推送 GitHub，未触发公开部署。

复现定向检查：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/djc-daybed-visual.test.mjs
```

该项目的 TypeScript 相对导入依赖此现有 loader；直接 `node --test` 不能解析省略扩展名的导入。原生模型的渲染与构造说明见相邻 craft 目录。所有候选临时服务已在检查结束时停止；4341 是保留供用户体验的服务。
