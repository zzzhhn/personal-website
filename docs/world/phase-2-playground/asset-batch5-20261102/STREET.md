# 第五批街道设施交接

2026-11-02。基线 `2f22560fff2174195d8ce70b855ae4b871a388a7`，仅在 `personal-world-craft-batch5` 的 `codex/world-craft-batch5` 实施。保留切面海湾、Art Lock 材料词汇与现有设施身份；精修结构、支承和装配关系，不重排布局。使用 integrate-design、blender-material-craft 及 forms/review references。未自行启动 Blender、浏览器、构建或其它重型作业，未提交或推送。

## 八组 construction map

| 家族 | 实际构造与近景应读出的关系 | 保留契约 |
| --- | --- | --- |
| 长椅 bench | 厚度明确的五块座板、三块靠背板，铸造侧框承托横向座托与两条纵梁，脚掌接地，扶手接回框架 | 座面顶点 y=0.47、原座位与交互锚点、1.8 m 长度 |
| 候车亭 shelter | 屋面折边、周梁／横梁、四处膝撑、压条嵌玻璃；座板分片，三处斜托支承 | 原玻璃／海报／四柱／地台保留，朝 -X 开口，座位位置不动 |
| 路灯 lamp | 压制双壁灯罩、独立反光碟、压圈／密封圈、真实厚度灯片及压夹，检修门框 | 原弯臂、杆、底座、灯头根和光池坐标；glow 1/2；不扩改 year／park 的 arm=0 共用灯 |
| 交通信号机 signal | 箱体后盖／胶缝／连续铰链，灯片周围封边，半周遮光罩，立柱抱箍与悬挂夹架 | 原立柱／横臂，三色中心与编码 3/4/5，固定时钟接口与碰撞 |
| 垃圾箱 bin | 带内壁和底板的桶体、加强筋、翻盖环与铰链，真正开口与内侧导流／挡板 | 蓝灰桶、奶白盖的身份，根和原物理包络；新投入口不是黑色贴片 |
| 施工路障 roadblock | 折弯矩形钢腿、顶部铰轴、两片限位撑杆与中央关节，厚板包边 | 原双面斜纹板及反光点、原 A 架尺寸和动态代理 |
| 海堤栏杆 seawallBay | 立柱底座／套靴，扶手与横杆接套，竖杆插接套圈 | 根 x=0、跨距参数 len、1 m 扶手、原地下 0.5 m 埋深 |
| 山路木栏 timberPost + timberBeam | 金属 U 形托座支承木梁，侧板／横销与木柱连接；纵向木材浅裂缝和端面替换原等距环纹 | 两个 Builder 计一组；post 地下 -0.45、梁底 datum 0.57、实际 len／yaw／pitch 与可触碰梁不动 |

## 实现与物理分离

新增 `WorldStreetFacilityCraft.ts`，由原 `WorldStreetAssets.ts` 的九个 Builder 入口调用 `finishStreetFacility(baseline, kind, lod, options)`。其中 timberPost／timberBeam 同属一个设施家族。默认重做近景视觉，L1 完整复用旧几何，不增画批或每实例更新循环。原 `aMat`、`aSuv`、glow、atlas 与具名 part 保留语义；新增部件名指出支承／装配用途。

原 Builder 在 craft 前完整保留。返回视觉 Builder 的 `.hulls()` 始终从该原 Builder 取逐值相同的点云，因此 StreetKnock、固定设施与共享触碰逻辑不随外观改变。`streetFacilityCollision` 还为 `WorldStreetStatic.tsx` 的任何 trimesh 入口提供原 Builder，临时 proxy geometry 在提取碰撞数组后释放。没有移动座位、碰撞、灯池、布局或场地；没有以视觉新包络重新算物理。

同包 `facilityCraft=legacy` 完整刷新可回到原构造；移除该参数再刷新回默认候选。legacy 的九个 Builder 全部视觉数组、具名 parts、cells 和 hulls 与固定旧提交逐字等价，L1 在两分支也完整相同。切换是材质／几何创建时读取 URL，不是运行中热切换。

## 实测几何与成本

| 家族 | 基线 L0 三角形 | 候选 L0 | L1 保持旧版 | 候选具名 parts |
| --- | ---: | ---: | ---: | ---: |
| bench | 1392 | 1328 | 132 | 11 |
| shelter | 720 | 1828 | 180 | 17 |
| lamp | 1110 | 2118 | 192 | 6 |
| signal | 1406 | 3210 | 214 | 7 |
| bin | 874 | 2180 | 118 | 4 |
| roadblock | 856 | 1440 | 192 | 4 |
| seawallBay | 256 | 636 | 40 | 3 |
| timberRail，2 柱 + 4.2 m 梁 | 472 | 780 | 72 | 5 |

表中是代表资产几何，不能直接推断全岛帧率。近处路灯、信号机与垃圾箱成本上升较明显；实际日夜效果与同窗口性能决定是否接受。原 StreetBatch 合批／LOD／距离阈值未变，不增加纹理、实时光或额外 pass。BUDGET 仅随实测近景构造更新 QA 上限，不冒充性能保证。

## 原生源、导出与命令

