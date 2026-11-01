# 水面升级调研，2026-10-27

## 结论

优先做 Club 泳池的光学升级，再改海面。水的可信度主要来自倒影、折射、水深和光照之间的一致性，以及入水后的反馈。单独购买模型或换一张更大的水纹图不能补齐这些关系。

保持岛屿现有的风格化几何、颜色和人物比例；水可以具有自然的光学行为，不必把整个场景改成写实摄影风格。

本轮完成源码、官方文档和许可证调研，未运行候选演示，未测量它们在完整地图里的性能，未修改运行时代码或更新 4341。调研时本机处于内存警告状态，可用磁盘约 10.1 GiB，因此没有再开 GPU 演示、下载资源包或并行构建。

## 当前实现的具体不足

- `src/components/world/WorldPoolWater.ts`：透明水面让池底可见，但没有折射场景纹理或实际水深吸收；倒影来自解析天空渐变，没有亭顶、棕榈和人物的场景倒影。称为 caustic 的图案叠加在水面颜色上，没有投到池底或水下物体。夜间还有直接加色，因此容易像一层发光的有色薄膜。
- `src/components/world/WorldWater.ts`：已有四组 Gerstner 几何波、细纹法线、岸线泡沫和太阳闪光，并非静止平面。当前 flatShading、规则波组和缺少场景倒影，限制了连续水面的质感。`depthAlpha` 实际依赖水平岸线距离，不是视线穿过水体的厚度；人物附近的透明区域也是辅助可读性的近似。
- `src/components/world/WorldWaterInteraction.ts`：有限容量的解析环形扰动已能回应入水和移动，生命周期成本可控；它不是带池壁边界的持续水波模拟。
- 当前使用 Three.js 0.186.1、R3F 默认 WebGL 渲染器。官方 WebGPU 专用水组件无法直接替换。

## 候选资源与取舍

### 1. Evan Wallace：WebGL Water

