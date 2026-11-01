# F04 接入接口：浅木立牌小款

使用同一文件 `/assets/world/park/signs.glb`（P05/P19/F04共用生成器与材质），取根节点 `F04`，其下 `body_F04` 包含木框、哑光奶白板、木榫、脚与斜撑。不要整份GLB全部实例化，否则会把三款叠在一起。

- 原点：底面中心；单位m；glTF +Y向上、正面+Z。宽0.98、深0.58、高约1.1285（精确QA随生成器）；根节点无额外旋转/缩放。
- 奶白板面：宽0.78、高0.46，下沿Y=0.55、中心 `[0, 0.78, 0]`；板厚0.065。
- 正面文字：PlaneGeometry建议宽0.75、高0.43，中心 `[0, 0.78, 0.034]`，正面法线+Z；板前表面Z=0.0325。文字用运行时Canvas跟随语言，无自发光。框比文字面更靠前是有意的嵌板结构。
- 使用 `F04` 根与同一世界矩阵派生固定碰撞（trimesh或按主线程street统一资产规则）；不要沿用旧粗牌碰撞。此处只提供资产，未改street挂载。
- 720 evaluated triangles / 720 Draco readback triangles；原生/回读问题0、总三款2160；可编辑源 `tools/world/park/blend/signs.blend`，生成 `tools/world/park/build_signs.py`。
- 预览原图在仓库外 `evidence/park-integration/signs/F04_34_front.png` 和 `_side.png`；小图见本目录 `runtime/F04-small.jpg`。
