# A6 运行姿态跨部件审计：方法与离线验证（2026-10-21）

脚本：`tools/world/camp/quality-audit/runtime_guide_intersections.py`（只在原脚本上扩展，没有新增框架）。

本轮只离线分析已有的运行采集数据：没跑浏览器，没改应用代码、phase helper 或 GLB，没有改写任何原始报告。

## 用法

```sh
B=/Users/bobby/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup -P tools/world/camp/quality-audit/runtime_guide_intersections.py -- REPORT.json OUT.json [--every N] [--no-relations]
```

- **输入**：`transitions.mjs` 在 `WORLD_CAPTURE_SKIN=1` 下输出的 report。每个 view 含 `skinTopology`，每个样本含 `skin`。也接受单帧的 actor+skin 校准快照。
- **仓库归档**：主线程已转存到 `playtest/transitions-73aa-prototype/` 与 `playtest/interruptions-73aa-prototype/`。用各目录的 `skin-poses.json.gz` 作为输入；脚本直接支持gzip，`inputSha256`仍计算解压后的原始内容，`inputFileSha256`记录实际文件。两目录的runtime-relations-audit.json是本次已执行的全帧结果，压缩前后内容哈希核对一致，无需为归档重复扫描。
- **`--every N`**：只抽每第 N 帧，用于快速试跑。此时报告写 `notFullCoverage`，`passed` 恒为 false。
- **`--no-relations`**：只做旧的同壳自交检查，`passed` 恒为 false。
- **退出码**：只有全帧、同壳为 0、跨壳全部归类且所有关系达到声明最小值时返回 0，否则返回 1。
- **耗时**：约 470 帧 × 2 档在本机跑约 17 s。

## 输出字段

**顶层**

- `inputSha256`：输入报告的哈希。
- `assetSha256`：来自 report 各 view 的资产哈希，不靠目录名推断。
- `relationsSource`：`qa_relations.py` 的路径和 sha256。
- `relationsDeclared`：关系表原文。
- `sampleStride`。
- `sameShellPassed`、`crossShellPassed`、`passed`。

**每个 view**

- `parts`：部件 → 骨骼、顶点数、rest 中心与尺寸。
- `phases`：每个阶段的样本数；同壳和关系失败帧数；非预期和未归类的按对最大值；各关系最小嵌入与露出；以及最多 40 个失败帧，每帧记 t、动画、clip 时间、部件对。
- `relationSummary`：每条关系的最小嵌入和最小露出、各自发生在哪一帧；声明阈值；最大交叉对数；未测量的样本数。
- `relationFailures`：最多 24 个失败帧，带最多 6 个三角对的见证点与坐标。
- `rows`：逐帧结果。

## 方法

### 1. 姿态重建（沿用原脚本）

用捕获到的 Three.js 骨骼矩阵、`bindMatrix`/`bindMatrixInverse`/`meshToGuide`，在 CPU 上重做线性蒰皮。

- 8 个 material primitive 必须处在同一个 identity bind 空间，否则直接报错。
- rest 空间做 10 µm 的临时焊接，变形后把焊缝副本取平均，并报告最大修正量。用于校准的 60 个接触顶点误差 ≤0.91 µm，是主线程早先的结果。

### 2. 部件识别（不用导出顶点编号）

- 焊接后的连通分量里，最大的是 body，并且必须带 pelvis 权重。
- 其余壳体必须整壳都以 ≥0.99 的权重绑在同一根骨上：
  - hand.X → mitten.X；foot.X → boot.X；chest → zip。
  - pelvis 两个壳：中心较低的是 bag，较高的是 bagflap。
  - head 三个壳按顶点数：最大是 helmet，中间是 visor，最小是 dot。
- 任何其他组合（非一热、数量不对、缺件）都会报错，不会猜。
- 骨骨名会先还原：GLTFLoader 会去掉 `.`（例如 `handR`），脚本把它还原成 `hand.R`，以对上 A6 关系表。
- 焊缝副本的蒰皮权重必须一致（差≤ 1e-4），否则报错。

两份数据的实际识别结果（顶点数）：

- 73aa：helmet 201、visor 78、dot 18、mitten 58/58、boot 50/50、bag 24、bagflap 24、zip 24。
- 49bd：boot 是 85/85，其余相同。

