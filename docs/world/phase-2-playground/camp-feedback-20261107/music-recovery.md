# 营地试玩背景音乐换曲

找到的更新版是《栈道晨光 v2》。10 月 29 日获认可的是 40 秒轻柔漫游方向，之后的节奏反馈要求重做。10 月 30 日先有被用户否定的《海岸晴日》，再由 Phase 2 音乐会话沿用户认可的 Easy Lemon 听感方向重新作曲。新版主试听在另一个工作树的未提交交付目录中，因此此前的 4341 营地试玩仍请求 40 秒母带 `island-walk-daily-v1.wav`。更换前已对照实际试玩的运行 JS 和 HTTP 文件哈希，核实该曲与 `df76b4d` 完全一致。

- [音乐会话交付与创意确认边界](</Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/docs/world/phase-2-playground/feedback-20261030/music-session-v2/README.md>)
- [更新版主试听 MP3](</Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/docs/world/phase-2-playground/feedback-20261030/music-session-v2/boardwalk-v2.mp3>)
- [运行版 WAV、音源与许可](../../../../public/assets/world/park/audio/SOURCES.md)

WAV 按交付字节接入，SHA-256 为 `297b3c3ae76d463015970e1f009c09c9f8548f526dd9cef65ed00ce7893e49e8`。44.1 kHz／双声道／16-bit PCM，4,430,298 字节，1,107,555 帧，25.114626 秒。主吉他来自 Meta Creative Audio 的 CC0 分弦录音采样，辅助声部使用 GeneralUser GS，随运行资源保留了来源记录与完整许可。Easy Lemon 是听感参照。

正常试玩仍在可信手势后解码一份 WAV。保留原始 25 秒乐句和自然收尾，随后从头重复。尾端约半秒接近静音，用户可以听到自然停顿。音乐固定增益为 1.4，叠加现有 master 0.16 后的输出约为 −35.5 dBFS RMS，匹配上一版输出。暂停、静音、Club 交接与 SFX ducking 走原生命周期。48 kHz 解码上限约 9.64 MB。

75 项定向测试通过，覆盖文件身份、选曲请求、解码预算、播放位置跨越曲尾、暂停恢复、Club 交接及提示音独立控制。10 月 30 日交付记录只确认成品技术检查，本次定向测试也未包含人工听感验收。生产预览的浏览器和试听状态由本轮主会话记录。
