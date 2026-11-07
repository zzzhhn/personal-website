# 漫游音乐流式播放交接

主协调已将运行目标更新为 `boardwalk-longform.mp3`，时长 502.187800 秒。文件大小和 SHA-256 与音乐会话交付逐字节核对，FFprobe 时长一致。源码已整合到候选分支，4341 的提升仍受性能复测条件约束。

正常漫游在可信键盘或指针输入后，复用 Park 的 `AudioContext` 和混音链。每个挂载周期最多创建一个 `HTMLAudioElement`、一个 `MediaElementAudioSourceNode` 和一个音乐增益节点。`play()` 在手势处理期间调用，媒体就绪、播放请求成功及音频上下文运行后，音乐增益才从零淡入。录音交给浏览器媒体管线，`snapshot().roaming.bytes` 只统计应用持有的解码 PCM。QA 试听和有限音效仍走原有 AudioBuffer 路径。[MDN AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) · [HTML 激活事件](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event)

暂停、后台、静音、音乐音量归零、场景截图及泳池检视都立即静音并暂停。普通续播直接沿用元素冻结后的原生播放位置，避免对 `currentTime` 的额外写入触发寻址。媒体尚在启动缓冲时清除资源，重新装载时恢复已保存的位置。Club 交接以音频时钟在 180 ms 内降到零，再由一个可取消的单次定时器暂停媒体。若主线程延迟，恢复位置最多推进到淡出截止点。卸载会清理媒体事件、媒体地址、音频节点和定时器。

定向 Node 测试通过 51/51，包含媒体时钟在 `pause()` 内前进时续播不发起寻址、Club 淡出逾期后恢复到截止点、错误重试重新装载并恢复非零位置，以及 QA/SFX 回归。原 25.114626 秒 WAV 的完整性断言独立保留。媒体管线对容器时长允许 ±0.25 秒误差。实际网络请求、浏览器缓冲、寻址、循环接缝和听感由浏览器及音频验收确认。

主协调于 2026-11-07 16:08 在 Chrome 使用正式 `ParkAudio` 的音频独立页复测。挂载无 AudioContext，可信点击后媒体时长 502.1878 秒、单播放源、零应用自持整曲 PCM；21.458141 秒暂停，续播观测 22.532126 秒；Club 接管在 36.118347 秒暂停，恢复观测 37.308476 秒。释放后 owners=0、context=absent、subscribed=false、streaming=false，控制台无错误。原始 DOM 状态在 `boardwalk-native-browser.json`。这验证播放生命周期，不代表完整 8 分钟听感或世界场景的帧耗验收。

首轮浏览器发现普通暂停期间时钟的微差引发多余 `currentTime` 写入，在不支持 Range 的 stdlib 服务上重启播放。已修正暂停与续播，并在 `serve-review.py` 增加有限块复制的 HTTP Range 支持。实际 MP3 请求返回 206；4 项 HTTP 测试覆盖 fallback 文件、局部/后缀/开放区间、HEAD 和无效范围。4341 原进程没有重启，等通过性能验证后才使用新版服务。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/{park-roaming-music,alpha-audio-lifecycle,resource-lifecycle}.test.mjs
```
