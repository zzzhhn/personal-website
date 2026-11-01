# Runtime focused tests

2026-11-01，基线 `34754d28173691dc0913910474c43796ab7cc0a3`。本记录仅证明源码、资源合同及CPU几何检查；浏览器外观、实际交互、性能与4341切换由主协调另行记录。

## 合并验证：58/58通过，0失败，0跳过

工作目录为仓库根，运行约19秒：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/djc-umbrella-visual.test.mjs \
  src/components/world/attractions/ibd-crate-visual.test.mjs \
  src/components/world/djc-daybed-visual.test.mjs \
  src/components/world/djc-environment-radiance.test.mjs \
  src/components/world/djc-pool-lantern-visual.test.mjs \
  src/components/world/attractions/ibd-pack-geometry.test.mjs \
  src/components/world/attractions/ibd-stock-geometry.test.mjs \
  src/components/world/attractions/ibd-yard-safety.test.mjs \
  src/components/world/attractions/ibd-stock.test.mjs \
  src/components/world/attractions/ibd-pack-inspection.test.mjs \
  src/components/world/attractions/ibd-inspection-motion.test.mjs \
  tools/world/check-world-craft-assets.test.mjs
```

覆盖原碰撞数组、座位及通路不变；两伞实例与材质／sampler所有权；共享PMREM引用计数与StrictMode释放；箱壳及样品无重复；stock、取样、双手接触、取消及Rapier阻挡；真实GLB叉槽、托垫及箱盖扫掠；生产资产checker的缺失、错误根组、rig、灯及透射负例。

该次伞hash已是终版；该次箱体hash为 `54ed3dd23fa69ba45275bbefd1a8c310812b25b65b16b08b641daf7eb9c7a949`。箱体随后仅更新UV1／AO，终版另作以下定向回归，没有重跑全组或把旧结果冒充终版全组结果。

## 终版资产回归

| Public资产 | SHA256 | 结果 |
| --- | --- | --- |
| `/assets/world/club/umbrella/umbrella-v1.glb` | `acabe5cd136560ea73f6957904c5e1d7e1569a7b66e258d8db553d7d50aae592` | 真实几何检查通过；终版静态checker通过，4材质／4批次 |
| `/assets/world/ibd/crate/crate-v1.glb` | `a01de057e34cc1788684d0874b5da50682ab9fdfeae2f794a5140411b207723e` | 终版真实几何检查1/1通过，0跳过；静态checker通过，8材质／11批次 |

箱体终版命令：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test \
  --test-name-pattern='actual crate keeps' \
  src/components/world/attractions/ibd-crate-visual.test.mjs
```

实际读取已复制的public GLB，四个叉槽向下射线命中地板 `Y=.33`，八个托垫命中 `Y=.42`，Shell保持原搬运包络；生产pivot `[0,1.08,-1.25]` 下 `X=0..-2` 的81个角度样点均在旧 `buildIbdLid()` 扫掠包络内。

对上述两个public文件调用 `checkWorldCraftAsset(file,kind,'public')` 并用 `createHash('sha256')` 校验，均匹配表中hash。checker强制完整内嵌几何buffer、静态不透射PBR、无灯／相机／skin／animation／独立runtime检查零件；箱体必须有直接、独立且identity的 `Shell`、`Lid` 根组。两项真实几何测试的Node纹理加载使用占位sampler，不解码图片，不声称证明AO或材质外观。

## 已知基线失败

扩展检查 `ibd-yard-recovery.test.mjs` 有3项失败，不在上述58项通过集合内：

1. `receiving the next batch is one local action, retains the reusable kit and clears all cargo evidence`
2. `every batch recovers after duplicate input, suspension, cancellation and re-entry at every timed step`
3. `proof-backed evidence reports measurements before the player signs, without auto-revealing a verdict`

三项均在 `ibd-test-pack-inspection.mjs:18` 的 `assert.equal(item?.kind,'hardware-pack')` 得到 `undefined`。未修改游戏逻辑或测试helper。

递归解析该测试的相对import，逐文件读取 `git show HEAD:<path>` 与工作区原始字节比较，14个文件全部一致，`different_from_HEAD=[]`；复核时HEAD仍为上方基线。完整本地依赖集合如下，均无本轮runtime／几何修改：

```text
src/components/world/attractions/attraction-layout.ts
src/components/world/attractions/ibd-cases.ts
src/components/world/attractions/ibd-guide-route.ts
src/components/world/attractions/ibd-model.ts
src/components/world/attractions/ibd-pack-inspection.ts
src/components/world/attractions/ibd-stock.ts
src/components/world/attractions/ibd-test-pack-inspection.mjs
src/components/world/attractions/ibd-test-player.mjs
src/components/world/attractions/ibd-yard-game.ts
src/components/world/attractions/ibd-yard-guide.ts
src/components/world/attractions/ibd-yard-layout.ts
src/components/world/attractions/ibd-yard-recovery.test.mjs
src/components/world/attractions/ibd-yard-verdict.ts
src/components/world/types.ts
```

`git diff --check`通过。Runtime执行lane未进行build、浏览器或4341切换，未push／deploy。
