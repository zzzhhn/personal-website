# 工坊合成音效小批次交接

2026-10-28，基线 `a550432` 加主协调当前工坊工作区。已实现并通过代码／波形检查；未试听，未作浏览器或音质验收。没有提交推送。

## 改动与调用

- `src/components/world/WorldParkAudio.ts`：新增 `renderWorkshopSound(kind, sampleRate = 24000)` 与 `parkAudio.workshopCue(kind, intensity = .45)`。前者确定性生成真实单声道 PCM，后者按需缓存为 AudioBuffer，连接现有 SFX bus，返回取消函数。旧 `cue('scan'|'strike'|'splash')` 的音色和调用语义未变。
- `src/components/world/attractions/intent-workshop-runtime.ts`：只增加／替换音效调用及加工声取消逻辑；接件、分流、摇铃、加工、正确／错误出件使用独立声音。现有动画时钟越过 0.35 秒时只触发一次加工声；结果提交前停止加工声。暂停／隐藏、revision 失配、reset 会取消，恢复不重播已经经过的加工段。
- `src/components/world/attractions/intent-state.ts`：经主协调追加授权，仅在 `activateIntentTarget('gate')` 的 `unlock-gate` 提交使 `gateOpen` 从 false 变为 true 时调用 `workshopCue('unlock')`。未增加全局订阅。此文件已有的 `commitIntentEvent`／actor availability 重构属于主协调，不是本批新增。
- 聚焦测试：扩展 `alpha-audio-lifecycle.test.mjs`、`attractions/intent-workshop-runtime.test.mjs`。后者及工坊 runtime 本来就是主协调未提交的新文件，保留原实现与原测试。

声音采用短起音辨识材质、疏密与留白区分动作、有限衰减避免持续尖音的设计原则。这是程序合成拟音草案，不是录音素材，也不是音乐 skill 自动生成的成品。没有新增外部素材、授权曲采样、UI、全局音量默认值或其他模块声音事件。

| kind | 设计意图 | 秒 | 原始 PCM peak | 原始 PCM RMS | 调用强度 |
| --- | --- | ---: | ---: | ---: | ---: |
| intake | 木质碰触、短滑动、接件卡扣 | 0.24 | 0.3025 | 0.0492 | 0.45 |
| route | 低拉杆碰触、摩擦、两次棘轮落位 | 0.36 | 0.2337 | 0.0363 | 0.40 |
| process | 低机械转动底声与六个不等间隔触点，末段留白 | 2.35 | 0.0984 | 0.0173 | 0.28 |
| success | 两个短木槌共鸣，上行回答 | 0.48 | 0.3079 | 0.0518 | 0.40 |
| error | 低闷接触、滑回、下降落位 | 0.40 | 0.2563 | 0.0425 | 0.35 |
| bell | 非整数倍泛音的短金属共鸣 | 0.70 | 0.3077 | 0.0494 | 0.35 |
| unlock | 锁舌轻响、摩擦、低卡扣，再开放共鸣 | 0.80 | 0.2481 | 0.0384 | 默认 0.45 |

以上是小测试直接渲染所得的 PCM 数值，未包含调用强度、现有 Park master 的 0.16 增益、SFX 设置或压缩器，不能当作扬声器响度／LUFS 或听感评价。实际已能生成和播放，不只是音效名称或 prompt；本轮验证了生成样本与播放节点连接，未打开扬声器试听。

## 生命周期与成本

每个动作只创建一个有限 AudioBufferSource，不循环。沿用主静音、SFX 音量、暂停／后台／poolInspect／shot／pagehide 门禁、最多 8 个 cue source，以及只保留最新 pending 事件和 250 ms 过期规则。取消函数同时取消尚在等 resume 的本次事件，且不会停止之后的新结果声。

七个 24 kHz mono float32 buffer 总计 **511,680 字节，约 499.7 KiB**；按需生成一次，后续复用，dispose 清空。该数字只计新增 PCM，不含已有噪声 buffer、AudioNode 与浏览器开销。没有新 interval、timeout、RAF、分析器、解码下载或模型。首次合成仍在主线程执行，本机小测试很短，但未测浏览器帧耗时。

## 验证

验证前资源：memory pressure 2，swap 10.27 GiB，磁盘余量 4.53 GiB。原子取得 `/tmp/bobby-world-phase2-heavy.lock`，串行小测试完成后校验 owner 并释放。没有操作 4341、打开浏览器／服务、构建或下载依赖。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/alpha-audio-lifecycle.test.mjs src/components/world/club-audio.test.mjs src/components/world/world-audio-settings.test.mjs src/components/world/attractions/intent-workshop-runtime.test.mjs
```

**43／43 通过**，约 1.68 秒。覆盖原音频回归与本批：七段真实 PCM 的确定性／非静音／有限数值／首尾归零／内存上界，实际 buffer 接入 SFX bus，单音源与缓存复用，8 source 上限，生命周期门禁，pending 取消／过期不补播，取消旧加工声不伤新结果声；工坊事件准确发声一次、暂停／reset 取消、解锁失败无声及成功仅一次。依赖保留一条已有 `THREE_CJS_DEPRECATED` 提示，无测试失败。

TypeScript 定向检查 `WorldParkAudio.ts`、`intent-workshop-runtime.ts`、`intent-state.ts`，项目配置加 `vite/client`，自身及传递依赖 **0 diagnostics**。`git diff --check` 通过。最后只把一个测试标题改为“faded endpoints”，避免文字暗示已听过接缝，无逻辑变化。

下一步由主协调在资源允许时做实际等响试听：优先听接件与分流是否能区分、加工是否遮住结果、失败是否过重、铃与解锁是否过亮，以及暂停切断是否有可闻瞬态。保持现有 UI／音量默认值，先调整局部合成参数或调用强度；不得把本批通过数值检查写成音质已获认可。
