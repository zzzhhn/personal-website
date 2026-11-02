# Camp 五件设施构造精修

工作分支 `codex/world-craft-batch5`，冻结代码基线 `2f22560fff2174195d8ce70b855ae4b871a388a7`。制作范围是 C12 吉他、C13 哑铃、C14 炉灶与炒锅、C15 行李箱、C16 桌上提灯。保留现有切面世界、橙色箱壳、暖木和低彩金属，改善真实构造与近景材料反应，不改变营地布局、物理或交互内容。

当前证据：脚本、runtime 适配、15 个原始文件 SHA 冻结和轻量测试已完成。主执行用 Blender 5.1.2 串行生产，首次发现 C15 筋条倒角退化后修生成器重跑，五件 native 均为零退化面，fresh GLB 数值检查通过。同 rig 审图正在由主执行串行运行，审图器已适配 5.1 的 `BLENDER_EEVEE` 实际枚举。网页日夜、交互、性能与用户接受仍待单独验证。正式尺寸、三角面、材质和字节数在 `public/assets/world/facility-craft/camp/manifest.json`，fresh 文件复核在 `qa-pack.json`。

## 五件 construction map

| 对象 | 构造、支撑与开口 | 近景实际可读部分 | 材料与实现 |
| --- | --- | --- | --- |
| C12 吉他 | 3 mm 面板带真正音孔、4 mm 侧带、独立背板，琴颈和琴踵接上部琴身；沿用 A 架、橡胶托点和 15° 后倾 | 音孔可见暗背板，包边、三道音孔镶圈、16 道等音律品丝、品点、琴桥和六弦钉 | 面板／侧带／背板保留不同原调；木材 roughness 0.60，品丝与弦为钢，不使用平涂黑圆伪装孔洞 |
| C13 哑铃 | 六角模压头保留原接地点，握杆进入钢肩与头部轴套 | 两个凹入端盖、头肩和正反螺旋交叉滚花；左右头不变成浮空圆盘 | 橡胶 roughness 0.88，钢 roughness 0.30／metalness 0.82，滚花有实际 0.6 mm 级几何 |
| C14 炉灶与炒锅 | 堆石炉保留朝火堆的口，补侧门墩与石楣、凹入灰床／耐火内衬；四个支承垫接炉排；锅为有壁厚空腔 | 卷边、木柄与套筒、锅壁铆接、辅助把手／挂孔、铲子和燃料解释实际烹调用途 | 石 roughness 0.94，锅铁 0.56／0.55，卷边钢与木握柄区分；不增加火光、灯或传输通道 |
| C15 行李箱 | 两个圆角半壳绕真正凹入拉链轨，双拉片；轮叉两颊跨在胎两侧，轮轴穿过支承；双段伸缩管和握把 | 壳缝连续经过四边，前后筋条、底护角、侧提手返回间隙和空白行李牌 | 原橙壳 roughness 0.46，橡胶轮与金属轴不同；修复了 8 mm 筋条上 4 mm 倒角闭合，改 2 mm 半径 |
| C16 提灯 | 保留燃油罐、桌面底面、四向护笼、支点和提梁，罩为 2 mm 薄壁闭合断面；通风帽由离散肋支承，真正留通风间隙 | 灯罩内的独立灯芯、加油盖、调芯旋钮、护笼与提梁的连接 | 灯罩使用普通 alpha 0.25 和既有共享环境反射；没有 transmission、额外反射渲染、实时灯；只有小灯芯沿原昼夜强度发光 |

全部新几何由本脚本原创制作，复用本项目冻结营地生成器的原始几何。没有下载照片、外部网格或新增贴图，图像数与纹理字节数均为 0；没有把程序纹理宣称为扫描材质。

## 冻结源和实际接口

完整 GLB、原生 `.blend`、生成器及布局源码 SHA 在 `tools/world/facility-craft/camp/baseline-contract.json`。生成器每次运行先复核这些实际文件。基线路径固定读 `personal-world-djc-release`，输出只能在本 checkout 的真实 `facility-craft/camp` 目录；不沿旧 public overlay 写入。

