# 可操控的 /world 试玩 bot

这是一套反馈驱动的按键控制器，不需要训练或 RL。它每 90 ms 读取位置、接地、真实 Rapier 接触，选择 WASD 方向；长时间没有前进才后退/绕行。不会用瞬移冒充走路。

## 本轮证据

- `baseline-c507506/`：不可变 Cloudflare 旧版基线，确认缺碰撞、空气墙、无角色动作等问题。
- `final/report.json`：第一次集成的失败记录（路径名是早期命名，**不是最终通过版**）。暴露凸包封空、门外占位包、台阶粘边，以及该长会话中的一次跳跃异常。
- `repair-r2/report.json`：针对修改的 11 类资产，44/44 接近案例通过。
- `acceptance-r3/report.json`：16 类资产 × 4 方向的 64 个复合案例通过，14/14 运行检查通过，无 JS/console/HTTP 错误。每类取首实例；共享实例矩阵在代码中统一，不声称逐个实例穷举。
- `connections/`：已有 connection 回归，营地坡道、桥、栈道三条实际键盘路线全部通过，groundedFraction=1、unsupported=0；本轮仅跑一次。
- `motion-final/`：最终候选 GLB 的首次专项复测，揭示走跑混合时鞋底约 1.48 cm 下沉，保留失败证据。
- `motion-r2/`：加入有 2.5 cm 上限的视觉贴地补偿后专项复测，4/4 检查通过，已采样接地帧鞋底下沉为 0；实际最大补偿 1.42 cm。物理胶囊与跳跃轨迹不受补偿影响；这不是复杂斜坡脚 IK。正常速度视频和每次请求的 GLB SHA-256 随报告保存。
- `motion-r3/`：ed46b73b4b8a 候选专项，4/4，但之后视觉复核发现腕部缝隙，因此不作为最终交付。
- `motion-r4/`：腕部修正后的最终 d3ccc5919af1 GLB 专项，4/4、鞋底采样下沉0、实际最大补偿1.53cm；真实按键录像超过10秒。此轮不重复无改动的碰撞/连接套件。

连续路线从真实出生点经过 11 个路点，进入 C03 后退出并走到营地出口，0 次卡住恢复。局部方向接近为独立 fixture：起点瞬移有单独日志，随后靠真实按键接近；不计入连续行走证据。

C08 始终是 **书堆**，源文件和清单没有改为笔电。早期交接受旧变量 `laptop` 误导称错，现已改名 `bookStack`。地面人物四向被 C07 支撑桌阻挡；另用半径 5 cm 球在书堆上半部高度进行四向隔离 shape cast，四向边界误差 < 0.004 mm。按 Fable 的 C1-a 解释，隔离查询与真实步行分列，不能删除桌碰撞来造通过。

G23 是实体矮石，四向都有真实接触；胶囊跨过时实际抬升 0.123–0.220 m，超过露出地面的石高一半。跨过不等于穿模，也不标成 trigger-only。

`acceptance-r3` 的跳跃轨迹从 y=5.6189 到峰值 7.1506，再回到 5.6189；同时实际播放 Idle、Walk、Run、Jump。Esc、固定取证机位冻结物理及全部动画时钟，减少动态使风幅降到零。`acceptance-r3` 的角色 hash 是较早候选；最终角色单独用 `motion-r4` 复测，不能把旧碰撞批次的 clip 名称当作最终动作质量证明。

画质实际 drawing buffer 为 1920×1080 与 2560×1440，MSAA 开启。场景首次稳定帧 194 draw calls / 102043 triangles；这是该机位的数据，不是全世界峰值。机器 Apple M5 Pro / 48 GB，Chrome 155 ANGLE Metal；180 帧 rAF 间隔接近 60 Hz，只证明显示节奏，**不是 GPU 余量，也不是 M1 Air 性能认证**。

角色导出诊断的限制：原生 Jump 的“局部地面接触滑移”有 3.50cm failed 记录，未改成通过。`motion-r4/jump-contact-interpretation.json` 对应真实物理跳跃：20个Jump采样全部离地、靴底最少高于实际地面25.8cm；只支持该记录内不构成地面滑脚，不穷尽每个混合帧。原生 body BVH 交叠候选计数也不是0，须结合模型内部嵌入结构和视觉审查，不声称完全无自交。

## 自己运行

在仓库根目录，先启动构建预览：

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4321
```

另一个终端运行：

```sh
# Playwright 不在项目依赖中；指向本机现有安装的 node_modules 即可。
export WORLD_BROWSER_MODULES=/path/to/node_modules
node tools/world/playtest/final.mjs
```

可选变量：`WORLD_BASE_URL` 指向预览；`WORLD_CHROME` 指浏览器可执行文件；`WORLD_PLAYTEST_DIR` 指独立输出目录。默认输出沿用 `playtest/final`，保留证据时请设置新的目录。仅复测改动资产：

```sh
WORLD_CASES=C03,G19 WORLD_PLAYTEST_DIR=docs/world/quality-v2/playtest/my-rerun node tools/world/playtest/final.mjs
```

编辑 `final.mjs` 的 `bot.walk([[x,z], ...])` 即可改路线，`run:true` 加 Shift。API 在 `?qa=1` 才挂载；不用 QA 参数的正常网页不提供控制接口。脚本会明确列出阻挡物、触碰位置、视觉边缘差、真实按键、瞬移 fixture、错误、buffer 与帧间隔。

## 限制

没有训练模型，没有“AI 已体验全部岛屿”的声明。八方向按键会小幅锯齿修正，形状查询只能补充物理证据，不能代替正常速度画面检查。车辆仍为灰盒，侧向轮胎实体接触架构、M1 Air 帧率、每个实例所有可达角度、所有坡度上的脚 IK 未认证。
