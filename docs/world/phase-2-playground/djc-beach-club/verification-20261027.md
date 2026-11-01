# Club 本轮交付与验证，2026-10-27

当前本地生产试玩：[4341 Club](http://127.0.0.1:4341/world/?start=club&quality=balanced&paused=1)。服务来自 `/tmp/bobby-club-presence-final-20261027`，最终构建于本机 15:04 完成。4343 临时开发服务已停止；4342 仍为此前旧版，不是本次结果。没有提交或推送本轮混合工作区。

## 六项反馈对应结果

| 项目 | 本轮结果 | 证据 |
| --- | --- | --- |
| 舞步僵硬 | 动作 1 有明确左右 step-touch；动作 2 为前点步与扭转；保留作者编舞与原捕捉残差的来源说明 | `../../character/djc-dance-presence-20261027.md`；QA 目录的 `guests-final-groove.png`、`twist-front.png`、`twist-runtime.json` |
| 泳池过小 | 半径由 10.5×14.2 改为 17×23，基准面积约 2.62 倍；同步扩展海岬、两条步道、四处宽出水坡道和日床入口 | `pool-day.png`、`production-water-entry.png`、`production-water-exit.png`；26 项几何、地形与真实物理检查 |
| 夜间照明 | 六盏无阴影场内灯、合批池岸光晕和一盏按距离激活的路灯补光；近景回调主灯以保留材质层次 | `production-night-final.png`、`street-night-lit-player.png` |
| 镜球不明显 | 半径 0.85 m 的分块镜球有旋转高光，84 个地面反光点和两束柔和移动光束 | `club-entry-mirror-night.png`、`production-night-final.png`；实际浏览器着色器无错误 |
| NPC 比例不统一 | 读取真实 G24 顶点校准头身、肩和四肢；两款服饰，不复用玩家头盔／背包外观；海绿色衣服与肤色分离 | `../../character/djc-guests-style-20261027.md`；两位来宾各一个 skinned draw，3182／2680 三角形 |
| 复盘 | 记录根因、改动、错误假设和验证不足；已有规则已覆盖，不增加重复 AGENTS／MEMORY 条目 | `error-analysis-20261027.md` |

QA 文件位于相邻目录 `../qa-club-presence-20261027/`。`dance-night.png`、`pool-night-first.png` 是调灯过程中的中间证据，最终灯光以 `production-night-final.png` 为准。

## 验证范围

- `WorldGuideDance.test.ts`：真实蒙皮足底、骨长、循环、工厂隔离和非整拍退出通过。
- `audit-naturalness.ts` 与 `WorldDancePresence.test.ts`：原有自然度约束与两档 BPM 的活动下限同时通过。
- `WorldClubGuest.test.ts`：最终头部、服装、比例、接触、乐句和释放检查通过。
- 几何／座位／地形测试 26 项通过，新增四个出水方向各两条动态走线，已有八个日床接近方向保留。
- 受影响 TypeScript 文件检查通过，最终 Astro 生产构建通过。
- DEV 实际页面：两动作切换、两位 NPC 活动权重、暂停／恢复、走开退出；暂停时音频 sources=0，拍数和 NPC 姿态时间不变。
- 4341 最终生产页面：加载、设置、白天大泳池、实际入水与西侧坡道出水、深夜池岸／舞池／镜球；浏览器错误日志为空。

当前浏览器保留在暂停菜单，避免后台持续渲染。用户可点击继续探索。审美是否达到用户期望仍由后续试玩决定；概念图与实际运行画面分别保存。

## 性能证据的限度

开发页两个 180 帧窗口的 p50／p95 分别为 17.6／19.6 ms 与 24.5／34.5 ms。采样时相机、加载阶段和本机资源压力不同，不作直接性能改善比较。第二次采样的 78 draw、277954 三角形也只对应当时视角，不代表场景峰值。生产构建没有重新暴露 DEV 的帧采样按钮，因此不将这些数字冒充生产环境采样。

新增效果没有逐灯阴影、反射摄像机、独立 RAF 或计时器；NPC 仍使用距离停更和现有暂停路径。实际暂停检查文件为 `pause-clocks.json`。本机资源受限时序列执行重任务，未开启新浏览器或 Blender。

## 风格参考

最新原生生成概念图为 `concept-v4-finns-game-style-20261027.png`：低而舒展的竹木屋顶、大面积面海泳池和日床，同时以现有游戏截图约束人物比例与块面材质。它是视觉方向，不是运行时截图或用户已接受的证明。官方 FINNS 照片只用于空间研究，不随网站发布。
