# 栈道晨光 v3 · 16 小节短样

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

逐音比对包含 53 个音的起奏和松键，MIDI 与两份合成器输入各核对 106 个事件。纯马林巴 MP3 解码后，每个计划起音后 30–150 毫秒的频谱窗口均检测到对应音高。音频窗口检查验证了音高和拍点附近存在对应信号。它和事件核对用于确认渲染执行了谱面，听感仍待试听。

主旋律和和声以 [逐音谱面](lead-sheet.md) 为准。[完整事件](arrangement.json)含四个声部的实际力度和时值，[MIDI](score.mid) 用于编辑，[QC](qc.json) 保留逐音频谱检测、逐小节电平及源文件与成品的哈希。[资源收据](resource-receipt.json)记录串行窗口的实测用量。

## 复现

从音乐工作树根目录执行。重任务窗口由协调者原子取得并写入 `owner.json`。渲染器核对所有输入哈希，要求使用新输出目录。默认读取原版已留存的吉他采样和本机 SoundFont 缓存，也可用 `--sources` 和 `--cache` 显式指定。

```sh
python3 -B tools/world/boardwalk-phrases-v3/check_phrase.py
python3 -B tools/world/boardwalk-phrases-v3/render_study.py --out NEW_OUTPUT --lock-owner OWNER
```

主吉他复用 14 个按弦、音高和力度层匹配的 Meta Steel Guitar OGG 预览，许可为 CC0 1.0。辅助声部复用 GeneralUser GS 2.0.3 和未修改的 TinySoundFont。许可、来源说明和旧版共用渲染引擎均沿用此前交付。 [音源许可与来源](../boardwalk-longform/README.md)
