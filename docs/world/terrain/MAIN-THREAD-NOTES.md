# 主线程给 terrain 会话的通知

## 2026-10-24 预算更正

共同规则里的三角预算合计算错了（实为 54.9 万，超 50 万硬线）。`/Users/bobby/Desktop/3D-personal-world/SESSION-RULES.md` 第 5 节已改为合计 49.5 万的新分配：

- 地形分块：8 draw call / 8 万三角
- 草与卵石：2 draw call / 4 万三角

这份分配待审阅模型确认，render 会话在集成版本实测后可能再调。
