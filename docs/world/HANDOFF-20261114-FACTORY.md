# 最新接续：工厂和五模块已合入 Alpha

从 `codex/factory-integrated-20261114` 继续，基于 Alpha 的 262ba2e，运行时 4fb09e4。不要用 ce1743a 旧恢复树整树覆盖。

先读 `docs/world/factory-integration-20261114/DELIVERY.md` 和 README，再看原 Alpha 的交付页。工厂与五模块已整合；旧 HANDOFF-20261114 中“工厂未移入”已经过时，仅作历史。Alpha 玩法、材质、音频与当前音乐保留。

新电脑准备仍沿用 HANDOFF-20261112 的必要资源目录，不下载历史录像。拉取本分支、npm ci，然后 build／preview 或 dev。新增工厂主要为程序化源码，63 文件位于 `src/components/world/factory`，不需额外 GLB 下载。测试辅助 loader 在 `tools/world/alpha-mine-tests`。

本批已实际完成工厂生产、返工、复测、打印与归档，五模块定向操作和 Alpha WebKit 回归。仍有加载开销：本机首次 ready 约比 Alpha 慢 2.4 秒。M3 Air 16GB／Safari及长期长帧仍待验，不能报告性能解决。

不部署、不合并 main。原 Alpha 262ba2e 分支保留供回滚与对照。最终本机 4341 整合预览的进程与 HTML 哈希见本批 preview.json。
