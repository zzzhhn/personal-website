# 栏杆原生档案

Blender 5.1.2在独占锁下串行生成两族可编辑`.blend`与portable，重新导入的三角数一致、包围盒最大偏差均为0。输入来自实际静态／动态视觉工厂切片，不是旧图重建或仅供离线看的另一套高模。

| 档案 | 内容 | 三角数 | 命名网格 | 图片 |
| --- | --- | ---: | ---: | ---: |
| seawall | 实际跨长的单位栏杆＋端柱构造样件 | 1060 | 5 | 0 |
| timber | 真实`rail-beam-5`坡梁及实际两柱，以第一柱归零 | 916 | 11 | 3 |

seawall的端柱放在单位跨末端是构造fixture，不冒充完整27跨实装或生产截图；实际全段的首／中／末跨与端柱闭合由真实placement源检查和浏览器照片另验。timber保留真实.0778358rad坡度与两柱相对高度。

档案位于`tools/world/facility-craft/batch6/rails/native/`；portable与逐族报告位于`public/assets/world/craft-batch6-rails/`。木材借用已有R2共享3图，制造UV沿构件长轴、角点在背部／下方解缝，法线强度.18；端面色环为程序色，不称照片扫描。全部primitive含COLOR_0，wood含TEXCOORD_0、颜色与法线图。

静态PBR档案不含游戏环境缓存／night／距离fade／重置；运行时仍使用Builder→原批次→共享Surface／StreetMaterial。没有把portable被保存或fresh-import通过当作WebGL视觉接受。首次提取遗漏旧导出器要求的代理hash字段，补齐真实hash后重导；当前源JSON与导出报告SHA逐项一致。普通视角复核正在进行。
