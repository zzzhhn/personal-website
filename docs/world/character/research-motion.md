# G24 人物动作：开源动捕资源与科研方法调研（2026-10-24）

## 结论先行（回答 Bobby 的问题）

有。本项目已经核对并获冻结规格允许的主要来源有三家；许可可用与完成重定向是两个阶段：

1. **100STYLE**（Ian Mason 等，爱丁堡大学，Xsens 惯性动捕，60 fps BVH，100 种风格 × 走/跑/后退/侧移/待机/过渡）。许可 **CC BY 4.0**，可商用、可改，只需署名「The 100STYLE Dataset - Ian Mason」。已下载的 Neutral 成员是 ID、FW、FR、TR1，原下载器核对为一个 TR1，原文的「TR1–TR4」已更正。起步需要逐帧检查实际静止到移动事件，不能仅靠 TR 名字判断。
2. **CMU Graphics Lab Motion Capture Database**（已在用：走、跑、冲刺、立定跳、跑跳）。官方条款「free for all uses」，可放进商业产品，只是不得直接转售数据本身。
3. **Quaternius Universal Animation Library**（UAL）：**CC0**，120+ 段手工动画，含坐下/坐姿/起身、推、爬等。它**不是真人动捕**，只在动捕没有对应动作时（主要是坐姿）当兜底，并如实标注。

其余热门的「开源」动捕基本都**不能用**：LAFAN1（CC BY-NC-ND）、Bandai Namco（CC BY-NC）、AMASS 及其派生的 HumanML3D（仅限非商业科研）、Human3.6M（仅学术）、SFU（明文禁止商用）、Motorica（商用需书面同意）、KIT（未写明数据许可）。Mixamo 免费且可商用，但它是 Adobe 条款、不是开源，只做最后兜底，本轮没用。

科研方法上，**最值得、也最适合在浏览器里跑的是 inertialization（惯性化过渡，Bollo 2018）及其简化版 dead blending（Holden 2023）**：它把「切动作那一瞬间」的姿态差和速度差记下来，在 0.2–0.3 s 内平滑衰减掉，没有交叉淡入那种两套姿势叠在一起、脚下滑的「鬼影」，每帧只多几十次四元数运算。Motion Matching / Learned Motion Matching 效果最好，但需要一个**大而许可干净**的动捕库来搜索——公开示例用的正是禁用的 LAFAN1；PFNN、MANN、Neural State Machine、Local Motion Phases、DeepPhase 都是神经网络控制器，官方代码与训练数据仅限科研/非商业，且要在浏览器里跑推理，代价与风险都不值得。

**实现现状**：真人动捕片段（CMU + 100STYLE）离线重定向到 G24 18 骨，运行时惯性化后叠加两项已批准的视觉 IK。走、跑、冲刺仍是循环片段；当前没有独立的真人起步 one-shot，完整起步滑移尚未通过。坐姿使用 CMU 143_18 的离线重定向，UAL 是许可允许的候选，未据此声称已接入。起步、急停的资源方案不能当作已实现状态，当前证据见 [起步来源核对](start-source-selection.md)。

核对日期：以下许可原文均在 **2026-10-24** 打开官方页面或官方仓库文件核对；「页面不可达」的条目写明了通过搜索引擎索引核对，不冒称直接打开。

## 一、数据集

### 可用

