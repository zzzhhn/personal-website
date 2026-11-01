# 日床资产侧实时质感诊断与AO候选

已完成单一共享2K AO atlas候选，原PBR贴图与参数保持不变。最终资产为 `asset-ao/daybed-ao-v1.glb`，SHA-256：`99a0abd938b967d9654d882b4d35b126fadfdc3cd1f053f513ac9f3a5e11594e`，13,905,392 bytes。已实际打开最终AO-only模型图，靠枕脚、垫边及侧盘周围的遮蔽连续，初版的分片接缝已消失。主线已接手网页A/B；本报告不提前声称网页视觉或性能通过。

## 当前证据

审计起点为HEAD `a66770e`。原 `docs/world/phase-2-playground/djc-daybed-craft-20261101/daybed-v1.glb` 与 `public/assets/world/club/daybed/daybed-v1.glb` 字节完全一致，SHA-256均为 `5cdd0dde5d0418888e06422828d426eac07f7f9b27e0f762ef190aae211395d8`。因此不是部署了另一套低质贴图。8/8材质没有 `occlusionTexture`，8个primitive均只有 `TEXCOORD_0`，没有独立的几何遮蔽数据。

已打开网页实图 `../djc-daybed-runtime-20261101/perf-delivered-4341.jpg`。近床背枕约140–180px宽，估算来自该张图，不是精确相机标定。实际生成代码的织物周期为0.75m纹理尺度内384次，单织线约1.95mm；0.66m宽枕头在此投影下，每织线只有0.41–0.53px，相当于约LOD3.3–3.7。细织线自然会被mipmap滤成平均值，四倍贴图分辨率不会改变这个物理频率。

对真实GLB内嵌纹理先线性化颜色，再做BOX mip统计，得到：

| mip尺寸 | 颜色标准差 | 保留比例 | 粗糙度标准差 | 保留比例 |
| --- | --- | --- | --- | --- |
| 2048 | 0.06797 | 100% | 0.04041 | 100% |
| 512 | 0.02388 | 35.1% | 0.01415 | 35.0% |
| 256 | 0.01712 | 25.2% | 0.01005 | 24.9% |
| 128 | 约1.8e-7 | 近0 | 约1.2e-7 | 近0 |

这是一项可复现的CPU滤波诊断，不冒充GPU实际LOD测量。结果支持“微织造在网页视距被平均”，不支持把织纹放大或提高normalScale。本轮依主线要求没有修改织物频率、baseColor、roughness或normal图。

当前安装的Three源码中，`GLTFLoader`把 `occlusionTexture` 接到 `aoMap`，把 `texCoord:1` 对应到 `uv1`。`aomap_fragment.glsl.js`明确将AO作用于 `indirectDiffuse`，并对标准材质间接高光做遮蔽；不会把方向灯阴影烘死。现网页缺少的枕脚接触遮蔽，适合用这个标准通道补足。主线另行修正私有IBL天地方向和太阳亮斑，二者作用不同，最终仍需同机位网页对照。

## 本轮修复方式

仅用实际原GLB的几何在离线副本中制作UV1。所有部件临时合在同一个遮挡体中，Cycles使用Ambient Occlusion节点：半径0.20m、仅本物件局部几何、8 AO samples、Cycles8 samples、CPU4线程，再通过EMIT烘焙。场景没有棚灯、方向灯、地板或世界辐照参与烘焙，原布色也不参与。烘焙后恢复原材质并按原8材质分开，原文件不改。

AO采用独立的RGB PNG，R通道作为标准glTF遮蔽。GLB层仅追加一个内嵌图像、一个带mipmap的CLAMP采样器、一个纹理，以及8个材质共同引用的 `occlusionTexture {texCoord:1,strength:0.75}`。不将AO乘进baseColor，也不把它复制进每种材质的ORM图。原8张PBR图的编码字节散列和所有材质因子最终逐字段完全一致。唯一往返误差曾是灯芯emissiveFactor约1.6e-9，已在新GLB元数据中恢复为源值，而非用容差标为exact。

关键展开修复：glTF已为法线/UV0拆点，直接在导入网格smart-project会产生大量小岛。初版12px边距令有效UV三角面积仅0.27%，细图块被白色空白texel过滤后出现分片状明暗。即使使用焊接代理，直接把边距交给smart-project仍只有1.89%。最终在临时焊接代理上先 `smart_project(island_margin=0)`，再显式 `pack_islands(margin_method='FRACTION', margin=6/2048)`，按原三角/角点仅转移UV1；目标位置、UV0及法线不焊接、不重算。

没有删掉微小几何或接收面来抬高覆盖率。全部804个几何组件保留，包括638个微小组件，0个原三角未匹配。最终有效UV三角面积为31.67%，并保留6px烘焙扩边和图集外围空白保护。

| 接收面 | 平均密度 |
| --- | --- |
| 主软垫 | 117.3px/m |
| 大靠枕 | 112.0px/m |
| 腰枕 | 112.5px/m |
| 木材 | 117.5px/m |
| 石材 | 114.9px/m |

## 不变量、代价与交付

原生 `.blend`、旧基线GLB、public和src均未由本任务改动。转移UV1前后，目标顶点坐标、UV0逐循环数据、corner normals的字节散列不变。最终导出UV0的逐材质三角角点数值集合最大差为0.0；8张PBR编码图和全部PBR因子exact相同。fresh import保持8批/8材质、113,664三角面；边界与原资产相同，两个200×200mm坐位区域共50条射线最大偏差仍为3.624e-7m。

新增UV1接缝使存储顶点从132,543增至172,808，几何形状和三角面没有增加。包体由9,875,476增至13,905,392 bytes，增加约3.84MiB；AO图由四张床共享一次，不新增绘制批次或屏幕渲染pass。2K RGBA纹理连同mipmap的常见GPU预算约21.3MiB，新增几何属性约数MiB，实际驱动分配和帧耗由主线测量。最终一次完整作业含展开、烘焙、导出、fresh核对和960×720 AO诊断图约15秒，未采样到可靠的内存峰值，不能将预估1–2GiB写成实测值。

文件：

- `asset-ao/daybed-ao-v1.glb`：最终候选，已冻结。
- `asset-ao/daybed-ao-uv1.png`：唯一共享2K几何AO图。
- `asset-ao/daybed-ao-debug.png`：最终GLB重新导入后，以UV1显示实际AO的诊断图。
- `asset-ao/ao-manifest.json`：源/候选散列、图集密度、座位、原PBR签名和不变量。
- `asset-ao/atlas-allocation.json`：有效面积与各材质接收面密度。
- `tools/world/djc-render-parity/audit-evidence.json`：原资产AO/UV库存及真实织物mip统计。

复现脚本为 `tools/world/djc-render-parity/prepare_asset_ao.py`；包装器 `run_ao.py` 在每次Blender作业前执行资源预检、原子独占heavy锁、限制4线程和600秒。轻量UV探针使用 `run_ao.py --uv-probe`，只展开和测量，不烘焙。本轮所有重作业已结束、锁已释放；不再更改最终GLB。
