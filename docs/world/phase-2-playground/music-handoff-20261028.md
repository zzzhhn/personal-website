# 音乐线交接：短 A/B 与有界接入

2026-10-28。工作目录 `personal-world-phase2-music`，分支 `codex/goal-world-music`，实施基线 `43f9507`。本轮只改分配的音频模块、声音素材／生成源、音频测试和本文档；未动 Runtime、角色、轨道、美术、integration/main，未推送或操作 4341。

## 本轮交付

- [试听包与运行步骤](overhaul-20261028/audio-calibration/README.md)：音乐 A／B 各 12 秒，工坊 intake／bell／success 三对，八个实际 WAV 共 2,440,672 字节。两段音乐均 −25.2 LUFS-I，音效各对 RMS 差小于 0.01 dB；测量／SHA-256／实际乐谱已存 analysis.json。
- [短规格增量](overhaul-20261028/audio-calibration/spec.md)：读取用户指定 music-composition-skills 的 workflow、development、arrangement、sound-design、模板和 compile 边界后制作。B 保留同一动机，撤掉第三小节、改变力度呼应和末句收束。A 音乐为新渲染控制组，不冒充旧 48 秒成品裁切；A 音效来自当前真实工坊 renderer。
- `WorldParkAudio` 只有 `qa=1&audioCandidate=a|b` 才自动启用一次手势试听。复用现有 context、单个 music source 与单份 2,304,000-byte 音乐缓存；12 秒后停源休眠，无新 timer／RAF／轮询。Music／SFX 独立，交互使候选音乐降到 40%，主静音覆盖全部；取消／恢复不补播，卸载释放。
- `WorldClubAudio` 新增实际可听状态通知，经 `world-music-focus` 给候选让位。以 running context、真实 source、crossfade 贡献、距离和音量判断，不用 ready 或 playing 意图冒充出声。两首 Kevin MacLeod MP3、处理记录、署名和许可均保持原样。没有新增每帧通知：只在既有控制／播放／生命周期变化上检查。
- 发现并修复一条音频回归中的旧常量：v4 在 29 秒放行，35 秒已经运动；精确零速断言改到 `THRILL_RELEASE_SECONDS - 1` 的真实停顿。没有改运动曲线或放宽容差。

## 验证

资源检查两次：memory pressure 2，swap 约 10.5～10.6 GiB，可用磁盘约 2.01 GiB。只做源码、轻量确定性短样导出与串行 FFmpeg 指标测量，没有申请／抢占共享重任务锁，没有 48 秒／分轨重渲染、安装、下载、浏览器、完整 build 或 Blender。短样脚本每轮约 1 秒，八文件顺序测量；不声称持有主线的重任务窗口。

以下检查通过：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-reporter=dot src/components/world/alpha-audio-lifecycle.test.mjs src/components/world/club-audio.test.mjs src/components/world/audio-calibration.test.mjs src/components/world/world-audio-settings.test.mjs src/components/world/attractions/coaster-motion-audio.test.mjs src/components/world/attractions/ibd-action-audio.test.mjs
```

共 **68 项，68 通过**。新增覆盖：显式 QA／可信手势、一次播放与休眠、九类退出门、迟到 resume／卸载竞争、Music 静音保留 SFX、B 只替换三声、ducking、旧音乐不能叠加、Club 静音 Deck 与实际源、多 owner 清理、八个成品 PCM 身份／帧数／静音／峰值／等响比较。既有驾驶、coaster 与 IBD 音频测试一并通过。

音频文件的局部 TypeScript 检查通过：

```sh
node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions --types vite/client --target es2022 --module esnext --moduleResolution bundler --jsx react-jsx --lib es2022,dom --skipLibCheck src/components/world/WorldParkAudio.ts src/components/world/WorldClubAudio.ts src/components/world/walk-music-candidate.ts src/components/world/world-music-focus.ts
```

`git diff --check` 和 `node tools/world/check-club-audio.mjs` 通过。没有完整项目构建；真实浏览器与跨设备播放尚未验证。

## 主线下一步与接口

不需要跨线代码接口。合入后，主线在现有候选预览路由加 `qa=1&audioCandidate=a`／`b`；默认路由无候选音乐、无三声 B 替换。去掉参数并重进即回退。QA snapshot 暴露候选、pending／source 和缓存字节，不新增读数轮询。

请用主线安排的单一浏览器窗口验证：真实 Safari 手势、工坊三事件、暂停／后台 30 秒、Music=0 但 SFX 可用、Club 的实际出声打断和手动 crossfade、离开与卸载。此次只验证了 mock 生命周期，不能代替以上实际播放。

听感待两轮等响 A/B：动机是否疲劳、第三小节撤出是否过空、末句是否自然、三声是否能闭眼区分，耳机与笔记本各听。没有听过这些成品，没有记录用户认可，也没有默认启用或替换 Club。新的长曲、成熟乐器音色、coaster／车辆声质及全场相对响度仍未完成，本次交付不将“音频目标”标为完成。
