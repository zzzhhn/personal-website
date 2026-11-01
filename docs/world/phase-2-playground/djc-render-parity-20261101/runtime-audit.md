# DJC 日床网页材质差异审计

日期：2026-11-01。任务给定分支 `codex/djc-daybed-craft`、HEAD `a66770e`；以下检查来自当前本地源码、GLB JSON、已有截图和已有运行快照。本次只新增此报告，没有改实现、运行浏览器、构建或渲染。

**首要根因已确认：私有环境贴图的天地和主亮斑上下颠倒。** 当前较大的环境强度把错误的下方补光一起放大，能解释枕头底边和床垫下侧发亮、上侧偏暗的反常塑形。不能继续把所有差异归结为亮度不足。

## 1．环境方向：源码与数值证据

证据链：

| 本地文件 | 实际行为 |
| --- | --- |
| `src/components/world/WorldDjcFurnitureEnvironment.ts:10` | `y > height/2` 填成 ground；亮斑中心在 `(u,v)≈(.32,.30)`。 |
| `node_modules/three/src/textures/DataTexture.js:71` | `DataTexture.flipY = false`。本项目没有覆盖。 |
| `node_modules/three/src/renderers/shaders/ShaderChunk/common.glsl.js:91` | `v = asin(dir.y)/PI + .5`，所以朝上 `+Y → v=1`，朝下 `-Y → v=0`。 |
| `node_modules/three/src/extras/PMREMGenerator.js:985` | 直接 `equirectUv(normalize(vOutputDirection))` 后 `texture2D(envMap,uv)`，没有额外翻转。 |
| `node_modules/three/src/renderers/shaders/ShaderChunk/envmap_physical_pars_fragment.glsl.js:4` | 将 world normal 送入 PMREM；`getIBLIrradiance` 返回 `PI * envMapColor * envMapIntensity`。这张图既影响间接高光，也影响间接漫反射。 |

因此 `+Y` 实际采最后一行，得到 ground 线性 RGB 约 `[.16,.145,.11]`；`-Y` 采第一行，得到本应来自天空的 `[.38,.53,.74]`。亮斑的真实高度角是 `(.30-.5)*180 = -36°`，位于地平线下面。

对当前 `256×128` 输入生成公式做逐像素 CPU 球面积分，按像素中心方向积分 `L(direction) * max(dot(normal,direction),0) * dΩ / PI`，得到：

| 法线 | 余弦加权平均输入 radiance，线性 RGB |
| --- | --- |
| 朝上 `(0,1,0)` | `[0.160357, 0.145398, 0.110448]` |
| 朝下 `(0,-1,0)` | `[0.610712, 0.705171, 0.824474]` |

按 Rec.709 线性亮度计算，下方输入约为上方的 **4.75 倍**。这是输入图的物理积分诊断，不冒充 GPU PMREM 像素读回；PMREM 的有限采样会改变具体数值，但不会把上下错误变成正确。

已有图 `../djc-daybed-runtime-20261101/perf-delivered-4341.jpg` 可见中间枕头底部比顶部亮、床垫下侧和木桌前下沿亮；`perf-final-close-midnight.jpg` 保留同一方向。与源码证据一致。此前只把日床环境从 `.35/.105` 提高到 `1.5/.5`，保留了该方向错误。

环境亮斑和世界太阳还不共向。当前亮斑方位角 `-64.8°`，高度角 `-36°`；世界太阳 `SUN_OFFSET=(-90,40,65)`，归一化方向 `[-.762684,.338971,.550828]`，方位角 `144.16°`，高度角 `19.81°`，对应 equirect UV `[.90045,.61008]`。仅翻转天地能修复倒置，仍不等于复现真实世界主光方向。

## 2．导入材质：未发现颜色空间或全局材质覆盖错误

实际安装版本为 `three 0.186.1`、`@react-three/fiber 9.8.2`，不是据旧文档猜测。公共资产 `public/assets/world/club/daybed/daybed-v1.glb` 包含 8 个材质、8 个嵌入图像、1 套 `TEXCOORD_0`，没有扩展和 `occlusionTexture`。