### 3. 关系表只有一份来源

`RELATIONS`、`TORSO`、`UNINTENDED_NAMED` 用 AST 从 `tools/world/guide/qa_relations.py` 里只取这三个赋值语句执行，不运行它的 Blender 部分。内容没有复制，报告里记录了该文件的 sha256。

当前共 11 条有意嵌入：helmet/collar、boot.R 与 boot.L/trouser、mitten.R 与 mitten.L/sleeve、bag/jacket、bagflap/jacket、bagflap/bag、zip/chest、visor/helmet、dot/helmet。

### 4. 跨壳交点归类

- 对每个 BVHTree.overlap 跨壳三角对，用原生 A6 的 `selfx_core.witnesses`（双向边–三角形求交）求见证点。
- **标签**：body 三角形的区域按见证点均值处、rest 权重重心插值后权重最大的骨确定，和 `qa_relations.tri_label` 一致；其他壳用部件名。
- **判定规则**：
  - 只有精确的 (部件, 部件|区域) 组合在关系表里时，才算 `embedded-expected`。
  - 否则算 `unintended`，并按 `UNINTENDED_NAMED` 打上名称；只要有一个，该帧就失败。
  - 没有见证点（共面或只是浮点内部判定重叠）的对算 `unclassified`，同样判失败，不当作没问题。
- 不存在整对 body/bone 的白名单。例如 `boot.L` 和 `body|shin.R` 不在表中，就一定会被报出来，即使 boot.L 和 `body|shin.L` 是合法嵌入。

### 5. 嵌入深度与露出

计算方式与 `qa_relations.test` 一致。

- **采样点**：guest 的顶点，加上靠近 host 的 guest 三角形上 15 个重心网格点。
- **有符号距离**：用最近面法线的符号，分别量 guest 采样点到闭合 host 壳、host（分区后的）采样点到闭合 guest 壳。
- **嵌入深度**：双向最深的互相穿入。
- **露出**：guest 在 host 外的最远距离。
- 两者每帧都必须 ≥ 关系表声明的最小值。任一侧为空时记 `measured: false`，判失败。

## 离线验证结果

报告存在 `/tmp/mr/keep/rel-73aa-full.json` 与 `rel-49bd-full.json`。本轮只允许写两个文件，所以没放进仓库；如需保留，由主线程转存。

### 73aa（`motion-34a3-prototype/report.json`）

- **输入**：view 里的资产哈希是 `73aa0bb6…`，目录名里的 34a3 不作数；inputSha256 `5e398020…`。
- **总体**：两档全帧（473 + 467 帧），同壳 0，跨壳非预期 0，未归类 0，11 条关系全部通过。焊缝最大修正 1.05 µm，退出码 0。
- **最接近下限的项**（两档最小值）：

| 关系 | 最小嵌入 | 声明下限 | 最小露出 | 声明下限 |
| --- | ---: | ---: | ---: | ---: |
| dot/helmet | 0.0079 m | 0.005 m | — | — |
| bagflap/jacket | 0.0069 m（Run） | 0.002 m | — | — |
| mitten/sleeve | — | — | 0.0711 m | 0.05 m |
| bagflap/bag | — | — | 0.0156 m | 0.003 m |

- **交叉规模**：boot/trouser 在运行中最多 38 对交叉，全部归类为本侧裤管。
- **与同哈希原生 A6 对照**：`relations_glb_draco.json` 的 rest 姿态和运行时首帧 Idle 相比：
  - mitten、visor、dot、bagflap/bag、zip 的嵌入和露出值一致到 0.1 mm。
  - boot 和 bag 有小幅差异，是姿态不同导致的。

### 73aa 中断操作（`motion-73aa-interruptions/report.json`）