| 原对象 | GLB SHA256 | 原局部尺寸 x／y／z，米 | 原三角面／材料／图像／字节 |
| --- | --- | --- | --- |
| C12 | `6447bb09b27ae63e4518e06c373a9cdb0dba0b3ed1692cd4ce145bc088e04429` | 0.5604／1.2431／0.4920 | 2384／1／0／26888 |
| C13 | `3d725e051f99cb214afa9da1991917169641834ff0b3394c314fe2a950366ac8` | 0.1290／0.1178／0.3380 | 836／1／0／7384 |
| C14 | `c45760c5875e665654079cf1cceee9ee9da72cf6f00b19365f20b085a63c44b7` | 0.8501／0.5362／1.0054 | 2724／1／0／28112 |
| C15 | `19784c0ff5c7e7cadf7b1e62c3b9befb0e6c63c0ce4ae3a022e395cfa12efdab` | 0.2880／0.8641／0.5020 | 1964／1／0／19700 |
| C16 | `f64d0543150c866377296dbd4f1a66435de5cc81f5255f4f6faddc67810c3691` | 0.1640／0.3126／0.1860 | 952／2／0／12988 |

原点采用原始构件的 recenter，新增配件不重新居中。`C14_wok` GLB pivot 精确保留 `[0.027671098709106445, 0.3179999887943268, -0.07235637307167053]`，candidate 只移除自身 node transform 一次，再交原 `Animated` frame 和反馈层控制。`C12_strings` 仍是独立节点并映射至原 `camp-content-C12-strings`。六弦 X 振幅、全吉他 X 摆动、双哑铃 X 摆动、锅本地 Y 抛动与 Z 转动、箱整体 Y 跳动的原表达式不变。实际批四代码没有箱盖开合或拿起接口，未虚构实现。

成功生产候选包 SHA256 为 `d4b3588d67b4348efe209c8a17011e5b84b21b3fa615350d870298118c2ee07b`，1,501,644 字节。下表是实际 fresh GLB 读取值；C13 页面 scale 仍为 1.7，C14 为 1.3，不把局部尺寸误作页面尺寸。

| 候选 | 实际局部 x／y／z，米 | 三角面 | 物理材质类 | GLB primitive 数 |
| --- | --- | --- | --- | --- |
| C12 | 0.560434／1.243828／0.492000 | 8776 | 7 | 8 |
| C13 | 0.129000／0.117779／0.339424 | 5556 | 3 | 3，每只 |
| C14 | 0.852724／0.536179／1.005407 | 5348 | 5 | 7 |
| C15 | 0.286000／0.864531／0.506000 | 9964 | 5 | 8 |
| C16 | 0.164000／0.312944／0.185999 | 3256 | 4 | 5 |

包内 32,900 面，场景双哑铃计 38,456 面，共 34 个 GLB primitives 供近景材质分离。其余世界合批与阴影成本不包含在此数字内。行李箱新圆轮外接面较旧离散轮最低点低约 0.42 mm，固定 4.904 的原 body 起点仍有余隙；物理 hull 完全不随新轮改变。没有把这类微小视觉偏差伪报为物理回归。

旧 GLB 独立供固定炉体 trimesh、吉他／哑铃／行李箱 convex hull，质量分别仍为 4 kg、16 kg 每只、12 kg。30 秒离位淡出归位、8 个座位、展品锚点与所有原灯池不变。C16 仍无碰撞体并在原桌 footprint 内。

## 原生可编辑性和输出

`tools/world/facility-craft/camp/source/camp-facilities-source.blend` 中：

- `SOURCE_CONSTRUCTION_EDITABLE` 默认显示，按明确构造和连通壳保留面板、侧带、背板、琴桥／颈／品丝／弦／架、炉石／炉排／锅壁／柄／铲、箱壳／拉链／轮叉／拉杆、灯罩／帽／护笼／提梁／灯芯等可单独选择部件。
- `CRAFT_ASSETS` 是由相同构造导出的批次，native 默认隐藏，审图脚本显式打开。runtime 只加载这一份，不加载 source-only 副本。
- `BASELINE_NATIVE_READ_ONLY_COPY` 留有真实旧 native 对象的独立副本，默认隐藏；原始源文件本身不改。

运行包为 `public/assets/world/facility-craft/camp/camp-facilities-v1.glb`，5 个 family roots，共享 loader 几何和已有环境缓存。每个实际运动实例只持有自身材质副本，使 30 秒 reset fade 不污染其它实例。没有纹理上传、额外渲染 pass 或新的物理几何。具体 draw 与页面性能仍需主执行量测，不能用三角面数替代。

