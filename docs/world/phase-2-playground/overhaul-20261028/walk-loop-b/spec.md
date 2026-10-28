# 36 秒 B 循环规格

基于 [12 秒 B 规格](../audio-calibration/spec.md) 与已读取的 music-composition-skills workflow／development／arrangement-arch／sound-design／render-compile 方法。仅离线候选，没有改变现有 WorldParkAudio 接口。

`meta`：title＝Island Walk B Loop；key＝C major，mode＝major，meter＝4/4，tempo＝80，target_duration＝0:36，deliverable＝full_mix；无唱词、无风格混合、无特定画面同步点。

`intent.one_thing`：让同一问答动机在漫游中展开，并在回到首句时仍像连贯的一段音乐。

`intent.reference_pair`：①已提交短 B，借其 E-G-A-G／D-C 问答、力度差与主动撤出；②原 Island Walk 01 的谱面，借其 Fm 借用色彩与薄段落，改用 12 小节循环，不借其音频或机械反复。两者是工程谱面参照，未声称做过听觉拆解。`listener_situation`：探索中的低音量耳机与笔记本，连续循环两次以上，注意力仍在操作。`emotional_arc`：辨认 2 → 展开 3 → 留白 1 → 回家 2。

`material`：两小节轮廓为 E4-G4-A4-G4 后 D4-C4，第一句保留四分／八分／八分／四分的相对节奏，第二句两音回答；各句起点后移半拍给前景动作留空。性格轻短、克制，A 原始陈述，主导加工处理。B 的 E-G-B-A 与 F-G-Ab-G 保留开句节奏及上行回落；C 只抽取低音区 E-G；D 保留 E-G 和 D-C。

| form.id／name | start_bar／bars | harmony | harmony_letters | development／energy | 进退与减法 |
| --- | --- | --- | --- | --- | --- |
| A／Instrumental | 1／4 | Imaj7 IVmaj7 rest Imaj7 | Cmaj7 Fmaj7 rest Cmaj7 | repeat／2 | felt、pad 入，bass 仅回答；第 3 小节无新音，先前弹拨尾音可保留 |
| B／Instrumental | 5／4 | VIm7 IIm7 iv V7 | Am7 Dm7 Fm G7 | vary／3 | 同轮廓变尾与借用和弦，pluck 回答，bass 只一次／小节 |
| C／Breakdown | 9／2 | Imaj7 Imaj7 | Cmaj7 Cmaj7 | fragment／1 | felt_out、bass_out；薄 pad 与低音区 E-G 弹拨，随后留空 |
| D／Instrumental | 11／2 | IIm7 V7 Imaj7 | Dm7 G7 Cmaj7 | contract／2 | felt 缩句返回；bass 不返回；末小节后半 C 和声延续到循环开头 |

`arrangement.roster`：felt，记忆点，中音区 B3-B4，12 ms 软起音，有限衰减的基音与少量先退上泛音，A 入、C 出、D 回；pluck，句间中景，E3-C4，8 ms 起音与短有音高衰减，A 的第二小节入、C 后退出；pad，背景和声，E3-D4，300 ms 起音、低泛音、分声部错开进入，D 尾音跨界；bass，低频，D2-G2，14 ms 起音、短释音且带二三次谐波，A 回答入、C 前退出。没有持续鼓点或环境层。

`depth_map`：felt 前景、pluck 中景、pad 背景、bass 中景。`bass_kick_relation`：互答式，仅说明短低音与旋律／弹拨错开，无 kick。`spectrum_budget`：felt 主占中音，pluck 在句间较低音区回应；pad 不补低八度根音，不用长亮尾填满旋律；C 完整让出 felt 与 bass。

`subtraction_events`：`{section: A, bar_offset: 2}` 不加新音；`{section: C, bar_offset: 0}` 撤 felt／bass，降低 pad。`energy_curve`＝A2／B3／C1／D2。`hooks`＝上行回落后 D-C 回答，A 陈述、B 变尾、D 缩句；C 用低音区异音色回忆 E-G。`groove`＝straight，确定拍位，不加随机 jitter；pad 分声部入声为编配时序，无周期 fill。

`mix_intent`：felt 轻偏左，pluck 偏右，pad 各声部分散，bass 居中；C 降低密度与声场复杂度，D 尾音进入同 C 和声开头。目标约 −26 LUFS-I，真峰值不高于 −2 dBTP，不用 limiter／归一化抹去段落落差。无长混响或外部效果器。此处没有实现运行时 ducking，沿用未来主线接入的共享设置；本候选自身不做运行时决定。

`render`：确定性本地符号事件与原创合成 patch，精确逐事件时间，不走文字生成后端或 best-of-N。循环为逐音有限尾声模 36 秒相加，不是淡出后重开；最后 C4 回答与 Cmaj7 背景跨接到第一句。

`checks.self_audit`：1，四项意图／双参照已明；2～4，1／5／9／11 起、4／4／2／2 小节，合计 12，能量 key 对齐；5～8，C 能量降、两处减法、bass／pluck 提前出、动机可定位；9，B 的 iv/Fm 实际发声；10，无周期 fill；11，直拍无随机漂移；12，密度与声像随段落变化但不做自动 stereo width；13，本地精确事件代替未调用后端的 prompt；14，12×4÷80×60＝36 秒；15～17，器乐／无风格混合；18，repeat／vary／fragment／contract，无 new；19～20，ASCII 和弦，C major／major，段名取模板值。

`checks.exemptions`：循环段落无 Intro／Outro，以 D 回到 A 代替终止式停机；不强加非零毫秒偏移；不用复杂 width automation，声场差异来自编制／声部；未调用 Suno／YuE2，不能声称这些后端照做或音源成熟度；没有听感验收，数值连续不能单独保证循环自然。
