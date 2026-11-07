# 漫游音乐流式播放交接

主协调已将运行目标更新为 `boardwalk-longform.mp3`，时长 502.187800 秒。文件大小和 SHA-256 与音乐会话交付逐字节核对，FFprobe 时长一致；更换元数据后再次独立运行 50 项定向测试全部通过。源代码已整合到候选分支，4341 的提升仍受性能复测条件约束，浏览器实际播放验收尚待完成。

正常漫游在可信键盘或指针输入后，复用 Park 的 `AudioContext` 和混音链。每个挂载周期最多创建一个 `HTMLAudioElement`、一个 `MediaElementAudioSourceNode` 和一个音乐增益节点。`play()` 在手势处理期间调用，媒体就绪、播放请求成功及音频上下文运行后，音乐增益才从零淡入。录音交给浏览器媒体管线，`snapshot().roaming.bytes` 只统计应用持有的解码 PCM。QA 试听和有限音效仍走原有 AudioBuffer 路径。[MDN AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) · [HTML 激活事件](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event)

暂停、后台、静音、音乐音量归零、场景截图及泳池检视都立即静音并暂停。媒体尚在启动缓冲时清除资源，恢复时继续使用同一个元素。Club 交接以音频时钟在 180 ms 内降到零，再由一个可取消的单次定时器暂停媒体。若主线程延迟，恢复位置最多推进到淡出截止点。卸载会清理媒体事件、媒体地址、音频节点和定时器。

定向 Node 测试通过 50/50，覆盖无手势空载、零增益起播、触摸释放、同源复用、缓冲取消、拒播后手势重试、迟到的事件和 Promise、淡出竞争及 QA/SFX 回归。原 25.114626 秒 WAV 的完整性断言独立保留。新录音集成时更新 `PARK_ROAMING_TRACK` 的地址、秒数及文件大小，媒体管线对容器时长允许 ±0.25 秒误差。实际网络请求、浏览器缓冲、寻址、循环接缝和听感由浏览器及音频验收确认。

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/{park-roaming-music,alpha-audio-lifecycle,resource-lifecycle}.test.mjs
```
