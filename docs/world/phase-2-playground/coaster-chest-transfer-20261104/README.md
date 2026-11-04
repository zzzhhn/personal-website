# 六锁宝箱：独立 Sol 工艺迁移候选

2026-11-04。把[用户偏好的车厢小样](../coaster-car-astra-pilot-20261104/README.md)用作工艺标杆，试做入口处既有六锁宝箱。参考是车厢[常规距离](../coaster-car-astra-pilot-20261104/after-ordinary-day.png)与[前侧](../coaster-car-astra-pilot-20261104/after-front-day.png)实际游戏画面。借鉴能在普通距离看清的外壳曲率、接缝和材质分层，保留入口装置原有的铜色、蓝灰、青色状态提示。

| 组件 | 普通距离要能读到的变化 |
| --- | --- |
| 箱身 | 连续的收底壳、宽圆角、底部承托，端面有内收的搬运把手。开盖后可见翻边、内衬与中央钥匙托座。 |
| 箱盖 | 铜色浅弧肩部接到独立内盖和石墨色密封圈。后侧钢铰轴与实际动画同轴，前侧六枚盖扣随盖子抬起。 |
| 锁轨 | 六把圆角铜锁安装在连续的蓝灰色凹槽。开锁后银色锁梁向外转，青色窗点亮；上方七枚独立任务灯仍按 T1～T7 点亮。 |

原宝箱固定在本分支基线 `0f3274b8f7a933d1e396ced857fc4bed7fd7d63d`。旧几何、交互组件、目标位置文件的 Git blob 分别为 `9c9586803bef177ef4e8d202eb0490abb1d5ce4f`、`26b5c6bbb4f5b59146dd11ef5c774cc956c73fbb`、`a80fba53803ab4dd80f9cde3bd8a55ac76038578`。旧 CoasterBatch 的位置是本地坐标，构造函数传入的世界坐标仅作着色取样。

- 原生文件使用米制、Z 向上，97 个具名可编辑部件；GLB 为 +Y 向上、+Z 朝玩家。场景中仍由 `coasterWorld([-8, 0, 59.5])` 放置。
- `ChestBody` 根为 `[0, 0, 0]`，`ChestLid` 根为 `[0, 1.23, -1]`，绕本地 X 轴转到 `-1.3` rad。六个 `Lock01…06` 按通过数量依次解开，七个 `Signal01…07` 按任务 ID 独立点亮。键位、点击、原钥匙及门侧钥匙保留原实现；没有新增碰撞。
- 七种不透明材质：两种蓝灰烤漆、铜色粉末涂层、拉丝五金、石墨色橡胶、暖黄锁合金及蛋白色灯罩。两张自制 256×256 粗糙度图随原生文件打包、随 GLB 内嵌，也提供独立 PNG。无外部纹理或扫描素材。
- 接入时用 `WorldCoasterChestTransfer` 取代 `WorldIntentDevices` 内唯一的 `<IntentChest />`。新组件通过 `useGLTF` 保留 PBR 材质、法线、UV 和 clearcoat，借用渲染器已有的 PMREM 缓存，局部环境响应从白天 0.85 到深夜 0.50。没有改灯光、曝光、场景环境或物理。

首版原件为 [coaster-chest-editable.blend](coaster-chest-editable.blend) 与 [coaster-chest.glb](coaster-chest.glb)，[校验记录](export-check.json)固定二者哈希。Blender 5.1.2 无渲染导出：GLB 804,404 字节，17,940 面，28 个图元批次。它是单件视觉候选，这些数字不代表实际帧率。

```sh
blender --background --factory-startup --threads 2 --python-exit-code 1 --python tools/world/coaster-chest-transfer/build.py
python3 tools/world/coaster-chest-transfer/verify.py
node --experimental-transform-types --test --test-concurrency=1 src/components/world/attractions/intent-progress.test.mjs src/components/world/attractions/intent-runtime.test.mjs
```

GLB 坐标、单位法线、UV、材质、闭盖与开盖包络、锁根和原交互坐标检查通过；已有任务进度及运行状态测试共 15 项通过。实际引擎昼夜对照、开盖取钥匙与开门现已由主 session 检查；性能尚未通过，用户视觉验收未获取。详见以下复核。

## 主 session 复核

首版 GLB 与 Blender 文件没有经过主 session 外观返修。主 session 只接入独立审阅切换、固定机位和显式 QA 定位/前置状态。不是主 session 重做后冒充 Sol 独立产物。

同一实际场景、固定相机 `[46.8,3.65,-130.8]`、FOV50、1710×931、DPR1、balanced、曝光1、晴天，采集 `before/after-day/night.png`。四份 JSON 均确认 blend=1、shadowPending=false、loading=false 和无资产失败。两张过早截图已用收敛后截图替换，未用加载中的旧版美化差距。

主 session 的视觉判断：轮廓、壳体厚度、凹进的锁轨和材质区分在普通交互距离可读，明显改善原版方盒。但这是一个内部视觉样本，不代表模型能力全面相等，也没有替代用户审美认可。开盖后的内衬、钥匙托座、铰轴与六锁动作已见于 `after-open-day.png`。通过正常 UI 完成开盖、拿钥匙、开门；六题前置使用 QA fixture。

### 性能不通过，保留候选

独立夜景各采样 360 帧，均先预热 90 帧。原始记录 `performance-baseline.json` 和 `performance-candidate.json` 的 `variant:optimized` 指列车模式；宝箱身份由两份独立文件区分。

| 指标 | 原宝箱 | 候选宝箱 |
| --- | ---: | ---: |
| 中位帧时间 | 16.9ms | 17.3ms |
| P95 | 32.4ms | 44.4ms |
| 最大帧间隔 | 53.1ms | 966.6ms |
| 全场提交中位数 | 125 | 153 |
| 全场三角面中位数 | 692,450 | 722,950 |

候选在本轮窗口有明显长尾，不能用中位数接近来判定通过。当前主机存在内存压力，单窗不能把接近 1 秒的停顿直接归因于宝箱着色器或泄漏；28 次额外绘制提交则是确定的差异。后续先处理静态部分按材质合批和简化投影，再以新建页面的独立窗口复验，避免不断 A/B 挂载的历史驻留影响。首版作为不修改的迁移证据保留，不扩大同族批量，也不进入 4341。
