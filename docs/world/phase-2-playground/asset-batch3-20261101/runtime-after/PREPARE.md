# 候选窗口准备状态

2026-11-02，仅轻量准备。尚未启动本目录 server、浏览器、build 或截图，未获取重型锁；没有候选 runtime 通过声明。必须先等主协调提供 frozen 目录、完整 hash 和明确 heavy 许可，再 preflight、核对真实 tabs、获取带 token/PID 的 atomic FILE 锁。

已准备 `serve.py`、`qa.js`、`views.json`。六个艺术相机配置直接取正式 before JSON，含后移后的完整 DJ 双音箱和 IBD 台架机位；三处正常采样预设另列为 `n2-club`、`n3-camp`、`n5-ibd`。完成 JavaScript/Python 语法及 JSON 配置检查，尚未运行网页验证。

## 运行门槛

包内 URL：

- Club `/assets/world/club/furniture/furniture-v1.glb`，根节点 `djc-crafted-furniture`。
- Camp `/assets/world/camp/craft/camp-props-v1.glb`，根节点 `camp-craft-C05`、`camp-craft-C06`、`camp-craft-C07`。
- IBD `/assets/world/ibd/static-craft/static-craft-v1.glb`，根节点 `ibd-static-craft`。

`Art v*` 按钮先 release 艺术相机、传送到该区并正常运行，等待至少 1.8 秒、超过 30 个真实 render frame、store 位置已到目标附近，以及对应 URL 已响应且实际 crafted 根节点都在场，再锁定旧机位。锁相机后重新检查节点，避免把 fallback 当候选。legacy 模式检查该 family 的 crafted 根节点缺席；资源静默不单独当作加载完成证明。记录只保留三 URL 和精确根节点/后代数量，不输出大 scene 清单。

六机位候选各 noon/night。缺的 legacy 夜景按 Club/Camp/IBD 各一个代表补即可，不重拍全部 before。截图前先读 Snapshot 的资源、节点、相机和真实 buffer；艺术相机只用于外观，不用于正常帧率样本。

## 正常交互与采样

`Go bench seat` 从现有 Camp seats QA API 读取第一个真实 seat anchor，只传送到站立接近点；坐下和站起仍用产品按钮/键盘，检查 `settings.seat` 的实际变化。`Go DJ decks` 到现有 DJ 入口，使用产品 Take the decks/控件或舞池操作并实际退出。`Go IBD manifest / kit / crate` 只放置角色，领取清单、工具和开盖均通过产品 UI。脚本不会直接设置 seat、clubMode 或 IBD 游戏记录来制造通过。

三处正常样本预设正常 running、shot=null、未暂停、角色 grounded；恢复 Noon/Clear/Balanced、固定 viewport 1710×931（DPR1）并核对实际 buffer 同为1710×931。`Read alignment` 读出当前 camera 与目标 yaw/pitch/distance，以及原生拖动所需 dx/dy；用真实鼠标拖动对齐，不把艺术机位帧当样本。候选和三项 legacy 同位重放后仍须比较实际 camera/target/FOV 和落点，不能只信预设。

`Sample 90 + 300` 只接受三处 normal preset、完整 candidate 或完整 legacy 模式，要求正常 always 帧、加载节点门槛、匹配 buffer/CSS、固定光照和相机对齐。先跳过90个不同 render frame，再保存300个不同frame的delta/draws/tri；途中不截图、不操作，按钮锁定。隐藏、暂停、摄影机位、缓冲变化或60秒期限都会报错并保留失败窗口，不能当完整样本通过。GPU时间记null。

同包 legacy 参数：`qa=1&djcFurniture=legacy&campCraft=legacy&ibdStatic=legacy`；第二批资产仍正常。三窗 candidate 和三窗 legacy 各一次，不扩展性能场景。每次页面有独立 `runId`（可用小写字母/数字/短横线的 `run` 参数指定），保存名含 mode/runId/机位/serial，避免重载后意外覆盖已有证据。

## 待执行交还

候选 hash/资源核对与实际测试都留待获准窗口。结束先 Escape 暂停、reset viewport、保存紧凑 readback，再停止 owned4356，按 token/PID 释放 FILE 锁，立即告诉主协调窗口可用。4341 不动，报告区分外观、真实交互和有限包内样本。