| 材质 | GLB 的实际 PBR 数据 |
| --- | --- |
| 木材 | base factor 默认白色，照片颜色贴图；roughness factor `0.64`；normal scale `0.30`；metalness `0`。 |
| 石材 | base color、roughness、normal 图；roughness factor 默认 `1`；normal scale `0.65`；metalness `0`。 |
| 四种织物 | 各自 linear baseColorFactor，保留不同青绿色；共享纤维颜色、roughness、normal 图；roughness factor 默认 `1`，图像内容由作者脚本生成在 `.84～.99`；normal scale `0.75`；metalness `0`。 |
| 金属／灯芯 | 金属 roughness `0.48`、metalness `0.60`；灯芯为不透明材质，保留 GLB emissiveFactor。 |

`GLTFLoader.js:3622` 将 baseColorFactor 按 **LinearSRGB** 读取；`:3636` 把 base color 图标记为 **SRGB**；`:3643` 把 metallicRoughness 图分给 roughnessMap 和 metalnessMap，不附加 SRGB 转换；`:3691` 之后保留 normal map 和 scale。normal/roughness 的默认 NoColorSpace 符合用途。`roughnessmap_fragment.glsl.js:9` 从 G 通道读取并乘 factor。不存在把织物的 `.93` 再额外乘一次的运行时覆盖。

`djc-daybed-visual.ts:42` 是原材质 `clone()`，保留颜色、normalScale、roughness、metalness 和贴图变换；仅赋予私有 envMap、昼夜 envMapIntensity、拥有的各向异性采样克隆。采样最高 `4×` 并受 renderer 能力限制，克隆保留同一个 `Texture.source/image`。四种布色没有因此复制四套图像。

`WorldDjcClubVisual.tsx` 的 `vertexColors` 材质只服务程序化批次和 fallback；日床 GLB 以独立 `WorldDjcClubDaybeds` 子组件渲染，没有接入那套统一材质。`WorldAssetDecoder.ts` 只设置 Draco decoder，不改材质。检查的日床、场景和影子路径没有发现将所有导入材质换成白模或改成 unlit 的行为。

## 3．世界主光没有消失，但不能等同于 Blender 灯棚

`WorldEnvironment.tsx:403` 随时间更新真实主光和半球光；晴天 noon 是 key `3.8`、fill `1.9`，night 是 key `.32`、fill `.7`。雨雪还会分别降低主光及填充。日床实例明确 `castShadow=true`、`receiveShadow=true`。

容易误判的一点：`WorldShadows.ts:1099` 把 React `DirectionalLight` 控制器设成 `visible=false`、`castShadow=false`，**并非关闭真实太阳**。同一函数 `:1072` 创建 `SunLight`，名为 `world-sun-cascaded`，复制控制器颜色及强度并采用 `SUN_OFFSET`，建立三层级联阴影。`WebGLLights.js:289`、`:566` 的本版本渲染器原生处理 `isSunLight`；方向直接从 light matrix position 得到。可见材质仍参与 Three 标准 direct-light 和 sun-shadow 计算，不需要另造一个太阳。

屏幕上的天空只是 `WorldEnvironment.tsx` 中的自定义 sky sphere，不自动成为 `scene.environment`。未发现此场景设置全局 environment。材质私有 `envMap` 通过 Three 的 `material.envMap || scene.environment` 路径生效，独立于实际天空和太阳；太阳的阴影也不会对整个私有 IBL 做几何遮蔽。

原生 fresh 图不是中性“同光照”基线。`tools/world/djc-daybed-craft/build.py:355` 使用 Cycles、AgX + Medium High Contrast、exposure `0`、world color `(.22,.22,.22)`；`:367` 另放三盏面积灯，能量 `760/550/650 W`，尺寸 `4.2/3.5/3.2 m`，同时存在真实反弹和接触遮蔽。`:418` 导出明确 `export_lights=False`，这些灯不会随 GLB 进入网页。

## 4．色调映射、AO 与采样差异

