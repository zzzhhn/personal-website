# 本轮 Skill 沉淀

本机 canonical skill：`/Users/a22309/.codex/skills/blender-material-craft/`。本轮沿用 integrate-design 的现有风格与实际呈现验收，再由 material-craft 执行；不是改用新的美术方向。

- `references/coaster-car-benchmark.md`保留车厢主制作与宝箱独立Sol制作的区别、用户认可范围、真实网页合批及性能证据。
- `scripts/examples/coaster_chest.py`是可移植原生案例，需显式传`--output`，不再写死项目路径。Blender 5.1.2、两线程重跑得到97件可编辑源，804,404字节GLB，SHA256为`0e4483bcee6ba2fe63848691c81b24d5fb1091f5415e26272c5cc3c22a2f7382`，与认可源一致。
- `references/review-and-runtime.md`补充全路径接触、父级动画与局部制作坐标的区分。原碰撞保留只证明玩法边界未改，不能证明新装置与它贴合；旧局部坐标本身有错时也不能盲目复刻。
- `skill-creator/scripts/quick_validate.py`通过。案例重跑证明可复现，不代表任意资产都能免质检复现同一质量。

这三位制作方均为gpt-6.1-sol/high。工坊在主会话实际画面审阅后返修了滑台、承座、输出槽和夹持接触；门叶独立投影与站房距离档由性能反馈继续修正。保留这些返修事实，不把统合后的结果全记作独立首稿成功。

这些变更已落在本机Skill，尚未同步到Dots云端。项目证据与原生生产脚本随本分支保存，不依赖阅读旧聊天才能接手。
