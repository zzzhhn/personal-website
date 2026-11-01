# Preview 审图记录

已实际读图：批准方向概念图 `../djc-beach-club/concept-v4-finns-game-style-20261027.png`、网页日床 `../djc-render-parity-20261101/perf-after-daybed-noon.jpg`，以及本资产 `umbrella-before.png`、`umbrella-after.png`、`umbrella-structure-preview.png`。

源码捕获仅包括原来的杆与伞面，共2件、48三角面。before保留原顶点、split normals、颜色和粗糙度。它是同灯光的真实源码离线重现，不是网页截图。

当前preview有567个独立命名网格、42,268三角面、4材质。原生实体全部闭合，零非有限坐标和退化三角面；半径1.643 m，局部高度0至2.82500005 m。低弧伞冠、径向拼片与厚檐边已经可读；低机位能检查弯骨、短撑、销轴和滑套的支撑关系。木材没有叠加额外tint，尚无AO。

最大问题曾是八处骨端布袋在顶面露成小亮块。第一轮仅降低袋中心，未同时处理布面坡度，问题未充分消除。最终将袋的局部轴对齐布面切线，沿法线向下放置；随后重建preview与GLB并读回最终after、fresh underside、fresh top和clay，确认顶面亮块消失，袋留在背面的骨端支撑处。最终图片、blend与GLB均包含此修复。

三轮preview及finish均已结束，Blender退出、共享heavy FILE锁已释放。未启动任何新浏览器或GUI实例。最终GLB与fresh import检查已完成，实际网页验证仍由主线执行。
