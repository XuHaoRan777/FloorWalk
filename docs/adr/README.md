# 架构决策记录

本目录保存已经生效的架构与技术决策。ADR 记录**为什么**，`docs/specs/` 记录**是什么**。

文件名：`NNNN-lowercase-slug.md`。

## 记录格式

```markdown
# NNNN. <决策标题>

- 状态：`proposed|accepted|superseded`
- 日期：`YYYY-MM-DD`
- 来源工作单元：`FW-NNN`
- 取代：`NNNN|-`

## 背景

## 决策

## 后果

## 被否决的方案及原因
```

决策变更采用前向取代：旧 ADR 状态改为 `superseded` 并指向新编号，正文保持历史原文。

当前 ADR：[`0001-new-repo-store-inspection.md`](0001-new-repo-store-inspection.md)。