- `tools/world/facility-craft/street/source/*.source.json`：8 家族的精确 TS named 几何快照，含 baseline／candidate、L0／L1、位置／法线／线性色／aMat／aSuv、具名 part、物理 hash 和源码 SHA256。约 5.74 MB，置于 tools，不进入 public。
- `tools/world/facility-craft/street/native/*.blend`：主执行运行脚本后生成。每组分部可编辑，保留原 root、米制、隐藏 BASELINE／L1 及独立 RIG。
- `public/assets/world/facility-craft/street/*.glb`：主执行生成后的 fresh portable proof。运行网页继续使用纯 TS Builder，没有新增 GLB 下载路径。
- `public/assets/world/facility-craft/street/manifest.json`：固定基线、源码 hash、实际计数与离线源路径。原设施是纯几何生成器，没有旧 GLB；manifest 明确 `originalGlb=null`，记录真实旧源码 SHA，不捏造原 GLB SHA。
- `build_native.py`：从实际 JSON 转为具名 Blender 部件，转换一次 `(x, -z, y)`，材质使用原粗糙度／金属度／线性色及光码，保留原 atlas UV，导出 GLB 后 fresh 导入检查三角形与 bounds。原生、fresh、baseline 同相机／灯光／曝光／分辨率采图，另出 native clay。

轻量检查与源提取：

```sh
node --test tools/world/facility-craft/street/street.test.mjs
node tools/world/facility-craft/street/extract.mjs
```

主执行预检、独占重型锁后先跑代表长椅，再跑全部：

```sh
blender -b --python tools/world/facility-craft/street/build_native.py -- --only bench --render
blender -b --python tools/world/facility-craft/street/build_native.py -- --render
```

每组输出 `docs/world/phase-2-playground/asset-batch5-20261102/street-review/<family>-baseline/native/fresh/clay.png` 和 receipt。receipt 记录可编辑源／GLB SHA、fresh 三角形及 bounds 差值、尺寸、材料、部件、米制与完整同 rig 参数。脚本成功只证明生成／回读；主执行需打开图审阅。

离线材质的海报采用与两分支一致的中性占位，信号灯采用固定状态；真实 poster atlas、交通灯时钟与光池由网页现有系统负责。没有把离线占位声称为真实网页表现。

## 实际实例与网页固定机位

完整相机／target／FOV=45／根／yaw 见 `public/assets/world/facility-craft/street/cameras.json`。由实际 `solidsV4`／`knockablesV4`／`OBSTACLES_V4` 与当前 StreetFixed／Rails／Knock 变换规则派生，供主执行在 4359 冻结机位；这些是建议数值，尚非网页已核实的视图。统一 balanced，固定 12:00／00:00，保持相同曝光、画布、天气及缓冲状态。

| 家族 | 代表根，世界 XYZ，m | yaw，rad | 建议观察 |
| --- | --- | ---: | --- |
| bench | `[30.1, 1.15, -28]` | `1.5708` | 前侧约 3.5 m，看座托、分板与侧框 |
| shelter | `[29.6, 1.15, -20]` | `0` | 西南约 4.7 m，看屋盖下侧、玻璃压条与座托 |
| lamp | `[16.4, 1.15, 13]` | `-1.5708` | 约 7.8 m 全体，另在灯头下方检查压圈／反光碟 |
| signal | `[29.8, 1.15, -1.9]` | `1.5708` | 约 7.7 m 全体，另看 2.1 m 近灯箱后盖／遮光罩 |
| bin | `[15.4, 1.15, -24.6]` | `0` | 约 2.1 m 斜上方看真实投入口与盖框 |
| roadblock | `[-3, 1.14, 28]` | `0` | 约 3 m 斜前方看 A 架与限位撑杆 |
| seawallBay | `[31, 1, 26]` | `1.5708` | 约 2.8 m，看首跨中点与接套；地下埋深另列 |
| timberRail | `[-49.2723, 2.273, -76.552]` | `1.5661` | 首根实柱约 3.2 m，看 U 托座与梁端接触，按实际曲率补全跨 |

bench／shelter／seawall 位于同一海堤街，可补共用街视，但近景构造仍需各自读得出。接口验证覆盖原数据不代表人眼已接受新的形体，交互实际试玩仍需坐下／起身、车辆触碰／复位、昼夜发光与 LOD 边界检查。

## 当前证据与剩余项

轻量 Node 测试 4／4 通过：所有视觉与法线有限、零退化三角；九个 Builder、两级 LOD 的物理逐值等同 baseline；完整 legacy 与固定旧源等同；atlas 面、光码、座位／灯池、变长木梁／海堤接口、静态 trimesh proxy 均定向检查。Python 脚本已作语法解析，`git diff --check` 通过。

此 lane 尚未运行 Blender、native／fresh 渲染、WebGL、实际交互或帧率验收。主执行需补：原生／fresh 同 rig 图及 clay 审阅、8 家族真实网页日夜前后图、碰撞／座位／触碰／恢复试玩、同机位缓冲一致的性能窗口。生成器中有意保留既有薄面标识与灯罩接缝，不能以合并后跨部件的拓扑计数代替逐部件构造审查。若图像或性能拒收，应返修对应家族，不移动布局或代理掩盖问题。


## 主执行最终交接状态

主执行已生成并亲阅8组native/fresh/原始对照及真实网页昼夜图，5项street测试通过；已核对真实座位状态/起身grounded，尚无车辆撞击试玩证据。最终机位以views.json为准，FOV50。性能未决，详见RESULT.md。
