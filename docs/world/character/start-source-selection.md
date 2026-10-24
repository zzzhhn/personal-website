# 真实起步片段来源核对

## 当前缺口

发布版的 Walk、Run 是从已在移动的 CMU take 提取的循环。35_01 和 09_01 的开头半秒根平面速度中位数分别约 1.206、3.628 m/s，不能重命名成静止起步。当前完整同向起步仍有 181.9 mm 滑移；Run-only 的 6.4 mm 不覆盖这个失败窗口。过渡分类修复见 `motion-transition-v2.md`，未将起步判过。

## 已执行的来源扫描

工具：`tools/world/guide/mocap/scan_starts.py`。输入为缓存的四个 100STYLE Neutral BVH，原始数据不入库；输出保存每个文件的 SHA-256 和零基帧范围。

扫描使用 BVH 的 Hips 根 X/Z，按现有 `bvh_motion.py` 的厘米单位换算成米，以前后各 0.1 s 的位移估算速度。候选要求根速低于 0.18 m/s 至少 0.3 s，随后 1.5 s 内达到 0.8 m/s。这个口径仅选择来源，不替代脚接触、重定向、A3、A6 或视觉验收。

四文件共找到 10 个候选。例如 `Neutral_FR.bvh` 零基 235–292 帧根速持续低于阈值约 0.967 s，293 帧起进入移动，随后 1.5 s 内峰值 1.495 m/s。`Neutral_ID.bvh` 1719 帧后、`Neutral_TR1.bvh` 6915 帧后也有实际起步。文件名不决定片段适用性。

完整原始测量：`/Users/bobby/Desktop/3D-personal-world/evidence/motion-followup/start-source-scan.json`。

## 下一步与门

先用 FK 和正常速度预览确认候选确为向前起步及支撑脚时序，再选一个片段重定向。新 StartRun 的接触曲线在制作前按实际源事件固定；不修改旧片段曲线、阈值或已有网格。运行时取时须匹配实际身体行程与源根位移，避免直接把慢速起步叠在快速物理加速上。

制作后检查新片段的原生与 fresh Draco、完整原起步窗口，以及惯性化和已批准 IK 之后的最终 A6。当前没有新的 StartRun 已通过，也未改变发布版 G24。