## 世界位置与可重放近景

完整精度的双哑铃、展品 E 锚点和建议相机在 `tools/world/facility-craft/camp/cameras.json`，由 `capture_locations.py` 从冻结布局公式计算。相机是待实机校准的建议，不冒充已经观察的网页机位。

| 对象 | 世界位置 x／y／z | yaw，弧度 | scale／支撑面 |
| --- | --- | --- | --- |
| C12 | -42／4.9／45 | 1.5707963267948966 | 1／4.9 |
| C13 第一只 | -41.05／4.9／15.05 | -1.6207963267948966 | 1.7／4.9 |
| C13 第二只 | -41.1／4.9／15.62 | -1.4507963267948965 | 1.7／4.9 |
| C14 | -31.3933982822／4.9／40.6066017178 | 2.356194490192345 | 1.3／4.9 |
| C15 | -27／4.9／30 | 3.141592653589793 | 1／4.9 |
| C16 | -53.3278506346／5.75／40.4510382259 | 1.2853981633974483 | 1／5.75 桌面 |

Pushable 实际 body start Y 是 4.904。网页使用 `?qa=1`，基线使用 `?qa=1&facilityCraft=legacy`；legacy 精确走批四原视觉材料与几何，不请求新包。以同画布／质量／天气／曝光在 12:00 和 00:00 调用 `window.__worldCampQA.close(position,target)`。该固定 shot 会暂停反馈时钟，验证真实 E 反馈先调用 `.release()`，去原锚点正常触发。C16 没有新增 E 交互。

## 可复现命令与验证边界

以下重型命令仅由主执行在 `/tmp/bobby-world-phase2-heavy.lock` 内串行执行。本协作者未启动 Blender、render、build、browser 或 server。

```sh
BLENDER -b -t 2 --factory-startup --python-exit-code 1 -P tools/world/facility-craft/camp/build_camp.py -- --base-root /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release --out-root /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch5
python3 tools/world/facility-craft/camp/qa_pack.py
BLENDER -b -t 2 --factory-startup --python-exit-code 1 -P tools/world/facility-craft/camp/review_camp.py -- --out-root /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch5 --views overview --states rest
BLENDER -b -t 2 --factory-startup --python-exit-code 1 -P tools/world/facility-craft/camp/review_camp.py -- --out-root /Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch5 --families C12 C14 --views overview clay grazing --states motion
```

`BLENDER` 替换为主执行发现的真实 Blender 可执行路径。第一轮全 5 件 × baseline／native／fresh 为 15 张 overview；后续对吉他／锅的非零反馈姿态和 clay 定向审图。也可 `--views overview close grazing clay --states rest motion` 完整展开；无需无目的批量渲染。审图输出在本目录 `camp-review`，每组实际相机、灯、曝光、颜色变换与分辨率写入 `rigs.json`，mode 之间相同。实际 baseline GLB、新 native 和 fresh import 分开渲染，未以重建旧物冒充网页截图。

轻量已执行：

```sh
python3 tools/world/facility-craft/camp/freeze_contract.py
python3 -m py_compile tools/world/facility-craft/camp/*.py
node --test tools/world/facility-craft/camp/runtime.test.mjs
git diff --check
```

4 个定向 runtime 测试验证物理材质／借用纹理和几何、材质副本共享、独立弦节点、原锅 pivot 只应用一次、legacy query 和 TSX 语法。新增一项直接读取冻结 Git 基线的 static／glow merge 表达式，与当前 legacy 分支的实际输入、矩阵及 warm 通道逐项对比，并检查额外炉灶／提灯 group 仅在候选路径挂载，保证旧 draw 合批路径不因 fallback 拆分。数值导出、离线图像审查、实际网页日夜、E 反馈与碰撞、性能、用户视觉接受各自独立；后五项未完成前不写通过。不 commit／push／部署，不改共享 integration 或 4341。


## 主执行最终交接状态

主执行已生成并亲阅5组原始/native/fresh实图、真实网页昼夜和四件真实E反馈恢复；4项camp测试通过。最终运行图与离线rig收据、PBR成本和性能边界见RESULT.md。
