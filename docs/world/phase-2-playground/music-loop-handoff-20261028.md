# 音乐线第二轮：36 秒 B 循环

2026-10-28。分支 `codex/goal-world-music`，保留前次 `0f40dce`。本轮新增离线候选作曲／合成源、导出脚本、音频测试和候选文档。没有改 WorldParkAudio／WorldClubAudio／WorldRuntime、默认音乐、现有 12 秒接口或任何他人文件；未推送、未操作 4341。

## 交付

[直接试听与指标](overhaul-20261028/walk-loop-b/README.md)；[36 秒 WAV](overhaul-20261028/walk-loop-b/island-walk-b-loop.wav)；[规格](overhaul-20261028/walk-loop-b/spec.md)；[乐谱](overhaul-20261028/walk-loop-b/score.json)；[测量与来源哈希](overhaul-20261028/walk-loop-b/analysis.json)。

36 秒／80 BPM／12 小节，24 kHz 双声道 16-bit PCM，仅一份音频，3,456,044 字节（3.30 MiB），新增成品小于 5 MiB。解码预算 6,912,000 字节，与文件大小分开记录。新写的确定性谱面和音色，没有使用采样、录音、模型或外部音乐服务；Club 录音及署名／许可未动。

A 保留短 B 的 E-G-A-G／D-C；B 在同节奏上发展并使用实际 Fm；C 撤旋律／低音，只留低音区片段与薄和声再留白；D 缩句并让 C4 回答与 Cmaj7 尾音跨回开头，避免复制三次 12 秒。felt／pluck／pad／bass 各有有限且不同的包络，上泛音先衰减。温暖、不尖锐和自然循环仍是设计目标，未做听感确认。

## 技术验证

- 资源预检 pressure 2、swap 10.11 GiB、磁盘可用约 9.72 GiB。原子取得 `/tmp/bobby-world-phase2-heavy.lock`，owner 为 `goal-world-music-loop-b-20261028`，串行导出及测量 1,061 ms 后在 finally 释放。没有抢占他人锁、开浏览器、完整 build、下载／装依赖或 DAW。
- 实际 WAV：−25.9 LUFS-I，−12.5 dBTP，满幅削波 0，ffprobe 确认 pcm_s16le／24 kHz／2 声道／36.000000 秒。
- 左／右接缝步长 0.00027466／0.00039673，斜率变化 0.00009155／0.00012207；接缝两端非零。三轮概念拼接的两个连接点检查通过，不额外生成大音频。C 的实测 RMS 比 B 低约 11.5 dB。
- `node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/walk-music-loop.test.mjs src/components/world/audio-calibration.test.mjs`：6 项通过，涵盖 WAV 身份／源哈希、帧数／体积、峰值／非零接缝与斜率、动机发展／减法／跨界尾声、低采样率确定性和非法尺寸保护，同时保留原 12 秒成品检查。
- `node node_modules/typescript/bin/tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck src/components/world/walk-music-loop.ts` 与 `git diff --check` 通过。原运行时未改，没有重复整个世界回归。

## 主线后续

请直接试听 WAV 两轮以上，判断是否仍像提示音、两处留白是否太空、变化是否自然、末句回到开头是否可接受，再决定接入。没有实际听过本文件，不将电平／接缝检查写成音乐听感验收。真实浏览器解码与现场相对响度未测；本轮不改 12 秒播放接口，主线如试接需另行使用此循环文件或新的离线源。

本轮一个 commit 后停写，等待主线试听与整合；没有新增跨线代码接口请求。