- **输入**：两档 view 的资产哈希都是 `73aa0bb6…`，inputSha256 `c06a2221…`。采集时的操作：稳定前反向 180°、重新起步、Space 跳跃、Esc 暂停后恢复。
- **总体**：两档全帧（554 + 556 帧，含 Idle/Walk/Jump/Land）同壳 0、跨壳非预期 0、未归类 0，11 条关系全部通过。焊缝最大修正 1.05 µm，退出码 0。
- **14 个阶段**：idle、walk、pre-turn、turn180、settled-turn、walk-again、pre-resume、resume、pre-jump、jump-land、walk-pause、pre-pause、paused、resumed-pause，失败帧都是 0。
- **Jump/Land**：共 70 / 69 帧，没有任何非预期、未归类或同壳交叉。helmet/collar 的最小嵌入 0.0223 m 出现在 Land 帧（声明下限 0.010 m）。
- **最接近下限的项**：和 motion-34a3 那份相同，是 dot/helmet 的嵌入 0.0079 m（下限 0.005）和 mitten 的露出 0.0711 m（下限 0.05）。
- **输出**：`/Users/bobby/Desktop/3D-personal-world/motion-73aa-interruptions/runtime-relations-audit.json`。

上一节 motion-34a3 的全量结果也已放在其输入旁：`/Users/bobby/Desktop/3D-personal-world/motion-34a3-prototype/runtime-relations-audit.json`，内容与 `/tmp/mr/keep/rel-73aa-full.json` 相同。

### 49bd 已知失败数据（`stop-49bd-prototype/report.json`）

两档都报失败，转身中断问题仍能抓到。

- **同壳**：与原 `skin-audit.json` 相同，都在 turn180 的 Idle 帧：
  - 默认档 t=8.798、8.822，body 壳各 34 / 50 对。
  - 近档 t=8.790、8.812，各 37 / 40 对。
- **跨壳（新增，原脚本只记候选数、没有判定）**：turn180 里有非预期的交叉：
  - 默认档：`boot.L|boot.R` 90 对，`body|shin.R|boot.L` 32 对，`body|shin.L|boot.R` 29 对。
  - 近档：`boot.L|boot.R` 70 对，`body|shin.R|boot.L` 30 对，`body|shin.L|boot.R` 21 对。
  - 默认档的 t=8.845 这一帧同壳已经是 0，但两只靴仍互相穿插 54 对。旧脚本只看同壳，会把这一帧放过。
  - 失败帧的三角对坐标和见证点保存在 `relationFailures` 里。
  - 其余阶段和 11 条关系的嵌入深度、露出都通过。
- 这是对 49bd 的结论，和 73aa 的结果各自独立，不混用。

## 局限与未测

主线程补测：`playtest/integration-73aa-prototype/` 在收脚中真实E上车、清除视觉足锁、下车恢复，共3项通过。相同审计器检查其84个新增采样姿态，全部通过；三份73aa合计2,134个。它只覆盖进入/退出时的现有角色显隐，不代表制作了车内坐姿。

49bd负例已转存`playtest/stop-49bd-negative/`，含原始输入无损gzip与全帧失败报告，仍保留失败。它用于说明脚本没有把旧缺陷误判成通过。

- **仅采样帧**：只审计了捕获到的帧（约 16–20 ms 一次），不对连续时间做结论。
- **CPU 重建**：用 float32 矩阵在 CPU 上重建蒰皮，不代表 GPU 的逐比特结果。
- **法线符号**：最近面法线取符号的方法，在锐利的凹边附近可能判错内外。
  - helmet/collar 的 host 侧深度最大到约 0.19–0.30 m；原生 A6 也一样，是整个 helmet 包住头部造成的。
  - 门限只用最小值判定，这个上界偏大不影响通过与否，但不要拿它当作真实的穿插量。
- **区域归属**：由交点处的 rest 权重决定。如果在两个区域交界处发生穿插，可能被归到另一区。这和原生 A6 的口径一致，不宽于原生。
- **离线脚本没进仓库**：脚本在 `/tmp/mr/keep/`，如需保留由主线程转进 `tools/world/playtest/`。
- **不在本脚本范围内**：
  - 运行角色和场景物体的交叉。
  - Run 下的跳跃、车内姿态：两份数据里都没有，未测。Jump/Land 已由 motion-73aa-interruptions 覆盖。
- **对最终哈希的结论**：本文的通过结论只绑定 73aa 的这两份采集；最终资产哈希变化后需要重新采集、重新跑。
- **34a3 的证据不混用**：34a3 的原生/GLB 同壳结果不算作 73aa 的证据。