- [交互演示](https://madebyevan.com/webgl-water/)，[源码](https://github.com/evanw/webgl-water)。
- 演示包含反射、折射、高度场扰动、阴影及水下焦散。适合对照「水中的物体如何变形、池底光斑如何随波移动」。
- 代码的 MIT 声明已在 [index.html](https://github.com/evanw/webgl-water/blob/master/index.html) 核对。演示贴图另有来源，不能假设所有图片都适用代码许可。
- 这是旧的专用池体演示，使用 LightGL，不是现成 R3F 组件。作者也说明其重点是渲染，水行为并非高度真实的流体模拟。适合作为光学基准及算法参考，不能直接照搬其池形和场景求交。

### 2. Martin Renou：ThreeJS Caustics

- [交互演示](https://martinrenou.github.io/threejs-caustics/)，[源码](https://github.com/martinRenou/threejs-caustics)。
- 专注水下焦散，适合研究让光落在真实池底、岩石和水下表面，而非画在水面上。
- [代码许可](https://github.com/martinRenou/threejs-caustics/blob/master/LICENSE.txt)为 BSD-3-Clause；展示模型另有 CC Attribution 等许可。
- 示例 HTML 使用 Three.js 0.117.0。源码有多张浮点 render target 和额外渲染阶段，需要移植与预算控制；不能当作当前版本可直接安装的插件。

### 3. ScottieFox：CAUSTIC//LITE

- [Lite 演示](https://ScottieFox.github.io/caustic-volume/lite/)，[源码](https://github.com/ScottieFox/caustic-volume)。
- 使用 Three.js r186 / WebGL2，与当前项目技术路径较接近。抽查 Lite 源码确认包含 GPUComputationRenderer 水波、折射计算、按路径长度吸收及独立焦散投射。
- [MIT 许可](https://github.com/ScottieFox/caustic-volume/blob/main/LICENSE)已核对。
- 优先借鉴 Lite 的光学和波纹分层。其光线求交针对玻璃箱、池底和特定物体，仍需改为我们的椭圆泳池与任意角色几何。完整 sandbox 另有体积光、墨水、沙粒等大量功能，本项目不需要整套引入。
- README 的低端设备流畅性属于作者声明，本轮没有实测，不把它当作我们的性能保证。

### 4. David Li：Ocean Wave Simulation

- [交互演示](https://david.li/waves/)，[源码](https://github.com/dli/waves)。
- 抽查 `simulation.js` 确认 GPU Stockham FFT、风驱动波谱、位移及法线生成，可研究比少量规则波更丰富的海浪形态。
- [MIT 许可](https://github.com/dli/waves/blob/master/LICENSE)已核对。
- 这是独立的旧 WebGL 实验，适合研究海浪运动，不是完整岸边交互系统；不能指望换上 FFT 就同时解决倒影、泡沫、浅海和入水问题。

### 5. ABYSSAL：WebGL2 频谱海洋候选

- [交互演示](https://squall01337.github.io/abyssal-ocean/)，[源码与说明](https://github.com/squall01337/abyssal-ocean)。
- 作者说明提供多尺度 FFT 波浪、泡沫、折射、屏幕空间反射和水下状态，使用 Three.js / WebGL2。[MIT 许可](https://github.com/squall01337/abyssal-ocean/blob/main/LICENSE)已核对。
- 本轮核查范围仅 README 与许可，未逐项验证其效果或数值精度。其默认三层 512² FFT、高密度海面和后处理适合列为海洋上限参考，不宜直接移入当前地图。作者也明确说明偏重 GPU。

### 6. Three.js 官方 Water / Water2

- [官方海面演示](https://threejs.org/examples/webgl_shaders_ocean.html)，[Water2 源码，r186](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/objects/Water2.js)。
- Water 提供平面反射；Water2 进一步组合 Reflector、Refractor 和 flow map。已对照本地依赖源码，其默认反射与折射纹理分别为 512 × 512，并在渲染前触发两个组件。
- 它们是适配当前 WebGL 的参考基础，但不自动提供完整水深吸收、焦散或交互模拟。多个水面直接各自使用 Water2 会增加场景渲染负担。
- [官方 WaterMesh](https://threejs.org/docs/pages/WaterMesh.html)是 WebGPU 专用版本。为单项水面效果迁移整个渲染器，当前收益不明确。

## 建议的开发顺序

1. **Club 泳池先做一个可比较样板。** 增加按实际水深变化的透色和折射，让池底台阶、人物浸水部分呈现不同变化；用可控的场景反射显示亭顶和棕榈。将光斑移到池底和池壁，随太阳与水波变化。夜晚由场景灯光和池灯照亮水体，避免整片水自发光。
2. **再补交互连续性。** 保留现有入水事件和暂停机制，评估小范围水波高度场，让步行尾迹和雨滴扰动相互影响。椭圆池边界要明确，不能沿用示例矩形箱边界。矿区投矿石的环波、水花可以复用事件接口。
3. **海面先补光学与岸边关系。** 保留现有 CDLOD 和远处裁剪，改善连续法线、多尺度细纹、天空反射、浅水透底与退浪泡沫。之后若波形仍明显重复，再比较低预算频谱波方案。
4. **按水体区分。** Club 清澈、平缓，适合近看；矿区回测池偏深绿和细小扰动，保证图表可读；外海拥有更宽的波尺度与岸边泡沫。共享基础渲染能力，不共享完全相同的参数。

## 性能及验收约束

以下是设计目标，不是已测结果：

- 同时只对当前重点可见的近处水体启用高成本场景反射。不同高度的海洋与泳池不能简单共用同一平面反射结果；远处使用天空近似。
- 反射从 256–512 像素范围评估，按设备与画质分级。降采样不能免除场景遍历与绘制成本，还需限定反射对象与更新条件，避免多水面递归互相反射。
- 不增加独立的持续计时器或渲染循环。暂停、后台、离开区域时停止波模拟与辅助渲染，并正确释放 render target。
- 高质量焦散先限制到泳池范围；优先验证简单池底投射，不直接引入体积光和多次光线反弹。
- 在相同镜头、画质、分辨率和设备上记录修改前后帧时间、p95、额外 draw calls、render target 数量及内存趋势。可用时读取 GPU 计时；不把独立小演示的 FPS 当作完整世界性能。
- 视觉检查覆盖正午、黄昏、深夜、雨天，岸边斜视与俯视，人物入水、行走、出水，矿石投池、回测图线叠加。特别检查透明排序、岸线穿帮、镜头过水面、回陆恢复和暂停续播。

建议下一次开发先交付 Club 泳池的对照版本，凭实际画面和性能决定是否扩展到全岛。
