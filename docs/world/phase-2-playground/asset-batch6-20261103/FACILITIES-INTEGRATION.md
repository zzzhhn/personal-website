# 两设施本地候选集成

2026-11-03。仅候车亭与海边小屋及其必要材质路径进入本地协调分支，**完成有界运行验证后已更新 4341 本地试玩，未推送或公开部署**。岩石与帐篷没有混入。

## 精确来源

| 作者提交 | 协调分支对应提交 | 范围 |
| --- | --- | --- |
| b59ee51eee5845a5d1e2f48d142cb8b359a49260 | 14a648d | 第一轮设施实现与来源 |
| 96b63217821df3bbfc3dfc78c26e02bade3669dd | 71f2ac5 | R2 玻璃、木纹比例与夜间返修 |
| ad7ee76d68ce240d9ed8e4f1657a5e637e62700c | f61a327 | 共享贴图迟到后的有限刷新 |

三个提交干净应用。集成后的 `src`、`public`、package/lock 与正式 Astro 配置相对作者 ad7ee76 的 Git diff 为空；集成树 `surfaces.test.mjs` 六项通过。不是只在另一个分支测试后假定合入一致。

## 生命周期证据

作者单独的 QA 提交为 `91faac8d7d6a3ed8b2e57f9841013cacd04f144d`，未将该故障注入配置混入正式候选。完整证据在设施工作树 `docs/world/phase-2-playground/asset-batch6-20261103/facilities/lifecycle/`，主协调已读 `LIFECYCLE-REVIEW.md` 并独立执行 `tools/world/facility-craft/batch6/lifecycle/validate.mjs`。

保存的真实 HTTP 延迟和实际 Canvas 迹支持四个定向结果：迟到图上传 GPU 并触发渲染、重挂缓存复用相同纹理 UUID 且不重复请求、取消后旧 root 不再接通知、有限刷新后停止增长。核对 31 份 artifact 及四个正式文件保持对应实现，最终 Three render 计数 1619 在 51.301 秒内未变。

该计数不是 FPS。长间隔暂停对照包含 fixed-shot，不能据此宣布普通无 shot 菜单全部情形已验证。QA 保留的全局 shadow pending 和开发期同步 unmount 警告未删除，不称全程零警告或阴影 settled。视觉接受范围仍限于主协调实际看过的 R2 样本，参见 `FACILITIES-SECOND-REVIEW.md`。

## 最终有界验证与本地推广

性能线完成独立正式构建，主协调已读 `performance/final-runtime/REVIEW.md` 与原始结果、独立核对其 50 项 artifact 哈希及候选 HTML 哈希，实际打开 `shelter-front.jpg`、`hut-doorway.jpg`。候车亭真实坐/站和入口步行、小屋门洞 W/S 往返未发现新增可复现阻塞；普通 `shot=null` 菜单最终计数保持 31.499 秒，弥补前一轮仅 fixed-shot 的暂停边界。

两代表点各一对短窗，p50 都为 16.7ms，候选/基线 p95 为亭 17.8/17.9ms、小屋 16.8/17.7ms，亭候选 42.9ms 单峰保留。跨包 ready 数、场景计数及整机内存压力有差异，不能据此宣称 GPU、独立材质或全岛无回归。有限玻璃转角未见明显闪变，远距离 fade 因遮挡、早期旧相机读数及像素不足仍未充分验收；保留原始无效记录，不当作通过。

首次 prebuild 因稀疏工作树缺件停止；主协调只恢复 HEAD 中缺失的 60 个 world 文件，共 85,860,665 字节，逐个 Git blob 相符，没有改任何已存在文件或绕过预检。随后正式 prebuild 与 Astro 构建通过。

主协调核对旧 4341 Python 服务 PID 与目录后替换服务，活动目录为 `/tmp/bobby-world-batch6-final-01a171f1`，服务 PID 19832，运行源仍为 f61a327，HTML SHA256 `ef09eca18abfd0c37263027da932dd3a79d52f146c6a7effb9ee7822d3f289d6`。4341 实际返回 HTML 哈希匹配，入口 JS、新 hut runtime GLB 和三图均 HTTP 200。没有操作用户浏览器标签；需要用户刷新才能载入新版。

活动构建已由主协调接管，不能按性能线临时产物清理。原 `/tmp/bobby-world-batch5-r10-fourteen-01a19a62` 保留回滚，服务来源记录在 `/tmp/bobby-world-preview-4341.json`。性能线临时页/服务/锁已清理，自然线接下一重型窗口。

这是两族的本地交付，不是用户审美接受；未将两族从 57 族整体视觉待办中直接扣除。
