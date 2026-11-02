# G21 独立集成交付

普通候选已由主协调实际看图通过，保留局部IBL1.1。仅交付G21，不含C03 GLB、材质、风动或其候选路径，也不扩大G22/G23。完整制作／审阅归档为本线 `503f17e`；独立集成提交 `8e9185c` 的精确parent是主线 `c4f7fca427cd68294fa5abed344e999713fcf01a`，已由主协调接为 `df45dea`。本次独立候选树从该已集成源建立，未改动主线checkout。精确文件清单见 `G21-OWNED-PATHS.json`。

集成适配仅在 `WorldCamp.tsx`：G21视觉改读 `nature-camp-craft/G21.glb`，原 `camp/G21.glb` 仍独供八处放置矩阵／碰撞。`natureCraft=legacy` 和 `natureCampCraft=legacy` 保留回退。既有 GLTFLoader/本地 Draco 配置不变，无新增loader插件；baseColor/normal/roughness使用UV0，独立几何AO使用UV1。新增只读 `qa=1` 探针 `window.__worldG21Craft`，无候选临时材质模式。

三个材质副本由既有 `collectParts`/`useRegisteredCopies` 管理并dispose；纹理和PMREM仅借用。调用现有 `useDjcFurnitureEnvironment`，沿用既有retain/release与微任务宽限，不改缓存API。已有C09／家具等消费者retain时不新增目标；若G21是首个消费者，则建立该renderer唯一的共享PMREM目标，不能绝对声称新增目标总是0。夜间保持 `1.1 * (1 - 0.8 * night)`，正午1.1、深夜0.22；无新灯、时钟、独立反射通道或自发光。其他已交付资产与C03消费链逐字保留。

`G21-material-r10.json` 记录原生实际保存重开、浮点角点、打包sRGB图像、fresh GLB回读以及16位normalized量化；`G21-geometry-check-r10.json` 证明5962三角、Position/Normal/UV0/UV1有向三角集和node变换仍与已接受R9完全一致。原生AO图保留在UV1节点并独立附到glTF，避免Blender把它与UV0粗糙度合并。原碰撞文件哈希和尺度／退蚀边界见 `G21-INCREMENTAL-COST.json`。

资源代价须保留：620→5962三角／实例，八实例上界增加42736三角；4→3个材质draw／pass；完整G21网络资源301604→1572495字节，共1GLB+4张512²图。几何缓冲仅一份供八实例共享。按每张RGBA8+mipmap估计图像增加1.33MiB，但真实GPU分配与帧耗增量未测，不能据此声称性能通过。实际AO三个Texture UUID同一Source UUID。无碰撞复杂度增加。

轻量验证命令，在主线集成后执行：

```sh
node tools/world/nature-camp-craft/verify_geometry_freeze.mjs --check G21
node tools/world/nature-camp-craft/audit_rock_albedo.mjs
python3 tools/world/facility-craft/verify_build_graph.py /tmp/bobby-world-batch6-g21-integrated-root
git diff --check
```

第三条路径是下次主协调受控正式构建的目标目录，须先沿用主线既有受控public白名单构建，并纳入本次精确五个runtime文件；本交付不替换主线构建配置或4341服务。当前最小G21适配只做语法与补丁可应用核查，尚未执行这份独立集成源的正式构建／实际消费检查，不能将制作线R10构建混称集成验证。

下一集成验收窗只需补一张必要普通夜景，核探针G21加载、全局参数不变、三材质envMapIntensity约0.22、无G21fallback、AO channel1及baseColor sRGB；不立即开启新的近／侧／多因素矩阵。用户最终视觉接受仍独立，C03和其余自然资产不因此完成。不要对已交付R10再运行材料改写器；重建本轮须在隔离树恢复归档R9 `54616a3` 的GLB/native/manifest，再按配方执行一次。
