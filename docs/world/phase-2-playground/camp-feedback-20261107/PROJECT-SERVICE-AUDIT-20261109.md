# 本项目闲置进程核查与地形分配候选，2026-11-09

本轮只获授权关闭本项目已确认闲置的服务，保留其它任务和 4341。核查覆盖进程工作目录、命令行、父子关系、已打开文件、TCP 监听，以及 Chrome 两个现有配置和 Safari 四个现有窗口的标签。没有新开浏览器或 3D 页面。

## 进程核查结果

- 唯一实际运行的网站服务为 4341，PID 20867，根目录仍为 `/tmp/bobby-camp-feedback-playable-20261107`，运行源码仍为 `b495d7f`。抽样 CPU 0%，RSS 约 3.5 MiB，macOS footprint 约 11.4 MiB；保留，HTTP `/world/` 复核为 200。
- 4353、4356 没有监听；没有发现本项目残留的 Blender 渲染、构建、测试采样进程或 3D 浏览器标签。
- 另有 4 个工作目录落在本项目的 Codex 工具进程，父进程为当前 Codex CLI，分别是百度连接器和 3 个 Node REPL。它们不是独立的网站预览服务，不能仅凭 cwd 判为可删除的残留任务。本轮浏览器检查还启动了自身控制子进程；检查完成后已重置本会话 CUA runtime，释放其 JavaScript 状态，没有关闭用户标签。
- 没有向任何 OS 进程发送终止信号，没有删除文件、关闭用户应用、停用共享工具配置或改动其它项目服务。
- 结束检查时的连续 20 个一秒样本均为内存压力 2，换出增量为零。随后预检 swap 为 6.87 GiB、磁盘可用 12.58 GiB。没有证据表明仅清理本项目即可恢复足够资源，因此未启动实际帧耗复测。

## 可先验证的分配修复

性能 session 的只读追踪发现 `WorldTerrainLod.lodIndices()` 已为每块地形生成独占的 `Uint32Array`，但 `TerrainLodChunks.apply()` 又使用 `Uint32BufferAttribute`。本机 Three 0.186.1 的该构造器调用 `new Uint32Array(array)`，会完整再复制一次。该路径发生于首次挂载、铺地声明变化和焦点移动约 6 米时。

候选将交接移入 `applyTerrainLodIndices()`，用基础 `BufferAttribute` 直接持有刚生成的数组。LOD 选择、拼接算法、顶点属性、材质、贴图、碰撞和画质参数均未改。去掉的副本大小为本次索引总数乘 4 字节；没有据此推断 RSS、GPU 驻留或 FPS 收益。

验证命令：

```sh
node --import ./tools/world/alpha-mine-tests/register.mjs --test --test-concurrency=1 src/components/world/terrain-lod-indices.test.mjs
```

2/2 通过。小型地形 tile 夹具覆盖视点与铺地状态转换、与原构造器路径逐项一致、输出数组直接持有、旧输出不被后续更新修改、共享顶点属性不变、缺失地块清空和大于 65535 的索引。测试不生成整岛、不创建 WebGL。完整地形裂缝检查、浏览器昼夜/移动与帧耗对照本轮未执行；此候选不能解释既有 105.5 ms 长帧，尚未通过可提升 4341 的运行时验收。

新版约 8 分 20 秒的 `boardwalk-v3-longform.mp3` 已在统合源码，继续使用原生媒体流式播放。音乐与性能候选仍须在实际试玩验证通过后一起更新 4341；当前预览保持原版本。
