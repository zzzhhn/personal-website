# 默认玻璃与入口补丁限定复验，2026-11-01

本轮限定技术检查通过：默认玻璃在相同 Front 视角两段短样本均约 60 FPS，角色沿原 x≈40.75 路线实际走上北吧台平台。正午／傍晚近景中瓶杯仍透见背景。未发现本轮四项中的新阻塞；外观是否达到批准小样由主协调看图决定，此记录不等于整岛或发布全面验收。

## 产物与条件

- 主线新构建的 release dist，HTML SHA256 前 16 位 `a900424c007d4425`；`WorldRuntime.BHsrobxD.js` 为 `66b5802d8debf69b`。HEAD 仍为 `0d94cd9`，主线补丁当时在工作区，故不能只凭 commit 标识候选。
- 沿用 4356 本机可见 QA 壳服务 4343 所对应的同一 dist。URL 不含 `djcBarTransmission`，测试的是新默认玻璃。没有修改产品源码、GLB、构建或 4343 服务。
- Balanced、Clear、Noon 720、时间停止；CSS／实际 buffer 均 1280×720、pixelRatio 1。使用安全 Front 起点和相同原生 571 px 拖动。
- `glass-ramp-d1-snapshot-1.json`：grounded=true，位置 `[40.75,2.418825626,46.002204895]`，相机约 `[40.762076805,7.741845734,57.054930225]`，yaw 1.5697036732、pitch 0.4、distance 12，无碰撞。
- 资源预检内存压力 normal、swap 7.86 GiB、磁盘 10.67 GiB。单标签、单服务，采样无其他本任务重工作；GPU ms=null。仅固定视角短样本，不作全岛最低帧率承诺。

## 两段正式样本

每段跳过 30 帧再记录 300 个不同 render frame ID，计算方法沿用前轮。

| 文件 | FPS | p50 ms | p95 ms | 全场景 calls 中位数 | 全场景 triangles 中位数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `glass-ramp-d1-sample-2.json` | 60.0012 | 16.7 | 17.1 | 271 | 1,321,818 |
| `glass-ramp-d1-sample-3.json` | 60.0024 | 16.7 | 17.0 | 271 | 1,321,818 |

原透射候选同镜头约 19.79／20.45 FPS，旧版约 60 FPS；新默认恢复至本机该视角约 60 FPS，未通过降 buffer 得到该结果。

## 实际步行

从上述 Front 落地位置开始，原生 W 1.3 秒，再 W 0.6 秒。中途没有传送：

- `glass-ramp-d1-snapshot-4.json`：玩家 `[40.7387772,1.9681859,42.5617561]`，grounded=true，已经走上缓坡并越过旧阻塞位置 z≈42.586。
- `glass-ramp-d1-snapshot-5.json`：玩家 `[40.7343063,2.0188854,41.0771027]`，grounded=true，位于新平台内，角色脚底对应平台 y≈1.2。
- `glass-ramp-walk-onto-deck.jpg` 保存实际走上台后的画面。HUD 的 position 是前一个 store 读数，和随后 actor snapshot 可能相差数帧；以上精确坐标取 JSON 的 `player`，不把二者拼成同一时刻。

原 x≈40.75 通行阻塞在此路线已解除。未扩大到全部通道、凳子或整座 Club 回归。

## 玻璃近景

步行验证完成后才用 Counter 控件回到统一近景位置，滚轮拉近镜头。该布置不参与通行证明。

- `glass-ramp-noon-close.jpg` 与 `glass-ramp-d1-snapshot-6.json`：透明瓶壁／杯体可透见后台面、草地或水面，标签保持可见；与无透射纯不透明诊断中的白块有明显区别。
- `glass-ramp-evening-close.jpg` 与 `glass-ramp-d1-snapshot-7.json`：Evening 19:00，night=0.72；瓶杯轮廓和透过的背景仍可辨，整体更暗。

这是 alpha 透明近景的可见行为验证，不证明与物理折射或批准的离线渲染完全一致。两图已发送主协调实际看图。本轮未增加夜间性能矩阵。

## 清理与交接

四项完成即关闭自有 tab 4、reset 临时 viewport、停止自有 4356/PID 92948，核对 owner `performance-01a171f1-djc-glass-ramp-20261101` 后释放重任务锁。主线 4343 保留，4341 未触碰。没有重跑全测试、再次构建或新增测量范围；原先暂停测试等历史证据不伪称本轮重测。
