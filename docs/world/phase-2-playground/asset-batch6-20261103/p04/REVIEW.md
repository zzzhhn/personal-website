# P04 普通视距对照

候选基于 4ac2360，材质源码提交为 435e92f。代表灯位为 lamp-1-r-0。镜头离灯约 3.9 m，眼高 1.6 m，完整保留基脚、杆身、灯帽及场景尺度。普通日景可见连续轴向木纹，涂层灯罩、套环与木杆分工更清晰。午夜画面保留原透镜与地面暖光池的读法，涂层高光较弱。建议提交主审。

| 场景 | 原版 | 候选 |
| --- | --- | --- |
| 12:00 | [原图](screenshots/baseline-day.jpg) | [原图](screenshots/candidate-day.jpg) |
| 00:00 | [原图](screenshots/baseline-night.jpg) | [原图](screenshots/candidate-night.jpg) |

四份同名 JSON 保存实际相机位置和方向、FOV 50、曝光 1、1710×931 画布、渲染 DPR 1、设备 DPR 2、balanced 画质及模式。两对均有九个有效灯柱代理，指定灯位实际进入近档，三张共享纹理各为 1024×512 且 GPU 版本已就绪，阴影队列为空，稳定检查通过。两种模式的近档发光面均为 48，候选实际读取到 0/1/2 槽。运行 `node tools/world/facility-craft/batch6/p04/verify-review.mjs` 检查截图和收据配对。

正式 Astro 构建完成，用时 21.50 秒。隔离预览资源覆盖漏挂了 `/world/alpha-mine/layout.json`，原版与候选均出现矿区加载 404，另有浏览器请求 `/favicon.ico` 的 404。灯具采集条件在两种模式下均达到，镜头不含矿区。控制台原始错误保存在 `console-errors.json`。构建复现时应从主线静态资源补齐 `public/world/alpha-mine` 并使用本目录对应的本地 QA 配置。

原生归档尝试在 Blender 启动时卡于 macOS 书签读取，导出脚本没有执行。留存实际近档生成数据及部件范围，含 766 个三角形、法线、顶点色、表面槽、UV 和发光数组。原生 .blend 和重新导入验证待后续处理。复现该同源数据可运行 `node tools/world/facility-craft/batch6/p04/export-source.mjs <output.json>`。

近远档模板的顶点属性增量分别为 55,152 B、10,512 B，模板和现有运行时克隆合计约 131,328 B CPU TypedArray。三角形、纹理资源、材质实例及提交的绘制结构沿用原路。没有帧耗测试。4367 自有页已暂停并关闭，服务 PID 59888 退出，wrapper 释放所属 token，4341 原服务 PID 20939 保留。

同一收据中的整场 renderer 计数为日景 295／298 draws、87／87 textures，夜景 296／299 draws、88／88 textures（原版／候选）。这些是采集时刻的整场快照，尚未将三次绘制的差值归因到具体对象。
