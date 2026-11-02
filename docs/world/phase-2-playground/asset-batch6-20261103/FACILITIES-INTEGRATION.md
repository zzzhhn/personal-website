# 两设施本地候选集成

2026-11-03。仅候车亭与海边小屋及其必要材质路径进入本地协调分支，**4341 保持 R10 稳定版，未推送或部署**。岩石与帐篷没有混入。

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

## 推广前剩余工作

性能线已接下一个有界窗口：独立候选正式构建、两代表点的通路/座位及有限玻璃近远观察、同状态短窗成本比较。它不修改实现或 4341，结束释放自有页、服务和锁。自然线同时只做轻量返修，下一重型窗口由性能线直接交接。

当前不能把本地源码集成写成试玩更新，也没有将两族从 57 族的整体视觉待办中直接扣除。
