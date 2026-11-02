# Bin R2 原生导出

Blender 5.1.2在共享锁下单独导出bin；bench与R1归档未重建。输入为`7253ec60b053370d449efde37f09f64d347b3118`实际TS构造提取，source JSON SHA-256为`5d13910c0642dff39378b9d6f1469f86f38bee38bb6dcf9551dc5a17e0cc3c47`。

新建档案位于`tools/world/facility-craft/batch6/native-bin-r2/bin.blend`，portable与报告位于`public/assets/world/craft-batch6-bin-r2/`。4436tri、12个命名网格、7种静态PBR材质、0图片，全部portable primitive保留COLOR_0；重新导入三角数一致，包围盒偏差0。portable为266232字节，SHA-256为`efc6b55269980df6f5aff9b4b33b9b2fed9dbdda4b1ffb0bcbb8b878b326ee68`。

桶身／盖使用共享paint槽，卷边／口沿／座圈／底鞋使用局部bare槽，上下内胆及橡胶保持matte槽。没有整桶金属化或新增贴图。原生导出保留几何、顶点色和静态PBR，游戏仍由TS Builder经原StreetBatch／StreetMaterial路径绘制；portable没有替换运行几何，无法单独证明游戏中的环境、夜间、阴影或淡出效果。后续实际复核结果见`R2-REVIEW.md`。
