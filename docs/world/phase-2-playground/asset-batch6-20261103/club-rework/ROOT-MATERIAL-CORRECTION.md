# 主亭与池岸：结构样品后的材质修正

2026-11-03。主控检查候选 `codex/world-djc-pavilion-basin`，用户已授权既定方向内的精修，不新增视觉方向或布局审批。

## 实际发现

结构样品增加了屋下承托与椽条、池体衬壁，但生产材质最初仍是固定 roughness 的 vertexColors 材质。这是可见质量目标的缺口，不是测试缺口。主控要求保留结构，赋予作者两族独有的 surface role/坐标、局部材质适配模块和最小 Visual 绑定/释放所有权。水面算法、家具、植被、全局照明与交互布局不在本轮修改范围。

主控实际查看候选目录下 `club-rework/structure-stage/sample-r2-pavilion-preview-day.jpg` 与 `club-rework/screenshots/material-sample-pavilion-preview-day.jpg`。普通视距中，后者的屋底和竹杆变化明确可见；格纹仍过均匀，作者继续减弱横线并拉长沿坡纤维。样品记录阴影仍 pending，属于方向反馈，不能作为最终稳定同机位验收。

## 共享适配修正

性能报告指出 `finishes.stone` 已用于实际池体网格，而焦散仍绑定旧 `materials.stone`。旧实例没有被删除不代表原效果仍在显示。作者 `2f1b292` 将水下接收材质指向实际绘制实例。

主控 `5983700` 改动 `WorldClubWaterCapture.ts`：

- 焦散 hook 的程序缓存身份组合原材质 key，解绑时恢复原 hook/key。
- 以 WeakMap 登记明确仅改表面、不改变顶点位置的 hook，保留水线之上的静态剔除。登记绑定具体 hook 身份；未知材质、克隆、换 hook 后未重新登记者仍保守处理；原蒙皮、实例、morph 和 ShaderMaterial 限制不放宽。
- 不新增计时器、贴图、光源或捕获 pass。

命令 `node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-water-optics.test.mjs src/components/world/club-water-budget.test.mjs` 通过 21/21。新增检查覆盖不同原材质程序不混用、双 hook 组合与清理，以及登记/未登记/克隆/替换 hook 在实际捕获层选择中的区别。它们不证明 GPU 编译、美观或帧率。

## 交付条件与当前边界

设施作者将主控补丁与仅三批的明确登记纳入最后候选。还需稳定昼夜图、池底焦散共存、慢转格纹检查及同条件水 capture 提交差分。资源检查约 20.8 GiB 空闲，重活继续串行。4341 读取正常且 HTML 与 `c4d998f` 收据一致；此修正尚未更新试玩服务。

这次发现已补入本机 `blender-material-craft/references/review-and-runtime.md` 的 late-bound effects 条目，避免只检查首个材质适配、漏掉后续附着效果。

## 最终图初审后的限定返修

作者接入共享补丁及纯表面登记，生产候选为 `2855fbb`。主控已实际看过 `pavilion-candidate-day/night.jpg`，屋底与竹杆可辨；记录为 1710×931、DPR 1、FOV 50、曝光 1，12:00/00:00。仍需配对基线和最终整组证据后完成正式验收。

主控也实际查看 `basin-candidate-day.jpg`：前景石材呈规则圆孔，像冲孔防滑板，不接受该表面。作者先自行识别缺陷并回报，主控确认，要求将厘米级规则孔改为适当尺度的稀疏细孔，普通视距自然过滤，主要依靠不均匀矿物变化、板块层次和接缝表达石材。只返修石材及受影响图，不推翻已改善的主亭或扩展到水面/家具。机器此时 memory pressure level 2、空闲约 27 GiB；作者执行一轮有限返修后交回有效证据与未验项。4341 仍未替换。