R3F 默认 `flat=false`、`linear=false`、`legacy=false`，`WorldRuntime.tsx:273` 没有覆盖，因此采用 ACESFilmicToneMapping 和 sRGB 输出，ColorManagement 开启；Three exposure 默认 `1.0`，检查路径没有改 exposure。已有真实快照 `../djc-daybed-runtime-20261101/perf-daybed-final-d1-snapshot-4.json` 的 `renderInfo` 确认 `toneMapping=4`、`outputColorSpace="srgb"`、`shadowType=1`、`postprocessing=[]`。本地 constants 证明 `4=ACESFilmicToneMapping`、`1=PCFShadowMap`。exposure 未包含在该快照中，默认值结论来自源码，不冒充实时读回。

AgX 与 ACES 会改变高光压缩、饱和度和中间调，不能只凭两个不同灯棚的截图认定 glTF 颜色丢失，也不应为了单件家具修改全局 tone mapping。

资产没有 AO 图，网页没有 SSAO/GTAO pass。Cycles 中靠枕接触、缝隙和桌面下方的间接遮蔽不能由 normal map 单独替代。当前完全不受局部遮蔽的环境填充会削弱这些体积关系，尤其方向颠倒后更明显。源 roughness 很高也是布料高光较宽的正常原因，不是 loader 丢掉 roughness 的证据。

纤维周期约 `0.75m/384≈1.95mm`。原生 close 是 `1.95m` 的正交取景尺度，网页是 fov `50°` 的不同透视机位和显示尺寸；毫米纤维在网页中更容易成为亚像素。4× 各向异性改善斜视 minification，无法恢复已经低于像素的纤维。应先配准机位／屏幕占比再判断纹理损失，不应以过大 normalScale、emissive 布料或锐化替代。

## 5．按影响排序的最小修复建议

1. **先修环境行方向，暂停继续加亮。** 在生成数据时显式按 equirect 的正纬度定义天空，例如以像素中心 `v=(y+.5)/height` 判断 `ground=v<.5`、`sky=max(0,2*v-1)`；亮斑移到正高度角。也可先显式反排原有行作为最小证明，避免依赖上传端 flipY 细节。新增纯数值方向检查：`+Y` 是天空、`-Y` 是地面、主亮斑高度角为正、上向输入亮度大于下向。共享 hook 同时被 Bar 使用，需明确先隔离日床正确 profile，或将 Bar 一起做回归，不能悄悄改变已接受的 Bar 外观。
2. **在方向正确后配准灯光，再定强度。** 私有亮斑方向与世界太阳或经批准的家具补光方向一致；日夜仍可只做有限强度插值，不增加每床灯和 PMREM。先用固定相机对照 noon/night，再决定现有 `1.5/.5` 是否偏高。不能把此前为了错误方向而增加的数值当作最终标定。
3. **补回局部接触遮蔽，而非提高镜面或自发光。** 若修方向后靠枕接缝仍浮，优先在继续建模时给家具烘焙温和 AO，经标准 glTF occlusionTexture 输出，仅影响间接光；本资产单套 UV 可复用，但必须核查现有平铺／重叠 UV 对空间 AO 的适用性，必要时独立 AO UV。不要把 AO 画进基础颜色，不引入全局 SSAO 作为本轮默认补丁。
4. **建立一次真正可比较的渲染基线。** 复用同 GLB、机位、占屏比例、已知灯光和一致色调映射，分开比较 albedo、normal、roughness 与最终合成。确认差异后才调整布料或木材 PBR。全局 ACES、曝光、世界太阳、玩家与碰撞无需因日床返工。

## 检查边界

本次资源预检为 memory warning、swap `9.11 GiB`、空闲磁盘 `8.52 GiB`，只查看已有小图并做源码读取、GLB JSON 解析和 `256×128` CPU 数值积分。已查看 delivered noon、final midnight 和既有 native fresh close；没有开启新浏览器、GPU 渲染、构建或现场改灯。数值证明确定了环境输入方向错误，尚未宣称任何修复的运行时图像已通过。
