# 工作单元

一个工作单元 = 一个可验收的交付目标。目录布局：

```text
docs/work/FW-NNN-slug/
  spec.md      # 目标、非目标、验收标准、涉及的当前事实、依赖、批准记录
  plan.md      # 状态、任务表、证据、决策与偏差
  evidence/    # 可选，截图与日志
```

不需要 README。规则见 [`AGENTS.md`](../../AGENTS.md) 第 6 节，模板见 [`_template/`](_template/)。编号取现有最大号加一。

`plan.md` 是快照，只记"做了什么、怎么验证的"。业务事实写进 [`docs/specs/`](../specs/README.md)，不写在这里。`specs/`、`context/`、`adr/`、`pitfalls.md` 不链接工作单元中的文件，无论是否归档（校验器检查）。归档后的单元是历史，新会话只在当前单元「依赖」列出或用户点名时读它。真机测试中的零碎改动不开单元，记 [`docs/testlog.md`](../testlog.md)。
