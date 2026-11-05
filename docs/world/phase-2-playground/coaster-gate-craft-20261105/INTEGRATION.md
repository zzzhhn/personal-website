# 给主协调的串行接线点

本候选未修改旧总装。只替换视觉、原物理与状态不变。新 consumer 已可直接 import；不要对 GLB 应用旧 `WorldIntentSurface`。

```tsx
import WorldCoasterGateCraft from './WorldCoasterGateCraft';

// 旧 IntentGate 中每个 RigidBody 内，保留原 CuboidCollider 和其位置/refs：
<group scale={[-leaf.side, 1, 1]}>
  <WorldCoasterGateCraft part="leaf" />
</group>

// WorldIntentDevices 同 enabled 生命周期内，保持原 IntentGate 的交互注册：
<group position={coasterWorld([0, 0, COASTER_GATE_Z])}>
  <WorldCoasterGateCraft part="static" />
</group>

// 箱内钥匙保留原显隐和 transforms；旧 mesh 换 group：
<group position={[-.2, 1.4, .25]} rotation={[-.25, 0, .25]}>
  <WorldCoasterGateCraft part="key" />
</group>

// 门侧复用同一 root，原位置不变：
<group position={coasterWorld([5.3, 1.65, COASTER_GATE_Z + .5])}>
  <WorldCoasterGateCraft part="key" />
</group>
```

Suspense/fallback 由主决定；不要为 fallback 复制独立新物理或同时画两套外壳。原 gate `useBeforePhysicsStep`、原 `COASTER_GATE_LEAVES`、开角 -1.45、`activateIntentTarget('gate')` 与 `IntentInteraction` 均继续拥有行为。

固定门柱/门楣旧视觉位于 `coaster-geometry.ts → addArchitecture` 的 gate 段，范围从 `for (const x of [-5.8, 5.8])` 到门楣侧端 `finishBox([side * 5.38,...])` 的循环结束。后续 `if (detailed)` 是附楼屋顶/设备楼/梯架，不能顺带移除。

该范围当前还调用 `housing()` 同步 push colliders，直接删整段会改变物理。最小接法是让旧生成段保留物理和 glow，只停止提交该段 steel，或在这段生成前后记录 `steel.parts` 边界，精确 dispose/移除那段旧视觉后再 finish。主按现有总装方式选一种；worker 同步/异步近远档都必须消费同一选择。`WorldIntentSigns` 保持原 atlas mesh，已有门柱 cyan glow 也保留。新门框在 atlas 矩形边外，牌框实物前缘到 local z1.07，文字面仍 z1.03，不需要抬牌面来避重叠。

静态场景只在原 enabled 近场范围挂载会导致 far 档原门头被移除后远景缺席。主需使 `GateStatic` 与结构显示生命周期一致，或在 far 档保留旧门头作为有意的远景模型；这项由正式接入处理，本 standalone consumer 不自行设距离/新轮询。门叶/钥匙继续原 devices 生命周期。

实际检查优先：正午普通距离完整门头与宝箱关系；午夜矿物/涂装/金属是否分离；左右门全开到原角，近柱铰链是否正确连接；箱内钥匙/门侧钥匙复用位置；牌框有实物而原文字未遮；最后比较全场 draw、shadow、triangles、帧间隔。当前仅导出和静态接口通过，没有这些引擎结果。
