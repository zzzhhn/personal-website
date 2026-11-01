# 过山车连续上下车交接，2026-10-28

已直接写入共享 integration checkout，未提交。主线的自由镜头、输入处理、attraction-camera.ts 和 coaster-track.ts 保持原样。

## 行为

从车厢左侧六级踏步前按 E 或点击乘坐，角色先走到入口，沿踏步进入侧面开口，转身、坐下、坐稳，列车才开始原有 70 秒回路。回站后依次起身、转向出口、下阶梯、走至离底阶更远的平地，然后恢复物理控制。开始时从当前物理位置捕获角色脚下位置，避免使用低频 store 位置造成起步跳动。

登车、坐立和离车复用现有 Walk、TurnL、SitDown、SitIdle、StandUp；踏步使用现有靴底采样的局部 IK 适配，座面使用实际臀部补丁的 XYZ 接触。没有新增或下载动捕。实际踏步、碰撞体和路线共用 coaster-transition.ts 的 COASTER_BOARDING；车厢左侧有开口，前扶栏移至前方以留出入口空间。

B 或 HUD 退出在上车阶段取消发车并完成下车；行驶中只登记退出请求，完成当前回路后下车。暂停、隐藏标签页和异常帧间隔不推进阶段。返回营地仍是明确的恢复操作。下车终点重新校验安全位置；若被占用，保持原地等待，不另选位置传送。接近激活范围变化不会中断已开始的登乘序列。

## 修改归属

- 新增：attractions/coaster-transition.ts、coaster-transition.test.mjs、WorldGuideAttraction.ts。
- 修改：attraction-ride.ts、intent-state.ts、WorldIntentCoaster.tsx、WorldIntentHud.tsx、coaster-geometry.ts、intent-runtime.test.mjs。
- WorldGuide.tsx：消费显式角色阶段、控制已有动作播放、应用座面与踏步适配。
- WorldActors.tsx：仅新增相关导入、guideStates 吸收角色帧、attractionRide 物理保持与正常释放分支。已有自由镜头和输入代码未改。

## 已执行验证

只跑了一轮，按文件串行：

```sh
node --experimental-transform-types --test --test-concurrency=1 src/components/world/attractions/coaster-transition.test.mjs src/components/world/attractions/intent-runtime.test.mjs src/components/world/attractions/coaster-track.test.mjs src/components/world/guide-seat.test.mjs
```

33 项通过，0 失败，0 跳过，约 10.3 秒。日志：/tmp/coaster-boarding-tests-20261028.log。覆盖阶段顺序、暂停与异常帧间隔、取消发车、行驶中退出请求、恢复所有权、六级踏步的实际模型顶面和碰撞体、车厢开口射线、真实 G24 座面全旋转接触及 IK 骨骼恢复；既有轨道与座位测试也通过。React 接入文件只做了 TypeScript 语法转换诊断，不是全项目类型检查。git diff --check 无错误。

## 主线试玩清单

1. 从左侧踏步前触发登车，侧后方观察从当前位置走到入口、上六阶、穿过开口、转身、落座；确认坐稳前车不动。
2. 在上阶、坐下、行驶中和下阶分别暂停再恢复；切换标签页后恢复，确认动作与列车没有跳时。
3. 登车时按 B，确认不发车并走回平地；行驶时按 B／HUD 退出，确认继续原回路，回站后完成全部离车动作。
4. 检查完整回站后可正常走动、再次登车；若出口被占用应停留等待，清空后恢复。返回营地应解除乘坐控制。
5. 验证三种视角、拖拽、缩放及视角归位；上车与下车期间默认显示外部视角，运行阶段使用所选视角。

尚未进行浏览器、实际 Rapier 运行、手柄操作或视觉验收；没有打开浏览器、viewer、启动服务器、构建、下载、提交或推送。阶梯处脚底误差、转身时脚掌滑动、扶栏／车体人体余量、镜头衔接与下车控制恢复仍须实机确认。数值座面检查不代表上述观感已经通过。
