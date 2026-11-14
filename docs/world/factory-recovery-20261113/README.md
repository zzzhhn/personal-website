# Video Rebirth 工厂与五个模块补交 · 2026-11-13

## 这是什么版本

恢复分支：`codex/factory-modules-recovery-20261113`。来源是个人电脑 `personal-world-phase2-integration` 工作树中未提交的实现，原基线为 `f248bc235e7a66ec3a112207f17b79ce44bff8b2`。

上次交接遗漏了未跟踪文件。`62050189726edd3486673d8aabf1feac54fc250e` 并没有工厂目录和下面五个模块，其交接说明把工厂称为“已有实现”时没有区分本机实现与 Git 已收录状态，这是需要纠正的地方。此次把实际源码、依赖、接线、原型与证据一并补交。

**这是恢复来源分支，不是替代工作电脑最新优化的整合主线。** 它保留旧工作树能够编译的完整上下文，包含当时已经接入的营地／Club／国投资源。不能把这些旧共享文件、旧音乐或旧资产覆盖回新开发分支。需要在工作电脑最新分支上逐项移植工厂和缺失模块，解决接线差异后重新验证。

## 已补齐的内容

| 范围 | 源码与接线 |
| --- | --- |
| Video Rebirth 机械伙伴工厂 | `src/components/world/factory/` 共 63 个文件，包含状态链、三加工线、压机、输送、吊装、测试物理、评测读数、返工、产品卡打印、归档、工人及照明、碰撞与静态结构 BVH |
| 过山车座舱镜头 | `attractions/attraction-camera-cabin.ts` 及测试，接入 `attraction-camera.ts` 与 `WorldActors.tsx` |
| 意图工坊设施和重复练习 | `attractions/intent-workshop-arcade.ts` 及测试，结合 `WorldIntentWorkshop.tsx`、`WorldIntentHud.tsx`、`intent-state.ts`、`intent-workshop-runtime.ts` |
| Club 池底地形遮罩 | `club-basin-mask.ts` 及测试，结合 Club 池体、地形和水面接线 |
| 交易所玻璃分区 | `exchange-glass-bays.ts` 及测试，结合 `WorldAlphaExchange.tsx` / `WorldAlphaExchangeGeometry.ts`；这是旧交易所修复，不是新 Alpha 山岛设计 |
| 矿区可见地面覆盖裁切 | `mine-floor-coverage.ts` 及测试，结合 `WorldAlphaMine.tsx`、`WorldAlphaMineFoundation.tsx`、`alpha-mine-foundation.ts` |

额外保留了当时共享上下车、制动、道路／街具的测试和必要运行依赖，不能把它们视为刚完成的新优化。工厂主要采用程序化几何，模型实现就在上述 TypeScript 文件内，并非另有一套未上传的工厂 GLB。

原型方案、三张已批准方向的图片及历史观察在 `docs/world/phase-2-playground/video-rebirth-factory/`；压机和托盘细化证据在 `press-refinement-20261030/`、`carrier-refinement-20261030/`；厂房遮挡射线优化证据在 `factory-perf-20261031/`。这些目录没有验收录像。`feedback-20261030/README.md` 是历史工作记录，其中旧端口、待办和音乐状态不代表当前项目。

`source-files.json` 列出本次恢复的 330 个原始文件及 SHA-256，区分原有未提交修改与未跟踪内容；本说明和本轮验证日志不在原始文件清单内。没有删除旧工作树、批量恢复清理造成的缺文件或修改其他任务。

## 工作电脑如何接续

先保留自己的最新提交，fetch 此分支并阅读本说明。新优化继续保留在原工作分支，本分支用于取回实现和比较接线，不要 reset、整树覆盖或直接合并旧共享实现。

1. 核对工作电脑已实现的同名功能，再取回缺少的 `factory/` 与上述五个模块及测试。
2. 工厂入口：`attractions/WorldAttractions.tsx` 的 lazy 挂载和距离开关；`WorldApp.tsx` 的 `FactoryHud`。
3. 工厂操作状态：`store.ts` 的 `factoryStation`、退出／返营清理；`WorldInteract.ts` 的互斥；`WorldActors.tsx` 的出生点、输入、角色工位状态和工作视角；`WorldHud.tsx` 的引导。只移入这些增量，保留新人物、营地交互和性能改进。
4. 空间接入：`factory-layout.ts` 的西侧岬角及路网；`WorldLandform.ts`、`layout-v4.ts`、`WorldTerrain.tsx`、道路／铺装、草和 `WorldMap.tsx`。要同时处理可见地面与真实碰撞，不能只挂厂房造成悬空、草穿地板或缺路。
5. 材质、合批、LOD 和光照沿用新分支已经验证的质量。`three-mesh-bvh@0.8.3` 在这里声明为直接依赖；与新分支锁文件按实际依赖合并，不要覆盖整个 lockfile。
6. 移植后重新执行定向测试、严格类型、正式构建和普通试玩，重点查完整生产闭环、退出恢复、昼夜照明、相机遮挡和长帧。旧工厂仍有细节与探索性待改，不表示已获最终审美认可。

可以用 `git diff f248bc235e7a66ec3a112207f17b79ce44bff8b2..origin/codex/factory-modules-recovery-20261113 -- <具体路径>` 查看相对于原基线的接线增量。

## 本次验证

- Node `v25.5.0`，复用既有依赖，串行执行，没有启动浏览器。
- 工厂 24 份测试文件、五个模块测试及真实结构 BVH 检查：173 项，172 通过、0 失败、1 跳过。跳过的是 `FACTORY_TERRAIN_MESH=1` 才启用的整块地形网格检查，不冒充已验。
- `WorldFactory`、`WorldFactoryHud`、`WorldActors`、`WorldApp` 及五个模块完整导入闭包严格 TypeScript 检查：exit 0。
- 正常 Astro 生产构建：exit 0，生成首页与 `/world/`，约 8.59 秒；存在 bundle 大小告警，不是性能验收。缺失的两首既有 Club 运行音频从原 Git 提交恢复后参与构建；没有换音乐。
- 新日志：`tests.log`、`typecheck.log`、`build.log`。旧性能报告保留原日期及场景归属，本轮没有重新测 FPS、浏览器动作或用户视觉接受，也没有改 4341 或公开部署。

定向测试复现：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/factory/*.test.mjs \
  src/components/world/attractions/attraction-camera-cabin.test.mjs \
  src/components/world/attractions/intent-workshop-arcade.test.mjs \
  src/components/world/club-basin-mask.test.mjs \
  src/components/world/exchange-glass-bays.test.mjs \
  src/components/world/mine-floor-coverage.test.mjs \
  docs/world/phase-2-playground/factory-perf-20261031/structure-raycast.test.mjs
```

新电脑如要单独查看这个恢复版本，用 `npm ci` 和 `npm run dev -- --host 127.0.0.1 --port 4341`，入口 `/world/?start=factory&quality=balanced`；端口冲突就换一个，不要关闭其他任务。临时诊断配置里的旧绝对路径不属于启动要求。
