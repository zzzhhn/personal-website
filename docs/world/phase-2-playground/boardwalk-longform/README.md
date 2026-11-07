# 栈道晨光 · 长版

44.1 kHz 双声道，160 kbps MP3。沿用《栈道晨光 v2》的 C 大调、82 BPM、4/4 拍、分弦吉他采样、辅助音源与固定声部增益。新版保留原版前 8 小节的谱面事件，等第 8 小节的 C6 余音松开后从第 9 小节第二拍接走；未在长版中拼接旧 WAV，也未使用 Easy Lemon 的音频或曲谱。

| 小节 | 约起点 | 段落 | 主要变化 |
| --- | ---: | --- | --- |
| 1–8 | 0:00 | 原主题 | 保留原谱的吉他、马林巴、低音与刷鼓问答 |
| 9–24 | 0:23 | 木板路 | 继续原主题语汇，轮换指拨与软扫 |
| 25–40 | 1:10 | 朝潮 | 刷鼓变疏，吉他滚奏，转向小调色彩 |
| 41–56 | 1:57 | 石阶 | 撤下刷鼓，马林巴降到较低音区 |
| 57–72 | 2:44 | 坡上的风 | 指拨提起，马林巴线条上行 |
| 73–88 | 3:31 | 避风处 | 短动机隔小节呼吸，celesta 在空拍答句 |
| 89–104 | 4:18 | 回到海边 | 回收原主题动机，续写第二组和声句 |
| 105–120 | 5:04 | 浅水 | Dm7 起句，低音与马林巴重新问答 |
| 121–136 | 5:51 | 长椅 | 第二次撤下刷鼓，回到低音区 |
| 137–152 | 6:38 | 海岸回望 | 较完整的指拨和刷鼓，主题压缩回归 |
| 153–168 | 7:25 | 放慢脚步 | 刷鼓再减，后八小节撤下，保留同一速度 |
| 169–171 | 8:12 | 余响 | 三小节收束到 C6，自然衰减后停顿 |

全曲 171 小节及 1.7 秒尾部，共 502.187800 秒。原运行 WAV 的实测时长 25.114626 秒，长版约 19.996 倍。最后回到与首拍相容的 C6，留出自然尾声；这是有停顿的整首重播设计。谱面和声、实际音符与逐段计数见 [arrangement.json](arrangement.json)，编辑用 [score.mid](score.mid) 将吉他按六根弦分轨。MIDI 是谱面，采样器的拨弦与混音以渲染源码为准。

## 来源与许可

- 原运行 WAV 与 10 月 30 日交付 WAV 字节一致，SHA-256：`297b3c3ae76d463015970e1f009c09c9f8548f526dd9cef65ed00ce7893e49e8`。长版的开场音符从该交付的原始谱面冻结，源谱与采样计划的 SHA-256 保存在工具目录的 `v2-seed.json`。
- 主吉他继续使用 [Meta Creative Audio 的 Meta Steel Guitar](https://github.com/facebookincubator/Meta-open-sound/tree/251c0be57d5d1b3242b91f53e0cde62ab1cb42d9/systems/instruments/meta-steel-guitar)，固定提交 `251c0be57d5d1b3242b91f53e0cde62ab1cb42d9`，沿用 19 个已存的官方 OGG 预览，每个保留 URL 和官方 SHA-256。使用实录的对应弦、音高和力度层，不移调；[CC0 1.0 许可](licenses/META-STEEL-GUITAR-CC0.txt)。
- 低音、马林巴、celesta 和刷鼓继续使用 [GeneralUser GS 2.0.3](https://github.com/mrbumpy409/GeneralUser-GS)，[完整许可](licenses/GENERALUSER-LICENSE.txt)允许将其用于音乐录制，部分旧采样的出处仍有不确定性。引擎沿用未修改的 TinySoundFont，[MIT 许可](licenses/TINYSOUNDFONT-LICENSE.txt)；该引擎不实现 SoundFont modulators。

## 复现和验收

在此工作树根目录，使用 Python 3.14、NumPy、SciPy、FFmpeg（libmp3lame）和 Clang。先准备不含音频解码的谱面；获协调窗口后，将同一输出目录传给 `--render`。要再次渲染，请换一个新目录。

```sh
python3 -B tools/world/boardwalk-longform/render.py --prepare PATH_TO_NEW_OUTPUT
python3 -B tools/world/boardwalk-longform/render.py --render PATH_TO_NEW_OUTPUT \
  --sources PATH_TO_V2_SOURCE_SAMPLES --cache PATH_TO_V2_SOUNDFONT_CACHE \
  --lock-owner OWNER_RECORDED_BY_COORDINATOR
```

`--sources` 是原版 `music-session-v2/source-samples`，本工具不下载输入。缓存中需要 `GeneralUser-GS-2.0.3.sf2` 和 `tsf.h`，两者及全部吉他采样都按固定哈希核对。四个辅助合成声部共享一份只读采样库，独立保留发声状态；分块混合保留滤波、释放和短反射状态。磁盘只暂留一份浮点预混，不保留整首 WAV。整首按单一固定增益调整响度，不单独归一化各声部。

成品与离线指标见 [完整 MP3](boardwalk-longform.mp3)、[qc.json](qc.json)、[资源窗口记录](resource-receipt.json)。可先听 [开场](01-theme.mp3)、[避风处](02-shelter.mp3) 和 [后半主题回望](03-return.mp3)。技术检查包含 MP3 解码后的帧数、响度、真峰、低电平区段、所有段落边界及尾首跳变；听感和试玩中的流式切换由另一步验收。

成品为 10,045,221 字节，SHA-256 `21a7194db8185d9f0be6c091d89a04a31749e748ed56c04955ec33d1d0029642`。解码帧数为 22,146,482，综合响度 −22.50 LUFS，较原试听 MP3 的 −20.26 LUFS 低 2.24 LU；单一增益受预混真峰限制，未压缩瞬态。成品真峰 −3.59 dBTP，按 50 ms 网格、−55 dBFS RMS 阈值计，曲中连续低电平最长 0.20 秒，曲尾约 1.09 秒。尾首相邻样本跳变 −66.55 dBFS。成功窗口的进程组 RSS 采样峰值约 211 MiB，执行约 42 秒，锁已释放。
