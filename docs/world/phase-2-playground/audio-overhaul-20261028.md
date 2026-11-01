# 世界音频重做：源码审计与首个制作规格

2026-10-28。基线 `f384ec2`，并读取主协调正在修改的工坊工作区文件。本轮只写本文，不改运行时代码、不生成音频、不启动浏览器、不操作 4341。工坊调用链是当前未提交工作区事实，合并时须再核对。

## 结论与证据边界

先拆开交互声音的含义，再制作一个克制的岛屿音乐样段。当前多种动作共用同一个提示音，且没有统一的音乐／音效静音入口；这比单纯换两首 Club 曲目更值得先处理。此为源码推断，不能据此声称已经定位用户所有听感问题。

| 状态 | 本轮结果 |
| --- | --- |
| 已确认 | 当前源码调用链、合成方式、生命周期、已有素材与来源记录；旧背景循环无生产调用入口 |
| 待试听 | 用户不满意的具体刺耳频段、各区域实际相对响度、Club 乐句与接缝、驾驶声质感、长时间重复疲劳 |
| 未具备 | 本轮没有已验证、可调用的音乐生成后端或已验收乐器库；规格不等于音频，工具目录也未发现可直接生成音乐／音效的接口 |

读取了 [mc-workflow](https://github.com/jtydhr88/music-composition-skills/blob/main/plugins/music-composition/skills/mc-workflow/SKILL.md)、其 ARR-SPEC 模板与后端档案，并按任务读取 mc-development 的材料／发展、mc-arrangement-arch 的减法／能量、mc-sound-design 的音色四问、mc-mix-intent 的声场／让路章节。该库提供文本规格。其后端档案中的模型、许可和能力声明不能替代本机可用性或供应商当前条款核验。本轮不安装、不购买、不下载模型或大型音色库。拟音、空间衰减与运行时资源管理由下述项目设计负责，不冒称 composition skill 的生成能力。

## 当前真正接入的声音

路径均相对仓库根目录，函数名是定位依据。

| 系统 | 实际调用与声音 | 已有约束／缺口 |
| --- | --- | --- |
| `WorldClubAudio.ts` | `WorldPark → WorldDjcClub` 挂载并 retain；舞池／DJ 互动和 HUD 调用 enable；播放 Backbay Lounge、Disco con Tutti 两个 MP3，统一 118 BPM，循环 64 拍，等功率双 Deck 转场 | 两个有限 buffer，顺序解码，无调度 interval。30 米内满距离系数，30～70 米衰减，约 70 米外停源；暂停、后台、poolInspect、shot、Club 静音时停源并 suspend。无声像定位，仅距离增益。HUD 音量／静音仅管 Club |
| `WorldParkAudio.ts` 短音 | Alpha 装备／探测／交易、敲击与入水调用 `cue`；新增工坊接件／摇铃／完成，以及 coaster 登乘／顶点／上坡也使用它 | scan 是 980 Hz、90 ms 正弦；strike 是 1600 Hz 三角音加高通噪声；splash 是低通噪声。参数只有种类和强度，没有声源坐标。最多 8 个 cue source，pending 只留最新事件且 250 ms 过期；无音乐时不启 25 ms 调度器，短音结束后休眠 |
| 旧 Park 双 Deck 音乐 | 类中仍有 `start`、92 BPM 四小节和弦、鼓／琶音与 crossfade 实现 | 对 `src` 搜索没有 `parkAudio.start/setCrossfade/setMuted` 调用。保留 ownership 和 cue 不等于启动旧曲。文件顶部“全岛音乐／按 E 开始”的注释已过时；不应将这段死入口当作当前噪声来源 |
| `WorldDrivingFeedback.tsx` | `WorldActors` 确实挂载；coupe 驾驶手势创建独立 context，双振荡器发动机与循环噪声轮胎／boost，随速度、负载、侧滑变化 | 无下载／interval；离车、暂停、后台、shot suspend，卸载 close。未接 Club 静音，也未像另两套服务检查 poolInspect 或处理 pagehide/pageshow。这里是生命周期一致性审查项，不能把挂载存在误报成始终在播放 |
| 工坊／coaster | `WorldIntentDevices → WorldIntentWorkshop → operateWorkshop/advanceWorkshop`：接件、铃和成功用 scan，失败用 strike。`CoasterTrain` 每个 lift 秒用 strike，crest 用 scan | 有调用，不是未挂载死代码；无专用铃声、加工声、链条／风／轮轨声。旧 `operateIntent` 路径仍有 cue，后续按实际挂载确认是否可删，不盲目再给旧路径接音 |
| IBD 库存场 | `WorldAttractions → WorldIbdYard → dispatchIbdAction/finishIbdAction` | 这些组件及 ibd 模块未见声音调用。不要写成“已有货场 BGM”；下一步从动作成功提交点加有限音效 |

矿场探测还有独立节奏来源：`WorldAlphaMine.tsx` 中距离不超过 12 米时，按 `.45 + distance * .07` 秒触发同一 scan。该音是功能提示，并非一条背景音乐。不要通过关掉全部 scan 消除重复感，否则会连带删除探测反馈。

当前素材来自 `public/assets/world/club/audio/`，两首 MP3 现已存在。主协调已恢复文件并另行验证 4341 HTTP 200，本轮不重开页面，也不将“补缺文件”列为待办。来源以该目录 `SOURCES.md`、`club-edits.json` 和 `WorldClubHud.tsx` 音乐署名为准：Kevin MacLeod、CC BY 4.0、节选／保调变速／响度与长度处理，不能称为项目原创。此前 QC 记录的解码时长为每首 32.542375 秒；这是既有记录，本轮没有重新解码或试听。保留作者、许可链接、修改说明；不把第三方片段作为新原创曲的素材或训练输入。

## 声音分工与第一轮实现顺序

以下时长、衰减与预算是候选目标，尚未测量或听感验收。先做一条完整的“接件 → 摇铃 → 加工 → 结果”链，再扩大覆盖。

| 场景 | 声音职责与首批事件 | 变化、空间与退出 |
| --- | --- | --- |
| 岛屿漫游 | 一个疏朗、无唱词的 48 秒音乐段；让玩家能听见动作，音乐不负责持续提醒。环境风／水仅在有合适素材后加入 | 一段结束留 30～60 秒安静；前两轮用相同材料作减法变化，不随机重写旋律。接近 Club 可听范围淡出岛屿音乐。夜景先改同一动机的编制，禁止硬切另一首／切换时叠播 |
| Alpha 矿场 | 保留探测节奏语义；探测轻短脉冲，矿石接触分“敲击瞬态＋碎屑”，入水短水花，收集独立柔和确认 | 探测是玩家设备反馈，保持居中；实体敲击／水花用世界坐标，参考 2 米内清晰、18 米外静音。同一材质 3 个变体轮换且不连续重复；敲击跟实际命中序列去重 |
| Intent 工坊 | 接件木质卡扣，摇铃是真正短铃音，加工为有限机械纹理，成功两音回答，失败为低沉短闷音 | 加工只覆盖本次 2.8 秒流程并在取消时停止；成功／失败只在状态提交后响一次。铃和机器参考 2 米内清晰、14 米外静音；先做 3 个事件样音 A/B，别一口气生成 20 个 |
| Coaster | 上坡链条随真实运动／阶段，下降风随速度，轮轨声随车速，入站短制动声；不再用错误 strike 兼作链条 | 乘坐态一套连续声，离座／暂停／退出即停；地面经过者最多一个列车声源，参考 6～45 米衰减。不能用每秒计时器假装速度反馈；顶点不必再 beep，先测试减法留白 |
| IBD 库存场 | 搬箱木接触、放箱短落地、验收纸签／盖章、拒绝低闷音；装卸节奏来自动作 | 在 `finishIbdAction` 的有效 token 成功后触发，取消／重复提交不响。局部 2～16 米，3 个接触变体，不加常驻工业轰鸣或另一首 BGM |
| Club／coupe | Club 是玩家主动参与的音乐主场；驾驶保留加速／侧滑／boost 三种信息 | Club 本轮保留授权曲作基准，新音乐尚未获听感认可前不替换。驾驶先降低无意义持续音、检查手机扬声器可辨认性，不宣称改振荡器就等于真实发动机 |

建议拆成三个可验收批次：① 工坊有限音效与统一静音，② 下列岛屿编曲样段，③ coaster 连续运动声音与矿场／货场变体。每批单独采样，不把 Club、音乐、车辆、环境同时改掉导致无法判断改善来源。

运行时契约：

- 共享用户音量状态，最少 Master／Music／SFX；Club 音量仍是 Deck 局部控制，Master 静音必须覆盖现有三套服务。先共享状态与生命周期，不为此一次重写全部 audio graph。
- 暂停、隐藏、页面退出、shot／poolInspect 统一停调度／停源或 suspend；取消短事件，恢复不补播过期提示；最后 owner 释放关闭 context。菜单昼夜与画质重绘不应唤醒声音或常驻 RAF。
- SFX 入口候选为 `emit(eventId, position, intensity, revision)`。用领域事件名查音色；实体事件带坐标，UI／设备提示居中。以 revision 去重，设置事件冷却和总 source 上限，保留已有 latest-only resume 竞争保护。
- 首批新增解码缓存目标不超过 24 MiB、压缩资源不超过 3 MiB，按需顺序解码；SFX 同时最多 8 个 source。一条 48 秒双声道音乐以 48 kHz float32 解码约 17.6 MiB，以 32 kHz 约 11.7 MiB；真实值必须按 `length * channels * 4` 记录，不能由 MP3 文件大小推断。旧 Club buffers 另计，不假装全站只有这 24 MiB。
- 区域音乐最多一条常驻；过渡最多两条且有截止时间。禁止每帧创建节点、每个物件开 context、实时大混响／分析器／模型；距离更新复用已有位置订阅，增益小幅变化阈值过滤。

## 首个 ARR-SPEC：岛屿漫游短段 v0

这是可交给作曲／离线渲染工序的首版规格，尚未编译为 MIDI 或后端请求，也不是已生成样音。参考对借的是当前实现中可核实的组织方式，不虚构已听过原曲的乐器／律动分析。需试听后再补真实的音色参考。

```yaml
spec_version: "1.0"
meta:
  title: "Island Walk 01"
  style_layer: "none"
  style_layers: []
  fusion_note: ""
  key: "C major"
  mode: "major"
  meter: "4/4"
  tempo: 80
  target_duration: "0:48"
  deliverable: [full_mix, stems]
  upstream: {brief: "世界音乐与音效需重做，先做可听样段", lyrics: {}, picture: {}}
intent:
  one_thing: "为步行探索留下有呼吸的陪伴感。"
  reference_pair:
    - {track: "Backbay Lounge 当前 Club edit", borrow: "仅借当前工程可核实的 64 拍有限素材长度，不借旋律或录音"}
    - {track: "ParkAudio 旧 warm 程序段", borrow: "只借短音与和声留白的分工，移除持续鼓循环；源码参照，当前未播放"}
  listener_situation: "玩家反复探索，注意力主要在场景与操作；低音量耳机及笔记本扬声器。"
  emotional_arc:
    - {section: A, mood: "轻轻进入", value: 2}
    - {section: B, mood: "向前两步", value: 3}
    - {section: C, mood: "停下来听环境", value: 1}
    - {section: D, mood: "认出熟悉动机", value: 3}
    - {section: E, mood: "自然放手", value: 1}
material:
  motif: "两小节：第 1 小节 E4 四分、G4 八分、A4 八分、G4 四分、四分休止；第 2 小节 D4 四分、C4 四分、二分休止。保留上行后回落与末尾空拍。"
  character: "轻短、好奇，句尾让出空间。"
  stated_in: [A]
  development_mode: "加工处理"
form:
  - {id: A, name: Intro, bars: 4, start_bar: 1, harmony: "|Imaj7 |IVmaj7 |Imaj7 |IVmaj7 |", harmony_letters: "|Cmaj7 |Fmaj7 |Cmaj7 |Fmaj7 |", melody_register: "中", development: repeat, energy: 2, events: [mallet_in, pad_in], note: "两小节动机陈述两次，第二次后半留空"}
  - {id: B, name: Instrumental, bars: 4, start_bar: 5, harmony: "|VIm7 |IIm7 |iv |V7 |", harmony_letters: "|Am7 |Dm7 |Fm |G7 |", melody_register: "中", development: vary, energy: 3, events: [bass_in, wood_in], note: "只改第二小节回答音为 D4、B3；第 7 小节用借用 iv，避免 E4 与 Fm 同响"}
  - {id: C, name: Breakdown, bars: 2, start_bar: 9, harmony: "|Imaj7 |Imaj7 |", harmony_letters: "|Cmaj7 |Cmaj7 |", melody_register: "中低", development: fragment, energy: 1, events: [pad_out, bass_out, wood_out], note: "只留 E4、G4 两个短音，其余休止"}
  - {id: D, name: Instrumental, bars: 4, start_bar: 11, harmony: "|Imaj7 |IVmaj7 |IIm7 |V7 |", harmony_letters: "|Cmaj7 |Fmaj7 |Dm7 |G7 |", melody_register: "中", development: recap, energy: 3, events: [pad_in, bass_in], note: "原形再现动机，不加新旋律；wood 不返回"}
  - {id: E, name: Outro, bars: 2, start_bar: 15, harmony: "|Imaj7 |Imaj7 |", harmony_letters: "|Cmaj7 |Cmaj7 |", melody_register: "中低", development: contract, energy: 1, events: [bass_out], note: "只保留 D4、C4 回答，最后一小节无新音，尾音在段内结束"}
arrangement:
  roster:
    - {id: mallet, instrument: "柔软木槌短音，C4-A4，短起音、自然快速衰减、暖而不尖", role: "记忆点", band: "中高", entry: A, exit: end}
    - {id: pad, instrument: "低泛音柔和三角波和声，C3-C4，慢起音、短释音、暗色", role: "和声铺底", band: "中低", entry: A, exit: C, note: "D 返回，E 段内收完，不铺满每拍"}
    - {id: bass, instrument: "带轻微二次谐波的短圆低音，C2-G2，清晰短起音、无超长尾", role: "低频", band: "低频", entry: B, exit: C, note: "D 返回，E 退出；不用只在耳机可听见的纯超低频"}
    - {id: wood, instrument: "低响度干木触点，无金属长尾", role: "律动", band: "中", entry: B, exit: C}
  depth_map: {mallet: "前景", pad: "背景", bass: "中景", wood: "中景"}
  bass_kick_relation: {mode: "互答式", detail: "本曲无底鼓；低音与木触点交替，避免同一拍堆叠"}
  spectrum_budget:
    - {band: "中高", owner: mallet, competitors: [wood], resolution: "木触点避开动机起音，交互音出现时音乐整体让路"}
    - {band: "中低", owner: pad, competitors: [bass], resolution: "低音出现时和声不叠根音低八度"}
  energy_curve: {A: 2, B: 3, C: 1, D: 3, E: 1}
  subtraction_events:
    - {at: {section: C, bar_offset: 0}, what: "撤掉 pad、bass、wood", why: "给环境和玩家动作留出两小节"}
  hooks:
    vocal_hook: {where: "", shape: ""}
    arrangement_hook: {what: "E-G-A-G 后接 D-C，句末两拍休止", first_at: A, recurs_at: [B, D]}
  groove:
    feel: straight
    push_pull:
      - {part: wood, offset_ms: 12, note: "仅木触点稍靠后，段落起点与游戏事件不加随机漂移"}
    fill_policy: {bars: [8], rationale: "唯一一个短木触点回应，之后立即撤掉，不每四小节填满"}
vocal: {}
mix_intent:
  mood: "能忽略但有记忆，交互声音始终比音乐更容易辨认。"
  sound_stage:
    - {id: mallet, pan: -10, depth: "前景"}
    - {id: pad, pan: 0, depth: "背景"}
    - {id: bass, pan: 0, depth: "中景"}
    - {id: wood, pan: 15, depth: "中景"}
  ducking_map:
    - {section: "all", who_yields: "音乐总线", band: "全频", to: "玩家当前交互短音"}
  dynamics: {target_DR_dB: 8, notes: ["C 比 B 明显稀疏，禁止母带自动补响抹掉落差；DR 口径需在测量报告中定义"]}
  width_map: {A: 35, B: 50, C: 15, D: 50, E: 20}
  loudness_target: "候选 -20 LUFS integrated，true peak 不高于 -2 dBTP；进入游戏后再做相对电平验收"
render:
  suno:
    style_prompt: "Instrumental, 80 BPM, C major, soft short wooden mallet motif E G A G then D C with rests. Sparse warm chord bed and short rounded bass. No drums in the two-bar breakdown. Return the motif, remove wood percussion, finish with silence inside a 16-bar phrase. Keep player interaction sounds intelligible."
    exclude: [vocals, risers, continuous_hihats, hard_limiter_pumping]
    knobs: {model: "未选择", weirdness: "", style_influence: ""}
checks:
  self_audit:
    - "1：四项齐；两个参考各有明确借用维度，音色参照待试听补全。"
    - "2-4：起点 1/5/9/11/15，长度 4/4/2/4/2，合计 16；energy key 一致。"
    - "5-8：3 到 1 的下降；C 减法；wood 提前退出；两小节动机为记忆点。"
    - "9-12：B 有 iv/Fm；fill 仅第 8 小节；wood 后移 12 ms；宽度多值。"
    - "13-14：有候选 prompt，无禁用空泛形容词；16*4/80*60=48 秒。"
    - "15-17：器乐无人声，非多风格融合，不适用。"
    - "18-20：有 motif 与 stated_in；每段发展已填，无 new；ASCII 和弦与结构化减法位置。"
  exemptions:
    - "参考对目前是工程结构参照，不是已完成的听觉风格 A/B；不能据此通过最终音色验收。"
    - "曲式为游戏有限短段，不强塞歌曲副歌；bass_kick_relation 中无 kick，借字段说明低频与木触点互答。"
    - "S5 编译与 S6/S7 生成、照做率、盲听均未执行。提示词只是候选输入，不能保证精确拍数和音符。"
messages:
  - {from: music, to: sound, about: "mix_intent", says: "先交一个 full_mix 与同长度分轨，保留 C 段留白，尾音不得跨出 48 秒；不要用增加响度赢 A/B", status: open}
```

制作路径优先级：按本规格离线写出确定音符／节奏 → 用已授权的轻量乐器或明确设计的合成 patch 渲染 → 输出一个 full mix 和等长分轨供试听。若改用文字生成服务，上述 prompt 只表达意图；需要另行测量实际速度、段长和材料发展，不能默认模型精确执行。现有 `club-prepare-audio.py` 是裁切／变速／响度处理脚本，不是作曲器。没有确认可用的渲染器／乐器库时，停在此交接层，不用旧三音 beep 拼接冒充成品。

## 后续验证与交接清单

本轮资源检查：memory pressure 2，swap 9.43 GiB，磁盘余量约 5.06 GiB；仅做文本与源码读取。没有拿重型任务锁或运行浏览器／构建／解码任务，因为本轮没有执行这些工作。未来试听或实现验证前必须重新检查资源与已有实例，取得共享 `bobby-world-phase2-heavy.lock` 的合法持有权；由主协调安排独立候选页面，4341 保持不动。锁冲突不抢占，验证结束释放本任务锁和临时服务。

1. **素材层**：记录来源／作者／许可／处理链／哈希；生成素材另记后端、输入规格、版本与可用权利证据。测时长、峰值、响度和解码内存；这些只能证明文件指标，不能证明好听。
2. **功能层**：静音覆盖三套服务；暂停／后台 30 秒无新增节点／调度 tick；快速恢复、取消、重复 token、离开区域、卸载后无残余源。昼夜／画质菜单保持原有画面效果，不能唤醒持续渲染或声音。
3. **听感层**：固定音量与地点，等响比较旧版／候选；耳机和笔记本扬声器各听。先比工坊三个动作能否不看画面辨别，再比岛屿片段；Club 至少听 3 次接缝、一次手动中断转场；coaster 按阶段听速度变化，驾驶对比油门／滑行／侧滑。记录实际主观意见，不能用无异常日志替代。
4. **成本层**：记录新增压缩字节、实际解码字节、context/source/timer 上限及关闭后状态；同设备同场景短时 A/B，不宣称跨设备性能完成。新素材通过后再扩展其他区域。

交付状态：只完成此审计与候选 ARR-SPEC。运行时接线、音频生成、试听与用户审美认可均未完成；主协调可先按批次 ① 指派独立实现，不必等待整张音乐专辑。
