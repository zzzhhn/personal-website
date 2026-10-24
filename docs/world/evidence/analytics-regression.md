# 事件端点定向检查记录

2026-10-21。整理记录时发现此前摘要将既有事件误写为 `project_card_click`，与源码允许集合不符，因此针对端点补做一次小范围核实。实际输出见 [analytics-regression.json](analytics-regression.json)。

直接调用现有 `functions/api/events.ts` 请求处理器，使用内存 D1 stub，不连接真实数据库，不向生产服务发送事件。

| 输入事件 | 返回码 |
| --- | --- |
| world_enter | 204 |
| world_vehicle_enter | 204 |
| world_booth_open | 204 |
| project_card_open（已有事件） | 204 |
| 未知事件 | 400 |

内存 stub 记录 4 次合法写入。已有请求校验和 SQL 未变，只扩大事件名允许集合。此检查不证明 Cloudflare 预览绑定的 D1 实际写入，远端数据库链路留未验证。
