# Club 音乐来源与署名

2026-10-27 核对并更新。当前两段音乐来自本机既有合拍项目的 `backend/data/audio_cc/`，由 Kevin MacLeod 公开曲目节选后处理。制作记录为本目录的 [club-edits.json](club-edits.json)，脚本为仓库 `tools/world/club-prepare-audio.py`。此前记载 FAL／ElevenLabs 旧 Demo 的说明已过时，本页以当前文件为准。

## 作者、曲目和授权

| 当前文件 | 曲目与作者 | 作者曲目标识／原速 | 作者页面 |
| --- | --- | --- | --- |
| `backbay-lounge-club.mp3` | Backbay Lounge · Kevin MacLeod | ISRC `USUAN1700068`；120 BPM | [Backbay Lounge](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1700068) |
| `disco-con-tutti-club.mp3` | Disco con Tutti · Kevin MacLeod | ISRC `USUAN1200091`；115 BPM | [Disco con Tutti](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1200091) |

作者当前[官方目录](https://incompetech.com/music/royalty-free/pieces.json)可核对曲名、ISRC 与 BPM；当前曲目页面的署名模板指定 **CC BY 4.0**。[作者许可页](https://incompetech.com/music/royalty-free/licenses/)提供需署名的免费 Creative Commons 选项。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)允许分享和改编，包括商用，要求适当署名、许可链接及修改说明。

署名：**Backbay Lounge／Disco con Tutti，Kevin MacLeod（[incompetech.com](https://incompetech.com/)），[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本项目进行了节选、保调变速、响度调整、长度适配、淡入淡出、重采样及 MP3 再编码。** 运行界面的音乐署名位于 `WorldClubHud.tsx`；本轮只核对其源码，未重开浏览器。

## 本机输入与处理

| 合拍本机源文件 | 本机源片段时长 | 本次节选起点与长度，均相对此输入 | 变速 |
| --- | --- | --- | --- |
| `Kevin MacLeod - Backbay Lounge.mp3` | ffprobe：62.171906 s | 12.03 s 起，截取 32 s | `atempo=118/120` |
| `Kevin MacLeod - Disco con Tutti.mp3` | ffprobe：46.938800 s | 4.1947826087 s 起，截取 33.3913043478 s | `atempo=118/115` |

作者目录的完整原曲长度分别为 4:27 和 3:56，这里的本机输入应称为**已有源片段**。本轮未取得首次下载、首次裁切记录，也未将输入逐字节比对作者完整发行文件；上述起点只相对于本机输入。

变速后采用单遍 `loudnorm=I=-18:TP=-1.5:LRA=9`，重采样到 32 kHz，以 pad／trim 固定 1,041,356 个 PCM 帧／声道，再作首尾 8 ms 淡化，编码为双声道／192 kbps MP3。源曲旧元数据已清除，当前输出仅保留新曲名、作者、`TBPM=118` 和编码器字段。

两个成品均已完整解码为 **32.542375 s**；这是 32 kHz 下最接近 `64 * 60 / 118` 的整数样本长度，比理论 64 拍长约 2.119 μs。118 BPM 来自作者元数据及保调变速比例，本轮未重新分析逐拍 Beat Grid、首拍或乐句位置，也未完成循环接缝听感验收。具体测量见仓库 `docs/world/phase-2-playground/djc-beach-club/audio-qc-20261027.md`。

## 文件身份

四项 SHA-256 均已与重制后的 `club-edits.json` 匹配。源音乐未改；本次输出由主线脚本重制，独立 QC 未写音频。

| 文件 | SHA-256 |
| --- | --- |
| 源：`Kevin MacLeod - Backbay Lounge.mp3` | `be307a0527d493bca7fcb0df3f719b00ff0e84a329918c6b2a8a624df89cd851` |
| 输出：`backbay-lounge-club.mp3` | `50ec8b504f2522a1d22d3c5c7f12908a2d115af905a1f85f8f75121255fb4cca` |
| 源：`Kevin MacLeod - Disco con Tutti.mp3` | `8641496defde2e3849b5ec5cd7cddeb51985684e0987cfd4d46bc22eb77fef0e` |
| 输出：`disco-con-tutti-club.mp3` | `9bf3218dc0b79c7823598d0eaaf498806312985f45a8c52c23f1d95bc62efc1f` |
