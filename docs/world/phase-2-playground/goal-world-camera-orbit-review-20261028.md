# 首降自由镜头只读复核

后续状态：本文件保留首次只读诊断。实际修复和最新验证见同目录 `goal-world-orbit-fix-handoff-20261028.md`；原诊断脚本已原地转成仓库相对导入的回归，不再需要 `WORLD_CONTACT_REVIEW_ROOT`。

2026-10-28。Character 工作树：`codex/goal-world-contact`，基底 `43a818b`。
读取 integration `03fee8e`；复核过程中主线推进至 `a7a2ab0`。两版的本次相机、轨道、车厢运行源码无差异，最终测试针对 `a7a2ab0`。

## 结论

存在可复现的第三人称镜头可见性问题。世界坐标的仰角限制允许首降镜头绕到列车背侧，车厢遮挡设计眼点。此次采样没有发现镜头球体穿入静态轨道，不能将截图直接定性为穿模。

现有截图中主脊占据较大画面，但本次相同时间的射线检查没有复现主脊挡住设计眼点。车厢遮挡与主脊画面占比应分别处理，不应凭截图要求轨道线缩细主脊。

## 截图与复现边界

integration 下的证据：

- `docs/world/phase-2-playground/visual-calibration-20261027/runtime/world-v19-coaster-ride-orbit.png`：HUD 32 秒，可见车底和大面积主脊。
- `docs/world/phase-2-playground/visual-calibration-20261027/runtime/world-v19-coaster-ride-reset.png`：HUD 44 秒，位置已变化。不能作为同一时刻归位前后的对照。

测试假设：从默认 chase 镜头开始，普通非锁定指针右拖 260 px，无纵向拖动、无缩放。`WorldActors.tsx:141,702` 的 `MOUSE_DRAG=.0055` 得到 yaw=1.43 rad；锁定指针的系数不同。HUD 使用秒数向下取整，故取 32.00、32.50、32.99 秒，不假装知道截图精确小数秒和先前输入。

## 代码证据

1. `attractions/coaster-thrill-frame.ts` 的 `thrillRidePose` 在该段默认将镜头放在列车乘客侧，局部高度 4.8 m；第三人称 `cameraUp=[0,1,0]` 保持世界水平线。
2. `attractions/attraction-camera.ts:19–35` 同时用该 `cameraUp` 作环绕轴和仰角约束轴。首降时列车 up 接近水平，世界“高于目标”不代表位于列车乘客侧。
3. `WorldActors.tsx:1253–1265` 在手动输入后，从目标点到候选镜头执行半径球扫掠。这条路径检查静态碰撞，不检查车厢或完整人物的视线。
4. `attractions/WorldIntentCoaster.tsx:61–63` 已挂载主脊、轨道样段的真实 trimesh。`coaster-rail-section.ts:83` 将样段可见几何同时加入碰撞。不能归因于“轨道没有 collider”。
5. `WorldIntentCoaster.tsx:130` 仅在 `active && !occupied` 时挂载停泊车厢碰撞；乘坐时移动列车的可见几何仍存在，但这条相机 sweep 不会碰到它。

## 定向测试结果

新文件：`src/components/world/camera-coaster-orbit-review.test.mjs`。
这是当前缺陷的特征测试，断言当前会发生遮挡；测试通过不代表修复完成。未来修复后应转换成回归测试，而非保留对坏行为的断言。

测试直接加载指定 integration 源码，避免 character 旧基底缺少最新连续轨道模块。构造实际详细轨道结构的静态 colliders、track/relief trimesh，以及三节真实可见车厢。视线使用源码定义的眼点 `frame.point + frame.up * 1.74`，不是完整角色模型的像素可见率。

| 时间 | 默认镜头局部高度 | 右拖后局部高度 | 静态 sweep 命中 | 最终镜头球体重叠 | 车厢遮挡眼点 | 主脊遮挡眼点 |
| --- | ---: | ---: | --- | --- | --- | --- |
| 32.00 s | 4.800 m | -2.264 m | 无 | 无 | 是 | 否 |
| 32.50 s | 4.800 m | -2.427 m | 无 | 无 | 是 | 否 |
| 32.99 s | 4.800 m | -2.434 m | 无 | 无 | 是 | 否 |

局部高度为 `(camera-frame.point)·frame.up`。相机球体半径 0.22 m，来自运行时 near=0.1、chase FOV=58、截图 aspect=1710/931。默认镜头在相同三个时间点均没有车厢遮挡眼点。

运行命令（在 character 工作树中）：

```sh
WORLD_CONTACT_REVIEW_ROOT=/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration node --import /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/tools/world/alpha-mine-tests/register.mjs --test src/components/world/camera-coaster-orbit-review.test.mjs
```

结果：1 test passed，0 failed，约 1.5 秒。有既有 Rapier 初始化参数弃用提示和此诊断脚本的 Three CJS 提示，不影响结果。

## 最小修正建议，由主线决定实现

保留当前水平线、鼠标方向和轨道模型。在第三人称候选镜头生成后、物理 sweep 前，增加列车局部 up 下的乘客侧约束；将视图水平线使用的 `cameraUp` 与镜头安全侧约束分离。第一人称不采用该约束。

测试内的原型仅将 camera-target 向量相对列车 up 的最小仰角设为 0.12 rad，保留其长度及水平分量方向，再走原有静态 sweep。三个采样点的最终局部高度约 2.075 m，静态球体无重叠，车厢和主脊均不再挡住眼点。这个结果支持修正方向，但不是可直接宣称完成的产品实现：座位低处仍可能被正常车厢侧板挡住，未验证完整人物轮廓、所有 yaw/pitch、缩放、comfort 模式、进入/离开首降的连续性以及车体附近的近裁面。

主线实现后最有价值的补验：冻结同一首降时间，录制默认→右拖→归位；检查完整人物和近裁面，同时覆盖首降边界、其他翻转段及手动 pitch/zoom。不要用 32 秒和 44 秒的不同位置截图替代这个比较。

## 交付与资源

只新增本交接和定向测试。未修改运行模块、未 push、未操作 4341，未启动浏览器、构建或安装。资源预检 memory pressure=2、磁盘剩余约 3.9 GiB，因此仅串行执行短时源代码/物理检查。图像来自既有截图；没有新增运行时视觉验收。
