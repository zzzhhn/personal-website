# Alpha 因子矿场：美术批次与交接

2026-10-25。分支 `codex/world-alpha-pilot-art`，基线 `8310f66`。

## 当前交付与验收边界

已制作分层采石场主体、两段坡道、中层木桥、工具架、顶层棚架和提升结构、敞口石砌回测池、三个接石台。当前静态 GLB 为第三轮轮廓修订，技术交换与实际 Rapier 路线／拾取检查通过；美术仍待主线游戏内光照和视角验收。墙顶和前沿已降低并错开，部分侧壁收口仍显阶梯状，不能把离线渲染通过等同于最终视觉通过。

参考为主线统一采石场图 `alpha-pilot/references/quarry-art-direction.png`。方向是天然断岩、木结构和风化金属，矿物保持局部光泽。第一轮规整条带和棋盘地面已否决，失败图及确切 GLB 保留在 `tools/world/alpha-mine/evidence/initial-flat/`，仅作对照，不是装载候选。

本线负责 static／veins／layout／colliders。detector／pickaxe／ore 由主线安排的独立建模工作拥有，共享工作树时逐文件暂存。共享运行时、角色动作、车辆、岛屿地基／海面遮罩、结果和试玩页由主线维护。没有推送或部署。

## 固定空间合同

所有位置为设施局部 glTF 米制坐标，+Y 向上、入口朝 +Z、纵深向 -Z。根 [0,0,0] 是入口横向中心、最低行走地面、入口线的交点，不能用包围盒中心代替。主线放置 [60,1.14,-55]、yaw 0。占地约 x [-16,16]、z [-36,0]，行走标高 0／3／6，岩石最高 9 m。地基由主线接到海面，设施不挖地下空腔。

入口净宽 8 m。两段坡道宽 2.6 m，通行净宽 2.4 m，坡度约 14.04°。路线和三层站位以 `public/world/alpha-mine/layout.json` 为准，生成源为 `layout.py`。木板间 12 mm 缝隙由同坡度连续支撑面补齐。

碰撞格式固定为 `{surface:{vertices,indices},solid:{vertices,indices}}`，顶点使用同一设施局部坐标。岩石／地面／池体使用源网格三角，木结构使用明确的定向盒和连续支撑面，不使用包住整场地的凸包。木结构小倒角容差不超过 12 mm，池沿／接石台使用 25 mm 倒角。

接石台高各层 +0.52 m，矿石中心目标为各层 +0.70 m、矿壁 socket 沿 +Z 前移 0.30 m。原 +0.10 m 落点会让拾取站位被台前沿阻挡，已前移 0.20 m。半径 0.15 m 的矿石平面投影全周仍受台面承托，没有扩大交互半径。

## 文件与节点

| 文件 | 结构与用途 |
| --- | --- |
| quarry-static.glb | 根 alpha_mine，六个物性材质批次，带矿脉 mount、oreRest、池边和工具架 socket |
| colliders.json | 同版静态支撑／硬碰撞三角 |
| layout.json | 轴向、根、路线、站位、落点、动态文件与节点合同 |
| veins.glb | 根 vein-lower／vein-middle／vein-upper，各根局部为零，主线按 layout 对应 socket 放置 |
| detector.glb | 独立道具工作交付；根 detector，grip_R／scan_origin |
| pickaxe.glb | 独立道具工作交付；根 pickaxe，grip_R／grip_L／head_contact |
| ore.glb | 独立道具工作交付；根 ore，grip_R／grip_L／release，可染色材质 ore_mineral |

矿脉每根有 `<id>_intact`、`<id>_cracked`、`<id>_open` 三状态组。GLB 包含全部状态，初始化仅显示 intact。矿脉为闭壳，开裂／采空改变真实前表面深度。根下 `<id>_impact` 对应完整面中心 [0,0,0.255]，`<id>_oreRest` 为矿石中心相对位置 [0,-0.60,0.30]。

最终 GLB 另含 `<id>_<state>_impact`，三状态局部 z 为 .255／.160／.050，让第二次击打跟随凹面。`layout.dynamicAssets.veins.roots[id].stateImpactSockets` 给出映射；`evidence/veins-qa.json` 记录独立 GLB 的 15 个 socket 及与真实表面的距离，最大约 4.03 mm。

| 矿脉 | 因子 | 矿物色 |
| --- | --- | --- |
| lower | REVERSAL_5 | #b7864d |
| middle | ROC20_RANK | #5c9b91 |
| upper | LOW_STD_20 | #9ba8b1 |

颜色识别身份，不代表收益或优劣。主线池边收集托盘不重复制作。

## 已完成的核验

静态第三轮为 23,273 三角、6 材质批次、740,792 bytes。原生编辑对象与合批三角数一致；保存重开 BLEND 和独立导入确切 GLB 通过，包围盒最大偏差约 9.54 微米。六类物性保留石、土、木、金属、帆布、草的粗糙度差异；石和土共用一张内嵌 512² 中性颗粒图，已从实际 GLB JSON 确认一个 image 和两个 baseColorTexture。预览地板、水面、灯光和相机不进入 GLB。

纯几何检查：40 编辑对象，零退化／闭壳问题，路线及坡道两侧支撑采样零失败；碰撞为 630 surface／6,494 solid 三角。`layout-qa.json` 另记录矿石落点全周承托样本。

主线实际 Rapier 测试以本工作树资产运行，三项全部通过：路线支撑及 .48／.34 胶囊净空、三层站位和接缝、开采与 0.70 m 拾取位的胸口视线及胶囊空间。这只证明指定路线／站位，不是完整扫掠、角色握点或整场游戏验收。`rapier-receipt.json` 绑定当次输入哈希。

最终矿脉 82,108 bytes，9 状态合计 3,348 三角，原生／重开／独立 GLB 检查通过。外缘和预览裁切已修正并实际看图。四材质的 baseColor／roughness／metallic 持久化核对通过，矿物 roughness .48、metallic .10，基岩 roughness .94、metallic 0，无发光。`veins-qa.json` 绑定资产哈希，`veins-render.json` 说明临时预览变换。实际游戏击打接触仍由角色／主线验证。

## 复现与证据

轻量合同／几何：`python3 tools/world/alpha-mine/geometry.py`，然后 `python3 tools/world/alpha-mine/qa_layout.py`。前者重写 layout／colliders，静态 GLB 必须随后同版重导，中间状态不能交给运行时。

使用已有 Blender，参数 `--background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python tools/world/alpha-mine/build.py`；矿脉入口为 veins.py。先预检并取得共享 `/tmp/bobby-world-phase2-heavy.lock`，完成立即释放，编码期间不持锁。不安装工具或启动新浏览器。低于 1 GiB 磁盘暂停重型任务；本轮曾触发，资源恢复后才串行完成最终小型矿脉导出。

`batch1.blend` 保留编辑／合批场景，`veins.blend` 保留矿脉状态。`batch1-qa.json` 和 `render-manifest.json` 绑定静态 GLB／源哈希及预览设置；overall.png、entrance.png、middle.png、overall-clay.png 已实际看图。矿脉状态预览为 veins-states.png。玩家视角、日夜光照、真实击打／拾取／投池仍待主线整合验收。
