# 漫游音乐正式接入交接

2026-10-28。分支 `codex/goal-world-music-roaming`，从已集成的 `5f5e673` 创建。用户对 36 秒曲的实际反馈为「保留这个轻柔方向，继续完善」。本轮按这个认可范围接入漫游，没有改作曲／音色、Club 曲目、驾驶／coaster 音效或 WorldRuntime。

## 实现与资源

`WorldParkAudio` 在现有世界组件 retain 后监听可信 pointerdown／keydown；首次合适手势才创建原共享 context、调用 resume 并按需 fetch 预渲染 WAV。键盘自动重复不触发重试，挂载、设置和无关位置写入不会自行创建音频或合成 36 秒 PCM。恢复帧只处理已有状态与节点，预渲染音频交给 decodeAudioData，不 import 离线作曲器。

`park-roaming-music.ts` 使用同一 Park context，最多一个音乐 source、一份解码缓存，无 timer／RAF／轮询。原旧双 Deck 的程序音乐、25 ms 调度器、鼓／琶音生成已移除；功能性的矿场探测／击中／水花和工坊／IBD 短音保持。已有 12 秒 QA 接口保留且与漫游互斥，正常漫游不需要 QA 参数。

公开路径 `/assets/world/park/audio/island-walk-b-loop.wav`，与已认可的候选逐字节相同。文件 **3,456,044 字节，36 秒，24 kHz／双声道／16-bit PCM**。请求 24 kHz context 时缓存 **6,912,000 字节**；不支持该请求的浏览器回退默认 context，48 kHz 上限 **13,824,000 字节**，更大／错时长／错声道解码拒绝缓存。来源在 `public/assets/world/park/audio/SOURCES.md`，原候选目录中的乐谱／生成源哈希／测量记录继续保留。没有转码、下载或新依赖；Git 复用相同 WAV blob。

暂停、后台、shot、poolInspect、Music=0、主静音、Park 局部静音和 BFCache pagehide 均停源并保存曲中位置，取消未完成的 fetch；恢复后从保存位置重新建一个 source，复用同一缓存，不追赶后台时间，不补播旧 SFX。浏览器无法取消的 decode 用 revision 丢弃迟到结果，并在它结束前禁止另一轮 fetch／decode 重叠。最终 owner 卸载或非缓存离页时释放 source、缓存、context 和订阅；迟到结果不能重新填充缓存。

通过既有 `world-music-focus` 监听 Club 实际出声，进入时停漫游源，离开或 Club 真正静音时恢复位置；不由距离／ready／播放意图推断正在出声。这里的一个共享 context 指 Park 漫游与其原有短音共享，既有 Club／驾驶／coaster 独立服务未重写或增加 context。

音乐随 Music 电平，短音随 SFX 电平；主静音都覆盖。有限交互将漫游降至自身电平 45%，45 ms 压低、220 ms 回升，不重建 source。默认漫游 gain＝1.6×Music，仍经过原 Park master 0.16，合计 0.256；这使背景相对动作克制，现场相对响度需主线试听校准，不把文件 −25.9 LUFS 当作现场输出响度。

加载／解码失败停在 error 并休眠，只在下一次非自动重复的可信手势重试；恢复竞争受既有 context 转换串行保护。没有后台重试计时器。

## 验证记录

资源预检 pressure 2、swap 约 11.7 GiB、磁盘可用约 7.35 GiB；等待主线释放锁后，以 owner `goal-world-music-roaming-tests-20261028` 原子取得共享窗口，串行运行以下回归，**85 项全部通过，耗时约 3.106 秒**，finally 释放本任务锁：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/park-roaming-music.test.mjs src/components/world/alpha-audio-lifecycle.test.mjs src/components/world/resource-lifecycle.test.mjs src/components/world/club-audio.test.mjs src/components/world/world-audio-settings.test.mjs src/components/world/attractions/ibd-action-audio.test.mjs src/components/world/attractions/coaster-motion-audio.test.mjs
```

新增 9 项覆盖：正式默认路由的可信手势／异步资产加载、一个 context／source／cache、九类退出与原位置恢复、交互 ducking、Music 静音保留 SFX、fetch 取消与错误后手势重试、不可取消 decode 串行及卸载后丢弃、resume／Club／卸载竞争、autoplay 失败不轮询、公开文件身份和实际字节预算。旧 25 ms scheduler 相关测试改为验证零调度与录音播放；IBD 专属 SFX 测试显式 Music=0，继续验证该系统的无关手势不创建音效，没有削弱世界默认音乐的独立验证。资源测试中的 gamepad 回归未改，仍通过。

资源再次预检后，以 owner `goal-world-music-roaming-typecheck-20261028` 取得空闲锁，以下局部 TypeScript 检查通过，约 0.5 秒后释放：

```sh
node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions --types vite/client --target es2022 --module esnext --moduleResolution bundler --jsx react-jsx --lib es2022,dom --skipLibCheck src/components/world/WorldParkAudio.ts src/components/world/park-roaming-music.ts
```

`git diff --check` 通过。测试日志暂存 `/tmp/goal-world-music-roaming-tests.log`，交付后可删除。本轮没有打开浏览器／完整构建、转码、重渲染、下载或安装依赖，没有操作 4341 或推送。技术状态通过不等于真实浏览器或现场听感已通过。

## 主线现场检查

默认路由无 QA 参数，走动一次后确认 36 秒循环；暂停／后台 30 秒再恢复，确认从原位置继续、没有多轨；走入正在出声的 Club 后停止漫游，离开后恢复；Music=0 下操作仍有 SFX，主静音均停；工坊完成时背景压低并回升；离开世界后 context／source／缓存归零。真实 Safari 自动播放、现场相对响度和用户场景内听感仍需主线持有浏览器窗口验证。
