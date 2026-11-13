# Alpha 第一批整合候选

2026-11-14。独立工作目录 `wt/alpha-batch1-integration`，不替换4341、不推送远端。分支 `codex/alpha-batch1-integration-20261114`。

## 第一轮本地合并

本地merge b426532合入scene最终064856c与traffic已验证功能候选0ac66c7。二者早期互相cherry-pick，产生30个重叠冲突；按已声明作者所有权解决，逐文件来源见merge-resolution.json。

- scene保留新树/坏枝、纸灯/小屋、地形/材质、地图和其捕获工具及原始证据。
- traffic保留所有transports/rides及WorldActors、WorldGuide、WorldGuideAttraction、WorldNight、相关attraction adapter，并保留最新三GLB与Blender工程。
- 主协调逐项比较925个受核源码/资源/制作文件的index内容与各自冻结来源，无不一致。主岛现站其它页面未改。
- 原始stdout日志的尾随空格原样保留，没有为了git diff检查改写历史证据。src/public/tools的diff检查通过。

## 码头生成器的整合差异

scene的alpha-art比traffic增加木材UV/端面/颜色变化。主协调只替换该依赖做两次相同pier构造，比较全部材质分组：position、normal、index、groups及decks/posts/rails记录完全一致；不同的是wood/darkwood的UV/alphaEnd/颜色和metal/rope的顶点颜色。证据为pier-builder-comparison.json。

因此旧traffic码头物理包络不会仅因这次builder合并改变；实际颜色变化仍需整合看图，不能冒充视觉逐像素相同。不重跑整套船体包络。

## 尚未交付

交通最后一项木槽/登乘走道材质样板仍在独立chat精修，需接其新冻结提交。渡船目前仍是DEV fixture入口，待最后模块对齐后由主协调接入普通路线，处理重复fixture注册与地面mask一致性，再从普通入口完整走通。

接入后做一次必要type/build、实际普通入口/前后图、同条件帧耗与WebKit。真实M3 Air/Safari不以本机M5/WebKit替代。已过动作的旧冻结证据保持归属，不因本合并重复全量矩阵，也不将本文件视为最终验收。