| 资源 | 官方页面 | 许可原文（摘录） | 用于本项目 |
| --- | --- | --- | --- |
| CMU Graphics Lab Motion Capture Database | http://mocap.cs.cmu.edu/ ；FAQ http://mocap.cs.cmu.edu/faqs.php | 首页：「This dataset of motions is free for all uses.」「You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.」FAQ：「The motion capture data may be copied, modified, or redistributed without permission.」 | 已用：走 35_xx、跑 09_xx、冲刺 143/141、立定跳 16_01、跑跳 75_03。本轮增补急停/转身候选从已缓存 take 中实测挑选（`tools/world/guide/mocap/scan_takes.py`）。致谢语照 FAQ 写进 Credits。 |
| 100STYLE | 作者页 https://ianxmason.github.io/100style/ ；数据 https://zenodo.org/records/8127870 （DOI 10.5281/zenodo.8127870） | 作者页：「For creative or commercial work please credit in an appropriate way. E.g. "The 100STYLE Dataset - Ian Mason". This work is licensed under a Creative Commons Attribution 4.0 International License.」 | 本轮新增：Neutral 风格的待机（ID）、过渡（TR）、前进走/跑（FW/FR）。只用 HTTP range 下载所需成员（`fetch_100style.py`，2026-10-24 实测 Zenodo 返回 206），原始 BVH 不入库。 |
| 100STYLE 重定向版（orangeduck/100style-retarget） | https://github.com/orangeduck/100style-retarget | README：「This version of the data is licensed under the same terms as the original dataset which is Creative Commons Attribution 4.0 International.」同时写明「The skinned character mesh is available in `Geno.fbx` and is free for non-commercial research use.」 | **不用**（我们自己从原始 BVH 重定向）；记下来是因为它说明了「数据 CC BY ≠ 示例角色可用」：Geno 网格仅限非商业科研，禁用。 |
| Quaternius Universal Animation Library | https://quaternius.com/packs/universalanimationlibrary.html | 页面：「License CC0」「Free to use in personal, educational and commercial projects. (CC0 License)」 | 坐下/坐姿/起身的兜底（手工动画，**不是真人动捕**，登记时标「CC0 手工动画」）。 |

### 禁用（本项目不得使用）

| 资源 | 官方页面 | 许可原文（摘录） | 禁用原因 |
| --- | --- | --- | --- |
| Ubisoft La Forge LAFAN1 | https://github.com/ubisoft/ubisoft-laforge-animation-dataset | README：「This dataset can be used under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International Public License」 | NC 禁商用；ND 禁演绎——重定向本身就是演绎。也连带排除了以它为数据的 Motion Matching 示例库。 |
| Bandai Namco Research Motiondataset 1/2 | https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset | README「License」：「Bandai-Namco-Research-Motiondataset-1: CC BY-NC 4.0；…-2: CC BY-NC 4.0；Motion visualization on Blender: MIT」 | NC 禁商用（个人站也不预设为非商业；冻结规格把 NC 一律列为禁用）。只有它的 Blender 可视化脚本是 MIT，对我们无用。 |
| AMASS | https://amass.is.tue.mpg.de/license.html | 「License for non-commercial scientific research purposes」「To use the Dataset for the sole purpose of performing non-commercial scientific research, non-commercial education, or non-commercial artistic projects」「The Dataset may not be reproduced, modified and/or made available in any form to any third party without Max-Planck's prior written permission.」 | 仅限非商业科研，且禁止向第三方提供修改版——放进公开网页就是提供。 |
| HumanML3D | https://github.com/EricGuo5513/HumanML3D | 仓库 LICENSE 为 MIT；README：「HumanML3D … originates from a combination of HumanAct12 and Amass dataset.」 | MIT 只覆盖文字标注与处理脚本；动作本身来自 AMASS，继承 AMASS 的非商业限制。基于它训练的文本生成动作模型（MDM、T2M-GPT 等）同理不能用来出片段。 |
| Human3.6M | http://vision.imar.ro/human3.6m/eula.php | 「GRANT OF LICENSE FREE OF CHARGE FOR ACADEMIC USE ONLY … Provided you send the request from an academic address」「you may not rent, lease, lend, sub-license or transfer the dataset」 | 仅学术，需学术邮箱申请；商用要另谈。 |
| SFU Motion Capture Database（含 NUS） | https://mocap.cs.sfu.ca/ | 「This dataset of motions is free for research purposes.」「The data cannot be used for commercial products or resale, unfortunately.」（直接 curl 两次超时，原文经搜索索引核对） | 明文禁止用于商业产品。 |
| ACCAD Open Motion Project（俄亥俄州立大学） | https://accad.osu.edu/research/motion-lab/mocap-system-and-data | 「Open Motion Project by ACCAD/The Ohio State University is licensed under a Creative Commons Attribution 3.0 Unported License.」 | 许可本身宽松（CC BY 3.0），但**不在冻结规格 §7 的白名单**（白名单是 CC BY 4.0）。本轮不用；内容多是表演/武术片段，100STYLE 已覆盖我们需要的移动类动作，所以也不提 review-request。 |
| KIT Whole-Body Human Motion Database | https://motion-database.humanoids.kit.edu/faq/ | FAQ 只写「make content freely available to the scientific community」、需注册、发表时引用；只有 MMM 软件框架写明「GNU General Public License」。没有找到动作数据本身的许可。 | 数据许可不明 = 按规格禁用。 |
| Motorica Dance Dataset | https://github.com/simonalexanderson/MotoricaDanceDataset （LICENSE.txt） | 动作版权归 Motorica AB；科研免费；「Commercial use … requires prior written consent」；再分发需书面批准（仓库页 curl 返回 404，原文经搜索索引核对 LICENSE.txt）。motorica.ai 官网是商业生成服务，不是开放数据。 | 商用与再分发都要书面同意；而且是舞蹈，不是移动。 |
| Rokoko Motion Library 免费包 | https://www.rokoko.com/products/motion-library | 定价页：「Export and use in any of your projects, including commercial ones.」EULA 1.1.1 §3.4（经 Unity 论坛转载）：禁止复制、分发、再许可，除非作为数字媒体作品的组成部分。（官网许可页 curl 404，经搜索索引核对） | 可商用但**不是开源许可**、需账号下载、条款以商业 EULA 为准，不在 §7 白名单。动作质量好，但我们需要的移动类动作 100STYLE/CMU 都有。 |
| Mixamo（Adobe） | FAQ https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html ；Adobe 通用条款 §3.6 https://www.adobe.com/legal/terms.html ；Mixamo 附加条款（2021-06-23） | FAQ：角色和动画可「royalty free」用于个人、商业、非营利项目，含游戏；社区 FAQ：禁止分发原始动画文件（不能放进素材包、模板）；附加条款：禁止用 Mixamo 内容训练机器学习。（helpx 页 curl 返回 403，经搜索索引核对） | 规格 §7 允许它作**最后兜底**，标「免费（Adobe 条款），非开源」、原始 FBX 不进仓库。限制：只能嵌入作品分发、不得单独提供；要 Adobe ID；不能用于训练。本轮所有动作都有开放许可来源，**未使用**。 |

