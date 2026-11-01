# 入口 14 厘米高差连接

主线在世界坐标 `[-84.51,1.82,-53.2]` 普通步行卡住。只读检查确认 `WorldAlphaMineFoundation` 原来只有路标，没有连接碰撞面。`terrainHeight(-84.51,z)` 在 z=-51.6 到 -56.8 为 1.00；实际矿区碰撞在 z=-53.2 尚无面，z=-53.6 起顶面为 1.14，形成真实矮台阶。这与查询借用修复是独立问题。

原尺寸胶囊、3.6 m/s 目标、无跳跃的反事实实验，不加连接面时停在 `[-84.5208,1.8189,-53.2061]`，361 个物理步只移动约 0.05 米，与实机吻合。没有将卡点归因于相机或恢复按钮。

修复只接在独立 foundation：新增 `alpha-mine-foundation.ts` 共用可见／碰撞顶点，中心通道世界 x=[-87,-81]；两侧各 1 米渐降至岛面，外边界 x=[-88,-80]。z 从 -51.0 的 1.00 上升至 -53.1 的 1.138，再重叠至 -56.0；中央坡约 3.8°。交叠处比矿区顶面低 2 mm 避免绘制共面。12 个顶点、12 个三角，复用已有绘制批次和材质，新增一个固定 trimesh 碰撞体。地面 mesh 标记 surface，避免遮挡淡出；路标仍与它共用批次。

没有改美术生成源／资产、地形函数、胶囊、自动台阶、重力或控制器。`quarry-walk.mjs` 只新增测试用 configureWorld 注入点，在角色初始放置前加入测量地面与缓坡；路线中仍没有复位、传送或跳跃。

9 项新增测试通过，含真实矿区导出碰撞、生产 `terrainHeight` 的小块地面采样、原实机入口点、外入内、内出外、原土径斜向接入、x±2.5 米两侧通道、边肩侧向进入，以及三角朝向／坡度检查。`alpha-mine-foundation.ts` 严格类型检查通过，TSX 接线语法检查通过。反事实实验的岛面为已测量的 y=1.0 平面；正式用例直接调用生产地形高度函数构建局部地面。

```sh
node --max-old-space-size=192 --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/alpha-mine-foundation.test.mjs
```

候选矿区资产可以通过 `ALPHA_MINE_TEST_ASSETS=/absolute/candidate/public/world/alpha-mine` 指向，不必覆盖本分支资产。若美术新版改变入口边缘，主线应在最终候选上再运行本例。

未启动浏览器、Blender、服务或构建，未更新 4341。完整组件类型图与实机普通行走／材质衔接由主线验收；本条物理通过不替代渲染路径验收。

## 岩壁 v4 最终候选补验

美术交付目录 `/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-art/public/world/alpha-mine` 上，入口 foundation 与新增动态通行用例合计 **20/20 通过，0 跳过**。两条 lowExits 正反向、西坡中心／箱东接近／侧边路线均保持通行，新桥梁实体未阻挡这些行走路径。旧夹槽南／北尝试均报告 `spawn-overlaps-solid`，意味着原低位置已被实体封合，不宣称角色从里面走了出去。`3870aef` 的旧失败 receipt 保持原样。

- layout SHA-256：`b25b0d67585de7faa71b39ba6f6c90193206e0833d39fa32974a9a61a65805d7`
- colliders SHA-256：`d02ff7ba4132a6cf99a56b096375f4ab9d9897ab55e2695d3e6ed30ac9ce2487`

```sh
ALPHA_MINE_TEST_ASSETS=/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-art/public/world/alpha-mine node --max-old-space-size=192 --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/alpha-mine-foundation.test.mjs src/components/world/quarry-traversal.test.mjs
```

这是候选碰撞与数学地形补片的定向验证，未覆盖所有新岩面的镜头方向或人工跌落探索。原静态／相机测试由美术线另行运行，此处没有替其声明通过。
