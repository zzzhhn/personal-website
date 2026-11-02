# 第四批建模精修：场景与全局自然资产

用户在第三批九类资产完成后要求继续较大批量地精修，同时覆盖石头、地面、草、树、水等全局通用资产。随后明确要求新开一个执行 session，主 session 保留统筹、规划、质量审阅与最终集成。当前授权是实际制作与验证，不是仅做清单或建议；本轮没有新的公开部署要求。

## 当前事实与入口

- 执行 checkout：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release`。2026-11-02 刚核实分支 `codex/world-craft-batch3`，HEAD `362e68d`，第三批已提交。先复核，再从此状态创建本轮 `codex/` 分支即可；不要重建或复制依赖。
- 唯一已知无关未跟踪文件：`tools/world/.check-club-audio.mjs.baiduyun.uploading.cfg`。不要改、删或提交。
- 共享集成 checkout：`/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration`，有其它 session 未提交工作。执行 session 不直接覆盖或提交这棵树；交主协调逐文件集成。
- 4341 当前交付包：`/tmp/bobby-world-batch3-2693c6e1-20261102`，是稳定的第三批。不要自行切换；最终经主协调审阅后更新。
- 先读上一批 `docs/world/phase-2-playground/asset-batch3-20261101/README.md`、`review.html`、`runtime-after/FINAL-R3.md`、`runtime-after/FINAL-R2.md`。原生模型、脚本、日夜画面、实际交互和性能证据都在相邻三组目录。
- 按 `src/components/world/AGENTS.md` 和 `/Users/a22309/claude-project/AGENTS.md` 工作，使用 `/Users/a22309/.codex/skills/blender-material-craft/SKILL.md`；涉及视觉或交互设计先读 `/Users/a22309/.agents/skills/integrate-design/SKILL.md`。可用已有 `personal-world-bruno` 的合法贴图库，沿原 manifest 保留来源与许可。

## 工作与边界

先清点现有实际资产和跨场景复用路径，以原生构造、材质反应和玩家距离下的收益选批次。明确覆盖石头、地表过渡、草、树和水五组全局对象，再配一组尚未精修的场景资产；用独立资产家族计数，不把换色、尺寸或摆放实例虚报为新模型。无需为凑数扩大低价值工作。

沿用用户已接受的世界风格和材质方向。石材要有形态、层理与接地；地面关注尺度、混合与边界；草木保留风动、触碰反馈和合理层次；水面要有多尺度运动和岸边联系。具体做法由执行 session 根据现有代码判断。不能回退为静态贴片、单一同心圆水波，也不要重新引入有卡帧感的实时倒影。

拥有这批精修的资产生成脚本、可编辑原生文件、导出资源、对应 runtime 适配和定向验证；先把选中的文件所有权写入批次清单，再委派可独立的部分。其它角色、驾驶、座位、碰撞、游泳、水位、地图布局和已有玩法应保持契约；如需变更这些系统，先报具体冲突给主协调，不通过移动外观来掩盖不一致。

可以拆分 subagents，避免同文件多人修改。Sol 系列必须 `gpt-6.1-sol` + `high`，Luna 若用则至少 `max`；给出清楚的输入、拥有路径、产出和停止条件。主执行负责接回各子任务，不让主协调重复实现整批。

## 质量、性能和资源

同灯架旧／新对照、原生与fresh GLB检查，以及实际网页的代表日夜画面都要有。先校准代表性资产，再扩展同家族；不合格只返修相关资产。新材质必须在真实网页 renderer 检验，不能把 Blender 好看当作网页已通过。保留受影响交互验证、资源字节量、材质批次和合理的实例化／LOD；不靠无上限面数、纹理或额外实时光完成精修。

上一批 Camp 在闭合构件中去掉多余双面绘制后，最终单个300帧窗口约60 FPS；R2 Club／IBD窗口约57 FPS且有长帧，绝不是全岛无成本证明。新一批的全局自然资产影响面更广，要先留实际缓冲、质量、相机和时段一致的基线，再测改后；记录场景是否仍在异步加载，不把计数变档或宿主压力误判成GPU因果。

机器当前资源受限，刚检得 memory pressure2、swap11.22 GiB、free disk4.65 GiB。启动浏览器、图片服务、Blender、构建或本地协作者前执行 `/usr/bin/python3 /Users/a22309/.local/bin/codex-resource-preflight.py`。遵守现有独占 FILE 锁 `/tmp/bobby-world-phase2-heavy.lock`，只开一个重型本地作业，复用已开浏览器，未拿锁不要起渲染。不得清理无关文件、历史会话或用户标签。新开session可以先做轻量清点和脚本，重型工作排队串行。

## 交付给主协调

在本目录维护一份紧凑的批次清单与交接：完成的家族、精确修改路径与commit、原生及网页前后图、验证结果、性能成本和未解决事项。提供一个完整可审阅的候选构建；不要自行覆盖4341、推送或公开部署。用户已授权主协调分发本任务并读取新session进展；默认由主协调通过线程工具拉取结果，遇到需要拍板的事项直接在本session报告即可。