## 二、科研方法

| 方法 | 出处 | 做什么 | 浏览器实时？ | 官方代码 / 数据许可 | 本项目 |
| --- | --- | --- | --- | --- | --- |
| Motion Matching | Simon Clavet，GDC 2016「Motion Matching and The Road to Next-Gen Animation」（Ubisoft，For Honor） | 每 0.1 s 在整个动捕库里搜一个「当前姿态 + 未来轨迹」最像的帧接着播 | 能跑（几千帧库的 KD 树/暴力搜索在 JS 里 < 1 ms），**瓶颈是数据**：需要一个几十分钟、覆盖各种转向/起停、许可干净的连续库，并给 G24 全量重定向；GLB 体积会从 0.4 MB 涨到数 MB | 无官方代码（演讲） | 不采用（数据量与体积）。借用其思想：落地/急停时按脚相位挑入点。 |
| Learned Motion Matching | Holden, Kanoun, Perepichka, Popa，SIGGRAPH 2020（Ubisoft La Forge） | 用三个小网络替代 MM 的数据库，内存降到 MB 级 | 能跑，但要训练三个网络、在浏览器做推理 | 参考实现 https://github.com/orangeduck/Motion-Matching ：代码 **MIT**；README 写明重建数据库用 LAFAN1（CC BY-NC-ND，「unlike the code」） | 不采用：没有许可干净的训练库，收益不抵复杂度。 |
| PFNN | Holden, Komura, Saito，SIGGRAPH 2017 | 相位函数神经网络，地形自适应的移动 | 推理代价约每帧一次 MLP（几百 KB 权重），技术上能跑 | 项目页 https://theorangeduck.com/page/phase-functioned-neural-networks-character-control 提供 Code & Data；数据为作者自采；没有找到明确的商用许可，按规格视为许可不明 | 不采用。 |
| MANN（Mode-Adaptive NN，四足） | Zhang, Starke, Komura, Saito，SIGGRAPH 2018 | 混合专家网络，四足步态 | 能跑但针对四足 | AI4Animation https://github.com/sebastianstarke/AI4Animation ：README「This project is only for research or education purposes, and not freely available for commercial use or redistribution. The motion capture data is available only under the terms of the Attribution-NonCommercial 4.0 International」 | 不采用（许可、且是四足）。 |
| Neural State Machine | Starke, Zhang, Komura, Saito，SIGGRAPH Asia 2019 | 坐椅子、开门、搬箱子等场景交互 | 推理可跑，但需要环境体素化输入 | 同 AI4Animation：仅科研/教育 | 不采用。它说明了「坐下」需要对齐座面——我们用离线烘焙 + 座位锚点代替。 |
| Local Motion Phases | Starke, Zhao, Komura, Zaman，SIGGRAPH 2020 | 每个肢体各自的相位，处理篮球等异步动作 | 同上 | 同 AI4Animation：仅科研/教育 | 不采用。100STYLE 就是 Mason 用该方法做风格建模时采的数据，数据本身 CC BY 4.0，与代码许可无关。 |
| DeepPhase（Periodic Autoencoder） | Starke, Mason, Komura，SIGGRAPH 2022 | 从动捕学出多维相位流形，用于运动匹配/过渡 | 推理可跑，训练离线 | 同 AI4Animation：仅科研/教育 | 不采用。 |
| Inertialization | David Bollo，GDC 2018「Inertialization: High-Performance Animation Transitions in Gears of War」 | 切换瞬间记下「旧姿态 − 新姿态」的偏差和偏差速度，用多项式在 t 秒内衰减到 0；新片段立刻全权重播放 | **最适合**：每帧每骨一次四元数乘法 + 一个标量多项式，无数据依赖 | 演讲，无代码；方法本身无许可限制 | **采用**（ART-LOCK v3.6 已批准）。 |
| Dead Blending | Daniel Holden，2023，https://theorangeduck.com/page/dead-blending | inertialization 的简化：把旧动画按切换时的速度外推，再与新动画按时间混合；比偏移衰减更不易过冲 | 同样极轻 | 文章示例代码在 Motion-Matching 仓库 `dead_blending` 分支，**MIT** | 参考其「外推 + 衰减」做骨盆根高度与关节偏差的速度项，避免过冲；实现为自写 TypeScript。 |

