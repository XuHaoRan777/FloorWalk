# 站内通知（后端 + Web 收件箱）

> ID：`FW-036`
>
> 状态：`approved`

## 目标

接力线二第 7 个。实现站内通知后端：事件发布、分发、收件箱、未读数、标记已读；Web 加通知入口和收件箱页。不做远程推送。

## 非目标

- 不做 Mobile 收件箱与角标（FW-037）。
- 不做邮件、短信、远程推送。
- 不做通知的"设置订阅"：事件与接收人按基线写死。

## 验收标准

- AC-01（`用户要求`）：按产品基线「通知」表实现七类事件的发布（原文误写"六类"，2026-11-17 修订；基线与下面清单从未改动）：
  1. 条目被打回（接收人：本店全部店长；来源：AI 或管理员打回）
  2. 整单判定结果（本店店长）
  3. 管理员改判（本店店长）
  4. 严重项不合格（admin）
  5. 任务逾期（admin）
  6. 有待人工审的条目（admin；AI 失败转人工或关闭 AI 模板有新上传）
  7. 聊天有新消息（对方）
- AC-02（`用户要求`）：数据结构：`notifications` 表存 `(user_id, type, payload_json, read_at)`；payload 含跳转所需的最少字段（任务 id、巡检单 id、条目 position、聊天单 id 等）。按商家隔离。
- AC-03（`用户要求`）：接口：`GET /api/me/notifications?after=cursor&unread_only=` 列表（最多 50）；`GET /api/me/notifications/unread-count`；`POST /api/me/notifications/:id/read`、`POST /api/me/notifications/read-all`。
- AC-04（`用户要求`）：Web 顶栏加铃铛和未读角标；面板里列最近 20 条，分已读、未读；点一条跳转对应页面并标已读。
- AC-05（`建议采纳`）：事件发布与业务写入同事务，避免丢事件；没订阅者的事件也不报错。
- AC-06（`建议采纳`）：权限：只读本人通知；跨商家 404。API 测试覆盖：各事件发出后对应用户收到、他人收不到；聊天通知不发给自己。

## 验收方式

`B Agent 验收`

- 改契约、`schema.ts`、迁移，提交带「硬线：」行。

## 涉及的当前事实

- 新增 `specs/notifications.md`：事件、接收人、接口、数据表。
- [`specs/README.md`](../../specs/README.md)「索引」：加一行。
- [`specs/web-console.md`](../../specs/web-console.md)：顶栏通知入口。

## 依赖

- FW-035

## 批准记录

- 批准依据：用户 2026-11-16 原话"批准"（线二 FW-030～FW-038 一起批准）。执行器 Codex 桌面版是用户同日早先原话"继续使用codex桌面版接力"；active 上限 9 与线内提交授权沿用线一，是 AI 在同一轮提出的默认，用户未单独回复
- 批准时间：`2026-11-16`
- 特殊授权：线内本地提交（不推送）；`active-units-max` 临时 9，线二归档后改回 3
- 接力探针：`2026-11-16`：commit-msg 钩子已启用（`core.hooksPath scripts/hooks`，`86bcec2` 起生效，实测缺「硬线：」行会被拒）；执行器为 Codex 桌面版（`create_thread` 默认弹审批，由用户点）；改为用户手动的：本地配置核对（`--env-keys` 报无可检查配置）
