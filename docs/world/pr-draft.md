## 目标

增加 `/world` 可操作城岛灰盒和资产清单 v1，交 Fable 审清单、Bobby 试玩 5 分钟。按冻结顺序保留营地、单侧六楼海岸路、桥与六屋栈道；本 PR 不含正式模型，后续建模仍需签字。

## 基准 SHA

`1f530e15304d5078b7757e720ec8b95473971337`

## 提交 SHA

本文为版本化正文底稿。提交时在远端 PR 正文填入实际 HEAD SHA 和已验证预览链接，避免在 Git 文件内形成自引用提交号。

## 改动

- 独立 Astro `client:only="react"` 页面，延迟加载 R3F/Three/Rapier；移动端提示页不加载 3D。
- 胶囊走跑跳，三辆不同质量/驱动/抓地参数的四射线刚体车，E 上下车，翻车满 2 秒按钮/R、落水回路，固定斜俯视相机、滚轮三档、Esc 地图/暂停、双语及 2 秒两档光照。
- 灰盒使用程序化地形和占位方块，四个动态路障；清理桥头共面重叠，补园区夜间暖光，保留布局。
- 80 项资产制作清单及原图裁切索引，9 项明确待补图；8 个固定机位与两轮 Astra 差异报告。
- 经 Bobby 授权修改五个现站文件：三份依赖清单/锁文件及两个事件允许集合。ecctrl peer 要求 React ≥19.2.7，因此 React/React DOM 从 npm 原锁 19.2.5 最小升至并固定为 19.2.7。pnpm 原锁落后于既有 npm 锁，本次从 npm 锁导入对齐；详见 `docs/world/必要接入改动.md`。

## 验证命令

Node 22.22.2，Playwright 使用本机已有依赖和 Chrome，不下载浏览器。

```sh
node --experimental-strip-types --test src/components/world/actor-physics.test.mjs
node scripts/world/playtest.mjs
node scripts/world/playtest.mjs --recovery-only
node scripts/world/connections.mjs
node scripts/world/connections.mjs --boardwalk-only
node scripts/world/shots.mjs
npm run check
npm run build
node scripts/world/production-probe.mjs
```

- 物理定向 2/2 通过。首次浏览器走跑跳、三车进入/驾驶/退出通过，随后翻车超时暴露 HUD 重渲染回写刚体的问题；修复后只跑恢复相关 12 项，全部通过，未掩盖首次失败。
- 营地坡道、桥至广场实际键盘通行通过。栈道初测从侧面撞栏，修正测试路线由开放端头进入后单段通过；原失败和轨迹均保留。
- check：0 errors、0 warnings、9 条既有文件 hints；build：成功，仅大分块提示。全量各一次。
- 100 Mbps/30 ms 模拟网络、本地生产构建冷 ready 897 ms，首批编码资源 1.22 MB；M5 Pro 1080p 三处各 5 秒约 60 fps。首页/移动端无 WorldRuntime/Rapier/WASM 请求。不得将这组结果称为 M1 Air 认证。
- 8 图最大 102 draw calls / 9,039 三角。三个新分析事件与既有事件在本地 D1 stub 返回 204，未知事件 400。

原始结果在 `docs/world/evidence/`，测试前设置 `WORLD_BROWSER_MODULES` 为本机已有 Playwright 模块目录；生产样本默认 URL 为 `http://127.0.0.1:4322`，其余默认 4321。

## 截图证据

八机位为 overview、camp、camp-night、town、town-night、bridge、park、park-night，文件位于 `docs/world/evidence/`。PR 发布时补为可点击图片链接。

Astra v1 指出条纹、夜间可读性和坡面疑点；v2 关闭原视觉问题，通行另由真实键盘补证。修复前图单独保留在 `evidence/visual-v1/`。这不是第 6 步最终盲审。

## 未验证项

- Fable 审清单、Bobby 亲手试玩 5 分钟及驾驶手感签字；M1 Air 1080p 60 fps；Cloudflare 真实网络加载和远端 D1 写入。
- 30 秒路障复位的浏览器计时、完整三车路线及镜头遮挡的人工体验。脚本不是主观手感验收。
- 正式模型/Mixamo、经过履历与展位交互、上线入口、10 秒移动端预告片均为后续阶段，不在本次灰盒交付中。现站 collection 的履历数量、轮心契约及课程平台数量差异见清单待澄清项。

## 本机复核点

1. 营地走、Shift 跑、Space 单跳，E 上下车，沿坡道驶入海岸路。
2. 换开三辆车过桥，检查惯性/刹车/碰撞，翻车满 2 秒后按钮或 R、落水拉回。
3. 检查固定跟随镜头、滚轮三档和 Esc 内双语、黄昏/夜晚 2 秒过渡。

## 回滚方式

关闭尚未合并的草稿 PR 即可取消本分支；若日后由 Bobby 自行合并，可 revert 合并提交。没有新增服务、数据库迁移或 Cloudflare 配置修改。
