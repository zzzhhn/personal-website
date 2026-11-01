# 共享输入与木牌接入（2026-10-24）

## 输入

修复 Q 选中目标时 UI 直接调用回调、绕过物理视线检测的问题。现在提示列表、Q／模拟手柄方向键只使用物理控制器已检查可达的候选，E 与 Y 统一由控制器执行。打开卡片、坐下、驾驶时仍优先消费对应状态的一次输入。

现有 `tools/world/ui/interact.mjs` 的 `UI_ONLY=pick` 定向组合实测 12/12，页面错误 0：真实 WASD 走到三个候选前，Q 改变目标，E 打开确切 kind/id 的卡片并关闭；标准手柄轮询模拟的方向键／Y 同样选中并开关；T01 真实墙内外的两个锚点均在距离内，但墙后目标不出现在提示中且 Q/E 不会触发。

手柄部分是 `navigator.getGamepads` 的标准映射输入模拟，不是实物手柄认证。测试夹具和瞬移均记录在报告。首次墙体夹具因 Vite HMR 模块 URL 不同而注册到另一份模块中，修正为 QA API 使用已加载注册表后重验；不把首次无提示计作通过。

证据：`/Users/bobby/Desktop/3D-personal-world/evidence/integ/input-pick-r3/interact.json`。

## F04

建设中牌现在加载 `/assets/world/park/signs.glb` 的 F04 根，与 P05／P19 为同一生成器、同一 GLB 的大／中／小三尺寸。720 三角小款保留木框、嵌板、榫、脚和斜撑；文字运行时生成、不发光。固定碰撞从相同节点及放置矩阵取得，移除旧的独立程序化牌。60 m 外剔除视觉、保留物理，动态实例列表同步阴影代理。

现有 `tools/world/street/impact.mjs` 定向跑人与 van 两例，使用明确的 `street-construction-F04-community` 接触名称，避免把脚下地基误算作撞牌。两例均命中并被挡，人物抬升 0，van 抬升约 5.1 cm；两例页面错误 0。起点为地基内已记录夹具，移动和上车使用真实按键；这不是全物件碰撞矩阵。

证据：`/Users/bobby/Desktop/3D-personal-world/evidence/integ/F04-shared-family-r2/impact.json`。更换后一次 Astro 检查：240 files，0 errors、0 warnings。这份报告不代表最终整岛性能、美术或 Bobby 验收。
