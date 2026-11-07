# 栈道晨光 v3 · 乐句重作与长曲

[完整编配 MP3](boardwalk-v3-study.mp3) · [纯马林巴 MP3](boardwalk-v3-melody.mp3)

两份音频均为 48.029 秒，44.1 kHz 双声道，160 kbps。以同一份马林巴事件和同一个母带增益渲染，可在相同时间点切换。第 8→9 小节的问答转折约在 23.41 秒，第 15→16 小节的收束约在 43.90 秒。

钢弦吉他在第 2→3 小节延续高音弦 E4，在第 10→11 小节延续 B 弦 C4。两处 C/E 的贝斯均从 E1 起，经 G1 接向下一小节。B1→C2 的低音接续安排在第 8→9、15→16 小节。刷鼓保持轻后拍，第 16 小节只留轻底鼓起拍。马林巴按谱松键，样本的自然释放由音源处理。

| 离线检查 | 完整编配 | 纯马林巴 |
| --- | ---: | ---: |
| 解码帧数 | 2,118,091 | 2,118,091 |
| 综合响度 | −20.70 LUFS | −23.00 LUFS |
| 真峰值 | −4.64 dBTP | −12.41 dBTP |
| 削波样本 | 0 | 0 |
| 整小节低于 −55 dBFS RMS | 0 | 0 |

逐音比对包含 53 个音的起奏和松键，MIDI 与两份合成器输入各核对 106 个事件。纯马林巴 MP3 解码后，每个计划起音后 30–150 毫秒的频谱窗口均检测到对应音高。音频窗口检查验证了音高和拍点附近存在对应信号。用户试听短样后确认：“连贯多了，可以沿此展开”。技术核对与用户听感反馈分别记录，长曲不自动继承短样的审美验收。

主旋律和和声以 [逐音谱面](lead-sheet.md) 为准。[完整事件](arrangement.json)含四个声部的实际力度和时值，[MIDI](score.mid) 用于编辑，[QC](qc.json) 保留逐音频谱检测、逐小节电平及源文件与成品的哈希。[资源收据](resource-receipt.json)记录串行窗口的实测用量。

## 复现

从音乐工作树根目录执行。重任务窗口由协调者原子取得并写入 `owner.json`。渲染器核对所有输入哈希，要求使用新输出目录。默认读取原版已留存的吉他采样和本机 SoundFont 缓存，也可用 `--sources` 和 `--cache` 显式指定。

```sh
python3 -B tools/world/boardwalk-phrases-v3/check_phrase.py
python3 -B tools/world/boardwalk-phrases-v3/render_study.py --out NEW_OUTPUT --lock-owner OWNER
```

主吉他复用 14 个按弦、音高和力度层匹配的 Meta Steel Guitar OGG 预览，许可为 CC0 1.0。辅助声部复用 GeneralUser GS 2.0.3 和未修改的 TinySoundFont。许可、来源说明和旧版共用渲染引擎均沿用此前交付。 [音源许可与来源](../boardwalk-longform/README.md)

## 长版 · 170 小节

[完整 MP3](boardwalk-v3-longform.mp3) · [C 转 B 约一分钟试听](boardwalk-v3-c-to-b.mp3)

全长 499.761 秒，44.1 kHz 双声道，160 kbps。试听截自母带约 3:01.46，C 到 B 的交界在试听约 29.27 秒处。保留已听过的 A 问答，在 [长曲曲式](longform-plan.md) 指定的地方回归，并加入 [B《潮线》](theme-b.md) 与 [C《开阔水面》](theme-c.md)。B 的分解拨弦保留步态，C 拉长共同音并给刷鼓留出更长的休止。段落之间沿用声部的自然延音，只有同弦再次拨响才会提前松掉上一音。

[长版编配事件](longform-arrangement.json) · [MIDI](longform-score.mid) · [长版 QC](longform-qc.json) · [资源收据](longform-resource-receipt.json)

渲染从曲式表和三个主题逐音展开，核对 MIDI 和实际合成器事件。第 170 小节后有 2.2 秒尾部，自然收束后再回到开头。短样的听感反馈用于确定方向，长版的听感仍待试听。

母带 9,996,621 字节，SHA-256 为 `13c4eb149ca8042774cacdf720d55450d80c1b69eaa56ac8cb3c6925146b66bb`。离线解码核对 22,039,459 帧，综合响度 −21.15 LUFS、真峰 −4.52 dBTP、削波 0。按 50 毫秒网格和 −55 dBFS RMS 阈值，曲中最长低电平区间为 0.10 秒。13 个段落交界均有带音高的声部跨线，另有 7 次同弦重奏缩短了上一音。资源窗口约 36 秒，进程组采样峰值约 174 MiB，临时盘峰值约 186 MB，锁已释放。

```sh
python3 -B tools/world/boardwalk-phrases-v3/render_long.py --out NEW_OUTPUT --lock-owner OWNER
```
