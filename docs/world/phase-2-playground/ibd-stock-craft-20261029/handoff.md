# IBD 后库工艺 v42

基线：`10df592`。分支：`codex/goal-ibd-stock-craft-v42`。

本轮将三个后库货架的整片侧板改为前后立柱，补齐柱脚、层板下方的腹板与翼缘、前侧连接板和紧固件。各层承托顶面、底部极限、黄色前沿和原碰撞体积保持不变。八个静态木箱保留主体倒角，将窄压条改为方切截面，补上顶面木条与板缝，以节省的倒角面数支持货架结构。

四只真实交互箱共用的箱壳只追加外侧角条、压条、金属边条和带扣。原箱壳所有顶点、索引及材质属性作为完整前缀保留。新增部分低于局部 `Y=.995`，位于原外轮廓内，并避开标签、箱内取样、泡棉叉道和箱盖。没有添加标签、灯光或碰撞体。

| 几何指标 | 基线 | 当前 | 上限 |
| --- | ---: | ---: | ---: |
| 静态场景 | 47,853 | 47,669 | 48,000 |
| 单个箱壳 | 916 | 1,180 | 纳入代表场景 |
| 四箱与单套展开取样装置 | 72,235 | 73,107 | 75,000 |

CPU 几何与交互回归共 43 项通过，包含新增的货架开放侧面、实际梁截面与外侧箱壳净空测试，以及现有箱体、两只储备箱运输、箱盖、站位、通道、库存选择、取样状态和实际手部接触判定。初次加载交互测试时，稀疏检出缺少 `world-climate.ts`；从同一基线补齐该文件后，8 项交互测试通过，未修改其源码。

`qa.json` 保存面数、源码 SHA-256、原箱壳前缀校验，以及 256 个碰撞体、地面、步道、箱盖和 M6／M8 非箱壳部件的基线哈希。样品尺寸、量具、提升机构、锚点、状态、运输路径与货架布局未改动。

复验命令：

```sh
node --max-old-space-size=192 --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 \
  src/components/world/attractions/ibd-stock-craft.test.mjs \
  src/components/world/attractions/ibd-pack-geometry.test.mjs \
  src/components/world/attractions/ibd-stock-geometry.test.mjs \
  src/components/world/attractions/ibd-stock.test.mjs \
  src/components/world/attractions/ibd-pack-inspection.test.mjs \
  src/components/world/attractions/ibd-pack-play.test.mjs \
  src/components/world/attractions/ibd-yard-art.test.mjs \
  src/components/world/attractions/ibd-yard-geometry.test.mjs
```

已按批准的 `visual-calibration-20261027/ibd.json` 方向，对照主线 `qa-20261029/ibd-stock-v40/stock-day.png` 与 `stock-night.png` 实施。尚待主会话串行拍摄本轮运行时日夜图，检查货架结构、箱壳边条和带扣在实际镜头下的辨识度。原平板箱盖不属本轮所有权，仍保留现状。没有运行浏览器、渲染、完整构建或帧率测量；源码和 CPU 几何通过不代表视觉验收完成。

本地候选提交，不推送、不更改 4341。
