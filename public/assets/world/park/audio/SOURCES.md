# 漫游音乐来源

## 栈道晨光 v2

2026-10-30 由本项目 Phase 2 音乐会话制作原谱和混音。公开文件 `boardwalk-v2.wav` 是主试听 WAV 的逐字节副本，SHA-256 为 `297b3c3ae76d463015970e1f009c09c9f8548f526dd9cef65ed00ce7893e49e8`。44.1 kHz 双声道 16-bit PCM，1,107,555 帧，25.114626 秒，4,430,298 字节。运行时保留自然收尾，结束后重头播放。

- 主吉他使用 Meta Creative Audio 的 [Meta Steel Guitar](https://github.com/facebookincubator/Meta-open-sound/tree/251c0be57d5d1b3242b91f53e0cde62ab1cb42d9/systems/instruments/meta-steel-guitar) 分弦录音采样，授权为 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。
- 辅助低音、马林巴、celesta 与刷鼓来自 S. Christian Collins 的 [GeneralUser GS 2.0.3](https://github.com/mrbumpy409/GeneralUser-GS)，由 TinySoundFont 离线渲染。其[许可全文](GENERALUSER-LICENSE.txt)允许音乐制作与商业录音，并披露部分旧采样的来源无法完全追溯。公开文件仅包含混音成品。
- Kevin MacLeod 的《Easy Lemon》仅用于编曲方向和响度参照，没有成为谱面转录、采样、混音或模型输入。

## 36 秒 B 循环

2026-10-28。`island-walk-b-loop.wav` 为项目内新写的确定性乐谱与合成波形，来自 `docs/world/phase-2-playground/overhaul-20261028/walk-loop-b/island-walk-b-loop.wav` 的逐字节副本，用于世界漫游背景。

36 秒，80 BPM，12 小节，24 kHz／双声道／16-bit PCM。公开传输文件 3,456,044 字节（约 3.30 MiB）；24 kHz AudioContext 实际解码缓存为 6,912,000 字节（约 6.59 MiB），若浏览器回退至 48 kHz，则上限 13,824,000 字节（约 13.18 MiB）。只保持一份漫游解码缓存与一个音乐 source；原 SFX／Club／驾驶／coaster 缓存另计。

合成源 `src/components/world/walk-music-loop.ts`，离线导出 `tools/world/render-walk-music-loop.mjs`。逐音谱面、SHA-256、来源哈希及实际 −25.9 LUFS-I／−12.5 dBTP 测量保存在原候选目录的 `score.json`／`analysis.json`；音色、编曲、音量文件与原候选完全相同，本轮没有转码或重渲染。

无录音、外部采样、音乐模型、下载音色库或网络音乐服务；用户指定的 [music-composition-skills](https://github.com/jtydhr88/music-composition-skills) 仅提供动机发展／减法编曲／音色选择的方法，没有作为音频生成后端。不以此作法律原创性鉴定，也未另设资产开源许可。

Club 的 Kevin MacLeod 录音没有作为输入或修改，仍沿用 `public/assets/world/club/audio/SOURCES.md`、`club-edits.json` 与运行界面原署名、CC BY 4.0 链接及修改说明。