补充（Holden 的 spring 系列，MIT 代码 https://theorangeduck.com/page/spring-roll-call）：用临界阻尼弹簧做偏差衰减，比 Bollo 的五次多项式更容易在中途再次切换时保持连续。本项目的惯性化就用「临界阻尼偏差弹簧」实现，半衰期按切换类型设置（0.08–0.15 s）。

## 三、方案及实施边界

1. **数据**：CMU（已用部分保留，Bobby 没有否定跑跳本身）＋ 100STYLE Neutral（待机变化、起步、急停、转身——真人动捕，且同一演员同一风格，接起来不突兀）＋ UAL（仅坐姿，CC0 手工动画，标注清楚）。都在冻结规格 §7/§15.4 的白名单内，Credits 写署名。原始文件只放 `~/.cache/g24-*`，仓库里只有脚本、哈希和导出的 GLB。
2. **不上 Motion Matching / 神经网络**：许可干净的公开库不够大（100STYLE 每风格只有几十秒），神经网络方法的官方代码与权重都是仅科研许可；同时 GLB 体积和首包预算（15 MB）都会被推高。G24 只有 18 骨、TABS 比例，片段状态机 + 好的过渡已经能达到 Bobby 要的「GTA 式」观感上限的大部分。
3. **惯性化替代交叉淡入**：新片段从第一帧起获得完整权重，旧姿态和速度的残差衰减到目标。残差仍会影响最终脚位，所以不能仅用新片段的接触曲线证明最终脚不滑。当前完整起步仍失败，必须检查实际混合后的全部原窗口。
4. **IK 范围不扩**：坐姿、上下车用离线烘焙片段 + 运行时整体对齐座位/车门锚点，不新增手部或坐姿接触 IK（ART-LOCK v3.6 要求第三类 IK 另提范围）。现有限幅已修掉一类坡地停步下陷，但坡地浮空仍失败；同步诊断显示部分帧胶囊离地而状态仍判着地，不能继续承诺只调 IK 就能解决。

## 附：核对证据

原始页面快照存于 `/tmp/g24lic/`（运行期临时文件，不入库）。curl 不可达的页面（SFU、Rokoko、Mixamo、Motorica LICENSE、Zenodo 记录页）通过搜索引擎索引核对，已在表中逐条标明。
