# 意图工坊桌面设备接触修复

2026-10-28，基线 `b76903f`。完成源码与轻量真实 Rapier 检查，未提交或推送，交接后停止写入。实机与相机由主线验证。

## 修改

- `src/components/world/attractions/intent-workshop-geometry.ts`：从七个柜台的静态美术部件和接件滚筒中提取高于原柜体 1.36 m 上界的部件三角面，复用世界坐标顶点并去重，返回 `contactSurface`。保留完整部件表面，不以整台机器的包络盒填满机械空隙。
- `src/components/world/attractions/WorldIntentWorkshop.tsx`：在原 fixed 刚体中挂载一张 `TrimeshCollider`。
- `src/components/world/attractions/intent-workshop-contact.test.mjs`：六项定向测试。

未改 layout、已有 44 个柜体／立柱／导轨碰撞、运动机关、悬吊载具、WorldActors、相机和其它场景。主线的 `WorldPlaytestReadout.tsx` 改动保留。

## 接触证据

修复前真实胶囊半高 0.48 m、半径 0.34 m，脚底位于柜体顶面上方 1 cm，可在四处直接穿过可见静态机器。修复后同一路径被阻挡：

| 设备 | 可见表面射线距离 | 新胶囊扫掠停止距离 |
| --- | ---: | ---: |
| 空位探照仪 | 0.760 m | 0.420 m |
| 循环检修机 | 1.780 m | 1.320 m |
| 告示改写辊 | 0.900 m | 0.400 m |
| 预订执行杆旁设备 | 1.630 m | 1.030 m |

射线与胶囊使用不同高度；两列不是半径误差比较。相同射线的可见面与物理接触面误差均小于 0.1 mm。

其余检查：七个柜台均有桌面上方设备接触；21 条原开放的地面接近／旁侧扫掠和 14 条柜台高度旁侧扫掠通过。接件台左侧原铃座占位保持相同接触距离。改写辊下方、分离器中部、检修环孔隙的小球扫掠通过；悬吊运输高度的横向路径未增加静态阻挡。

## 开销与验证

新增 **1 个静态 Trimesh、2,992 个接触三角面、1,762 个去重顶点，数组共 57,048 bytes**。静态 body 仍为 7,788 个可见三角面、glow 仍为 272 个；两者所有渲染属性和索引的 SHA-256 与修复前一致。无新增材质或可见几何。

```sh
node --test --test-concurrency=1 --test-reporter=spec src/components/world/attractions/intent-workshop-contact.test.mjs
```

中断后复跑六项全通过，约 0.54 秒。`git diff --check` 通过；修改的 TS／TSX 文件 `transpileModule` 语法诊断为零，不等同于完整类型检查。Rapier 只有既有初始化参数弃用提示。

未验证实际按键跳跃全过程、完整加工动画的相互接触、载具末段下降与交付、全场性能及浏览器体验。运动几何和逻辑保持原样；本轮只对悬吊运输高度与必要静态接触留证。没有打开浏览器、图片服务，或执行全场构建。
