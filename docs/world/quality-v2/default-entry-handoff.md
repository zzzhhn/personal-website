# 普通入口启用补证（2026-10-22）

承接 Fable 11:25 的 A–D 通过结论及唯一启用条件；不重新评审已通过的项目。判定原文见 `fable-verdict-20261022.md`。

- 实现提交：`1e0965f`。仅移除 `WorldGuide.tsx` 两个动作启用条件，已审阅的相位匹配与停步收脚在普通入口启用。物理、模型、动作算法与限幅值未改；调试 API 仍只在 QA 入口存在。
- Cloudflare 自动预览成功：https://34f5f80b.personal-website-aew.pages.dev/world/ 。不带查询参数。
- 正常入口录像：`playtest/default-entry-73aa/default-entry-stop.webm`，原始 1920×1080、正常速度；停步从 5.514 s 开始，180° 转向后停步从 8.520 s 开始。角色位于画面中部，约 x=960、y=580，不应按缩略图像素估算。
- 该目录 `report.json` 实测 `defaultMotion.url` 无查询参数、`qaApiAbsent=true`、真实绘图像素 1920×1080、无 fixture。按键依次为 A、A+Shift、A、松键、D、松键。17个GLB哈希一致，0页面、console、HTTP错误。
- 同源带 QA 观测的页面已读回 `phasePrototype=true` 与 `stopPrototype=true`；这两个历史调试字段名保留，不代表仍需候选开关。普通入口没有暴露该 API。
- `npm run build` 成功。本次仅做启用条件及发布验证，未重复全套碰撞、连接和几何检查。

本地静态预览曾在普通入口向 `/api/events` 发事件时得到404（本地无Cloudflare Functions）；失败报告和录像保留在 `/Users/bobby/Desktop/3D-personal-world/default-entry-local-static-20261022/`。没有把该次执行回填为通过；上述成功证据是在实际Cloudflare预览重新录制。

审阅状态：已通过CUA送达，当前Opus 5.5审阅会话实看两段各8帧，已在其维护的验收文档补写“完成”，附加条件解除。Bobby 未接受、灰盒手感门未签字；原生Jump局部35.85mm失败以及原有未验证范围保持不变。
