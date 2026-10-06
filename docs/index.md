# FloorWalk 文档入口

给人看的目录。Agent 的阅读顺序在 [`../AGENTS.md`](../AGENTS.md) 第 1 节，不读本页。

| 位置 | 时间语义 | 用途 |
| --- | --- | --- |
| [`specs/`](specs/README.md) | 当前事实 | 行为与不变量是权威；数据契约和代码路径归档时再生成 |
| [`backlog.md`](backlog.md) | 当前索引 | 上线能力清单、活动单元、待开缺口、待人工验收 |
| [`testlog.md`](testlog.md) | 修正记录 | 真机测试期间的改动，一行一条；Promote 的输入 |
| [`work/<id>/`](work/README.md) | 快照 | 一次交付的目标、任务、证据、决策；归档后只读 |
| [`context/`](context/) | 长期基线 | [产品](context/product.md)、技术栈、设计系统、[开发环境](context/dev-environment.md) |
| [`adr/`](adr/README.md) | 决策历史 | 为什么这样决定 |
| [`pitfalls.md`](pitfalls.md) | 累积经验 | 已证实仍适用的坑 |
| [`howto/`](howto/README.md) | 操作步骤 | 项目专属、按触发条件读取 |

文档变更后运行 `python scripts/validate_docs.py`，归档前加 `--archive-gate`。历史变更看 `git log` 和各 spec 的修订记录。
