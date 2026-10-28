# 后卷护栏绕行引导小修

基于 `3ee718e`，分支 `codex/ibd-guided-round`。来自主线实玩反馈：吊开前卷后，从东侧操作通道直接走向后卷黄圈会撞东护栏；报告站位为世界坐标 `[-97.09,1.9,-183.91]`。主线已验证南端开口可通，本轮只补上该绕行的指引。

## 改动

- 后卷正面、背面检查统一提示：“沿东侧退到南端开口，再绕入后卷黄圈。”
- 后卷翻转提示：“从南端开口绕出，退到操作台外侧翻卷。”其它翻卷步骤也明确退到操作台外侧、等钢卷停稳。
- 吊架完成和后卷翻转完成的反馈再次指向南端开口，操作进行中保留对应提示。
- 保留现有从中央大道出发的主箭头。后卷检查时补局部回程箭头，本地坐标 `[-8,-8] → [-7,-8] → [-7,1] → [-12,1]`，先向东避开前卷操作台，再接原路径进黄圈；翻转时补 `[-12,-6.7] → [-12,1] → [-7,1]`，接东侧转台路径。没有左右相反的重叠箭头。
- 护栏南端为本地 `z=-2`，新增横向绕行均在 `z=1`。没有拆护栏、改变站位／操作范围、传送玩家或增加教程状态。

只改 `ibd-yard-guide.ts`、`WorldIbdGuide.tsx`、`ibd-yard-guide.test.mjs` 和本交接。无需跨线接口。

## 验证与剩余项

新增轻量测试覆盖后卷正面、翻转、背面三个连续步骤的双语绕行提示、操作中的提示一致性、局部箭头方向，以及后续箱体步骤不增加该支线。既有胶囊宽度的静态 cuboid 净空测试已扩展到局部箭头。

第一次资源预检：memory pressure 2、swap 10.65 GiB、可用磁盘 8.41 GiB；原子获取共享 heavy lock 失败，因此没有运行测试。完成源码差异审阅后再次尝试，pressure 仍为 2、可用磁盘 8.47 GiB，锁仍被占用，未忙等或绕过锁。

`git diff --check` 通过。本次新增／修改测试和类型检查均尚未执行，不把上轮测试成绩套用于本次改动。主线释放浏览器窗口后可在同一锁规则下执行：

```sh
node --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/ibd-yard-guide.test.mjs src/components/world/attractions/ibd-guided-round.test.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler --allowImportingTsExtensions --jsx react-jsx --types @react-three/fiber src/components/world/attractions/WorldIbdGuide.tsx
```

未开浏览器、完整构建、安装依赖、推送或操作 4341。新增箭头的实际可见性、从报告位置绕入黄圈及翻卷后的返回仍由主线在现有浏览器窗口复验，不能用源测试代替实玩接受。

## 主线实测后的修正

主线将 `8202b08` 集成为 `cbdcb04` 后，原净空测试正确发现旧回程线沿 `x=-8` 经过前卷操作台，失败采样点为 `[-8,-4.6]`，实体中心为 `[-8,.6,-4]`。日志：`/tmp/bobby-world-v22-integrated-tests.log`。

本修复只在后卷检查回程线增加向东折点，沿原有 `x=-7` 操作通道南行；不移动实体、不改胶囊半径、不放宽静态 cuboid 净空断言。护栏断言改为检查每一个实际横跨护栏的线段均位于南端开口外，兼容避让所需的新增折点；另锁定先向东避开操作台的路线。

修复后首次资源预检为 pressure 2、swap 13.23 GiB、可用磁盘 5.96 GiB；共享锁仍被占用，测试未启动。完成差异审阅并短暂等待后，第二次原子获取仍失败（pressure 2、可用磁盘 5.95 GiB）。`git diff --check` 通过；本次修复的短测试仍未执行，交主线在持有的串行窗口按上方命令重跑，不声称已经通过。
