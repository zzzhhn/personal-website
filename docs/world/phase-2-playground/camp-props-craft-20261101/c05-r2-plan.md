# C05 局部表面修正

主协调实际看图后指出：r1火坑石块读成均匀塑料／灰泥，矿物不明显，中心木柴读成光滑多边形杆。r1图片和pack已保存到 `r1-evidence/`，是本轮真实前态，不能当作故意简化的旧模型或用户通过证据。C06几何和C07材质／构造保留。

仅C05换用本地已许可的 Poly Haven Rock Face 03 摄影矿物色、OpenGL法线和ARM粗糙度。原始1K文件来自 `personal-world-bruno/static/bay/assets/coast-natural/pbr/`，摄影Dario Barresi、处理Rico Cilliers，CC0-1.0，来源 `https://polyhaven.com/a/rock_face_03`、许可证 `https://polyhaven.com/license`。本地SOURCES.json的六张石／树皮图散列已逐一验证，无新下载。吧台原limestone实际为程序生成，不能冒充石材照片。

石色按sRGB、白factor直接使用；法线与ARM设Non-Color，法线采用OpenGL方向。只取ARM的线性G作roughness，不把源AO乘入色图。石色保留1K、法线和粗糙度512px，按0.65m纹理tile处理。修正斜向石面原来XY投影导致的垂直拉伸，每面按主法线选择真实平面，石块做受限采样偏移。

炭木使用本地已许可Bark Willow扫描形态，摄影Dario Barresi、处理Dimitrios Savva，CC0-1.0，来源 `https://polyhaven.com/a/bark_willow`。扫描树皮经明度归一化与炭化色派生，不称为炭木扫描；V沿实际柴轴、U沿周长，法线和扫描粗糙度保留裂隙。灰床改为独立原创粉状灰色／细粒法线／高粗糙度，避免灰床和柴使用同一种灰泥材质。

不修改任何顶点、边界、位置、火焰、碰撞或座位，C06／C07的几何、UV、材质、图像与sampler合同由 `verify-c05-r2.mjs` 对照r1包检查。C05只允许材质与UV变化，三角位置按微米级排序比较。

已执行 `python3 tools/world/camp-props-craft/run.py --allow-heavy --c05-refine`。完整导出共享pack，渲染限定C05三图。实际打开fresh后发现灰床周期格纹，改成非周期细颗粒，并使用 `--fresh-only` 只重渲一张受影响的fresh。当前最终图为 `C05-r2-fresh-glb.png`，实际打开确认矿物石面、裂隙炭木和粉灰区别；`C05-r2-clay-fresh-glb.png` 也已打开，几何／相机／灯光未变而复用。第一次native图仅对应灰床格纹修复前，不当作最终材质证据。

`verify-c05-r2.mjs` 已实际通过：C06／C07几何、UV、材质因子、图片原始bytes和sampler全等，C05 1,724三角形位置保持到1微米。基础4项定向测试再次实跑全通过，包括72条坐位接触射线。当前新材质7种、15图片、12批次，GLB 3,313,188 bytes；具体代价如实增加，未声明FPS改善。锁释放、Blender已退出，没有浏览器或全局build。网页日夜响应和用户视觉接受仍待主协调。
