# 音乐与工坊音效短 A/B

2026-10-28。**已渲染、已做有界接入和定向测试，尚未试听、未获用户听感认可，未推广到 4341。** 这是短校准批次，不把此前 48 秒候选当成已完成改善。

| 对照 | A | B |
| --- | --- | --- |
| 音乐，12 秒 | [music-a.wav](music-a.wav)，保留重复陈述和等力度，作为控制组 | [music-b.wav](music-b.wav)，同一音色／和声／速度，测试力度问答、第三小节撤出、末句分解与提前退场 |
| 接件，0.24 秒 | [intake-a.wav](intake-a.wav)，当前实际工坊合成 | [intake-b.wav](intake-b.wav)，较短、低频木质双触点 |
| 铃，0.70 秒 | [bell-a.wav](bell-a.wav)，当前双击金属设计 | [bell-b.wav](bell-b.wav)，单次金属激发与有限尾音 |
| 成功，0.48 秒 | [success-a.wav](success-a.wav)，当前实际两音结果 | [success-b.wav](success-b.wav)，相同 G-C 回答轮廓，缩短共鸣、减弱上泛音 |

音乐 A 是基于同一动机新渲染的控制组，**不是旧 48 秒成品的裁切，也不是当前全岛正在播放的音乐**。原 48 秒样段、Club 两首录音及署名均未替换。工坊仅上述三种声音有 B，route／process／error／unlock 保留原实现。

两段音乐均测得 **−25.2 LUFS-I**，真峰值分别 −14.9／−13.4 dBTP。音效按每一对相同时长的全段 RMS 匹配，差值小于 0.01 dB；这不代表主观响度完全相同。240 ms 接件短于 R128 的 400 ms 窗，报告 `integrated_lufs: null`，不把 FFmpeg 的 −70 哨兵值当测量结果。铃／成功的 LUFS 仍有约 0.3／0.2 LU 差异。

八个 WAV 共 **2,440,672 字节**，24 kHz／16-bit PCM；音乐双声道，音效单声道。两段音乐最后一秒均为数字静音。完整哈希、实际帧数、峰值、响度、工具与生成源哈希见 [analysis.json](analysis.json)。文件指标不能证明好听。

## 世界内候选

由主线安排浏览器窗口后，在其候选预览的**现有世界路由**增加 `?qa=1&audioCandidate=a` 或 `?qa=1&audioCandidate=b`，已有参数则用 `&`。本分支不启动新服务器、不改 4341。

- 只有明确 QA 参数启用候选，第一次可信 pointerdown／keydown 才创建音频并播放一次。仅挂载、改设置和不可信事件不创建 context。
- 12 秒后停源并休眠，没有重播计时器；暂停、后台、shot、poolInspect、主静音、Music=0、离页都会取消，不恢复补播。最后 owner 卸载关闭 context、清除候选 buffer 和订阅。
- 复用 Park 原 context 和全局音乐电平，最多一个预览 source；短音让音乐降至其原电平的 40%，不改全局音量。音乐预览不启动旧 DJ 的 25 ms scheduler，旧音乐 API 与候选也不会叠播。
- Club 通过当前运行 context、真实 source、距离、局部／全局音量及 crossfade 的贡献发布可听状态。只加载了曲目或静音 Deck 的播放意图不会误占音乐；Club 实际可听时立即取消候选，Club 退出后不补播。SFX 保持独立。
- QA 可读 `window.__parkAudio.snapshot()` 的 `candidate`／`previewPlaying`／`previewPending`／`previewBytes`，不需要轮询。一个音乐缓存 **2,304,000 decoded bytes**，切换时替换，卸载归零；原 Club／短音／车辆缓存另计。

回退只需移除 `audioCandidate` 参数并重新进入世界。默认路由保持当前素材；当前分支也可整体撤销本次 commit，音频文件和实现没有迁移／持久化状态。

## 制作来源与复现

乐谱、波形、包络和混音均由本项目新写的确定性合成生成，没有调用音乐模型、下载音源、使用第三方录音／采样，未使用 Club 录音作为输入。此为制作来源，不是法律原创性鉴定，也未为项目资产另设开源许可。

参考库只提供制作方法：[mc-workflow](https://github.com/jtydhr88/music-composition-skills/blob/main/plugins/music-composition/skills/mc-workflow/SKILL.md)、[mc-development](https://github.com/jtydhr88/music-composition-skills/blob/main/plugins/music-composition/skills/mc-development/SKILL.md)、[mc-arrangement-arch](https://github.com/jtydhr88/music-composition-skills/blob/main/plugins/music-composition/skills/mc-arrangement-arch/SKILL.md)、[mc-sound-design](https://github.com/jtydhr88/music-composition-skills/blob/main/plugins/music-composition/skills/mc-sound-design/SKILL.md)，并读取模板／编译边界。它没有生成这些音频。所读文件 Git blobs 分别为 `b71e77927b5891db788c14e2a237a82a723a3d84`、`3383f0f4ba8e83ad7436f67515fa7f397c03b397`、`b1b6bc1bbc4e99612cd8cee9ee9460f4eabf4e10`、`5d20ff3a0d107930a2a88ee586c9dd5259272539`。

[规格增量](spec.md) 说明本轮的选择与豁免。生成源为 `src/components/world/walk-music-candidate.ts` 与现有 `WorldParkAudio.ts`。从仓库根目录运行：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs tools/world/render-audio-calibration.mjs
```

脚本只导出八个短 WAV 和报告，逐文件串行用现有 FFmpeg 测量，不下载／安装／播放。可再生固定路径会覆盖本批资产，先保留人工改版再运行；48 秒／分轨重渲染仍走原来的共享重任务窗口规则。

## 待主线组织的试听

先把音乐两版顺序打乱，固定设备／音量听一遍，间隔后反序再听，分别记录动机重复感、撤出是否突兀、末句是否自然。音效单独按三对比较，先不看画面辨动作，再在工坊试接件与铃、加工完成。耳机和笔记本各一轮。两遍意见不一致时保留差异待查，不凭测量数值宣布 B 胜出。

浏览器需验证 Safari 的真实手势、暂停／恢复、后台 30 秒、Club 混音与一次手动中断。以上尚未执行；本地 mock 测试不能代替真实播放与用户听感。
