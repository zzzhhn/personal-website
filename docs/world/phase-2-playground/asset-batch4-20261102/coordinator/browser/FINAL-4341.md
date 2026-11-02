# 第四批正式试玩页读回

2026-11-02，完成限定范围的正式页面验收：加载、暂停菜单、恢复渲染、短暂移动、再次暂停均通过。仅写入本 browser 目录，未改源码、模型、设置或其他 session 的证据；未构建、采样、重做 A/B、遍历地图、push 或 deploy。

正式地址：`http://127.0.0.1:4341/world/?start=camp&quality=balanced&paused=1`，无 QA/legacy 参数。主协调管理的服务 PID11644，目录 `/tmp/bobby-world-batch4-r2-01a19a62`。本次额外以 HTTP 读取 HTML 并匹配 SHA256 `8d41cbde726c9bacdd5b7f8685acb8c7f09fcedca2bae76c0a5cd9051281244c`，详见 `delivery-readback.json`。其余十一份 HTTP 核验和模型图审阅沿用主协调证据，未在本次重验。

资源预检 pressure1、swap10.29GiB、free35.28GiB。检查 Chrome2 当前标签后复用1395914218，未新开实例或标签。通过 O_EXCL 取得 `/tmp/bobby-world-phase2-heavy.lock`，token `batch4-final-readback-01a171f1`，关联正式服务 PID11644，全程单项重作业。

实际操作：刷新同 URL 载入新构建，初始出现中文暂停菜单和流畅画质选中状态。第一次“继续探索”在初始化期间发生工具输入超时；重新读取当前状态后，“回到营地”已可用，点击当前“继续探索”成功进入正常营地 HUD。原生按住 W 700ms，人物由火堆前方走近火堆，人物朝向、相对火圈位置和跟随相机画面均有可见变化。截图中火圈、木凳、旗杆和帐篷正常显示；不据此扩大为全地图或全部第四批模型通过。随后原生 Escape 返回暂停菜单，保留该标签和4341服务。

- `initial-paused-ax.txt`：刷新后的初始暂停菜单。
- `running-after-move-ax.txt`：移动后的正常营地 HUD。
- `4341-batch4-camp-running.jpg`：移动后的正式营地运行图，1710×931，未修改视口。
- `final-paused-ax.txt`：最终暂停菜单，继续探索可用，流畅选中，岛上时间17:52。

错误仅记录上述首次恢复输入超时，随后正常恢复和移动完成；未进行控制台诊断或性能测量。结束按 token 核对释放重型锁，不停止正式4341服务，不关闭用户标签。
