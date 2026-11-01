# 12 秒规格增量

继承 [首版 ARR-SPEC](../../audio-overhaul-20261028.md) 的动机、C 大调／80 BPM／4/4、无唱词、短有限音乐目标。此为校准缩编，不是原 16 小节规格的照做率报告。

`intent.one_thing`：验证原动机能否通过问答、撤出和收束减轻机械重复。`reference_pair`：① Island Walk 01 既有乐谱，借 E-G-A-G／D-C 的上行回落与句尾空拍；② Park 旧 warm 源码，借和声与短旋律分工，不借其鼓循环。两个参照都是工程结构参照，未声称听过其成品音色。`listener_situation`：探索中的低音量耳机／笔记本，两轮短成对试听。`emotional_arc`：陈述 2 → 回答 2 → 撤出 0 → 收束 1。

`material`：两小节 E4 四分、G4 八分、A4 八分、G4 四分、四分休止；D4、C4 各四分，其余休止。性格为轻短、好奇，原始陈述在 A，主导方式是加工处理。短样无新动机。

| 段落 id／form.name | start_bar／bars | harmony／harmony_letters | B development／能量 | 编制与事件 |
| --- | --- | --- | --- | --- |
| A／Intro | 1／1 | Imaj7／Cmaj7 | repeat／2 | 木槌与暗和声进入，木槌力度 .74／.52／.63／.47 |
| B／Instrumental | 2／1 | IVmaj7／Fmaj7 | vary／2 | D-C 回答力度 .58／.43；短低音仅本小节进入 |
| C／Breakdown | 3／1 | iv／Fm | fragment／0 | 木槌、和声与低音全部撤出，6～9 秒静音；保留和声位置的谱面标签但不发声 |
| D／Outro | 4／1 | I／C | contract／1 | 只回 D-C，两音力度再乘 .85；和声依次入声，尾音在第 11 秒前收完 |

A 控制组同调、同速度、同音色和四小节和声，固定木槌力度 .68，每小节低音，第三小节照旧发展为 F-G-Ab-G，避开 Fm 上的 E4；最后 D-C。其目的仅为隔离 B 的短句组织变化，不将一组变量拆成“哪一个变化单独获胜”的因果结论。

`arrangement.roster`：mallet，E4-A4，前景记忆点、软短起音、较暗的有限模态共鸣；pad，E3-E4，背景和声，140 ms 起音、有限释音、低泛音；bass，F2，仅 B 段出现，中景短圆低音，含二三次谐波。低音在 C 提前退场。无打击层，`bass_kick_relation` 互答式用于说明低音与旋律错开，不虚构底鼓。`subtraction_events.at` 为 `{section: C, bar_offset: 0}`，撤掉全部，目的为动作留白。`hooks` 为 E-G-A-G 后 D-C，D 段只保留回答。

`mix_intent`：木槌轻偏左，和弦各声部展开，低音居中；B 段有低音时不补低八度根音。C 宽度为 0，D 分解和弦形成时间和横向展开。目标两版 −25.2 LUFS-I，保留至少 2 dBTP 余量，音乐以游戏 Music 电平为准；有交互时运行时总线降至 40%。不加限制器／长混响。运行时不随机改力度／节奏，文件与现场由同一个确定音符表和 renderer 生成。

`render`：本地确定音符与合成 patch，固定事件，无 seed 搜索或 best-of-N。生成器逐事件记录精确秒数、MIDI 音高、时值、力度与声像至 analysis.json。未走 Suno／YuE2／其它服务，不能继承这些后端的音源成熟度、许可或主观质量声明。

`checks.self_audit`：1，四项意图与双参照齐；2～4，起点 1／2／3／4、均一小节，共四小节 12 秒，能量 key 一致；5～8，有下降、C 减法、bass 提前退出和明确动机；9，iv 在非首尾 C 段；10，无 fill；11，按谱直拍；12，C 静音和 D 分解声像不同；13，确定音符表代替未调用后端的 prompt；14，4×4÷80×60＝12 秒；15～17，器乐、无风格混合，不适用；18，repeat／vary／fragment／contract，无 new；19～20，ASCII 和弦，C major／major，段名来自模板。

`checks.exemptions`：四小节是校准短样，不能据此判断整曲发展；C 完全静音使借用和弦只存在于结构标签，不把它算作“听到了调外和弦”；不强加毫秒偏移制造人味，旋律问答由谱面力度和删减表达；无外部生成后端 prompt，无人声，也没有经过盲听。照做验证和文件指标已完成，审美验收仍开放。
