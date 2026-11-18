# 站内通知

代码（归档时再生成）：`packages/shared/src/contract/notifications.ts`、`apps/api/src/controllers/notifications.controller.ts`、`apps/api/src/services/notifications.ts`、`apps/web/src/components/console/notification-inbox.tsx`

## 事件与接收人

通知在业务事务中写入；没有符合条件的收件人时不报错。收件人限定在同一商家：`store_manager` 表示该任务所属门店的全部店长，`admin` 表示该商家的管理员。聊天通知只发给对方，不发给发送者。

| 类型 | 触发 | 接收人 | payload |
| --- | --- | --- | --- |
| `item_rework` | 条目被 AI 或管理员打回 | 本店全部店长 | `taskId`、`inspectionId`、`position`、`reason` |
| `inspection_decided` | 首次整单判定 | 本店店长 | `taskId`、`inspectionId`、`status`、`score` |
| `inspection_overridden` | 管理员改判已有条目 | 本店店长 | `taskId`、`inspectionId`、`position` |
| `critical_item_failed` | 严重项判为不合格 | 商家管理员 | `taskId`、`inspectionId`、`position` |
| `task_overdue` | 巡检任务逾期 | 商家管理员 | `taskId` |
| `manual_review_needed` | AI 失败转人工，或关闭 AI 的模板有新上传 | 商家管理员 | `taskId`、`inspectionId`、`position` |
| `chat_message` | 巡检单聊天收到新消息 | 对方 | `inspectionId` |

## 收件箱与权限

用户只能读取和更新自己的通知；所有查询同时限定商家与用户，跨用户或跨商家通知按 404 处理。列表按 `created_at`、`id` 倒序，最多返回 50 条；`after` 使用上一页游标，`unread_only=true` 仅返回未读。未读数只统计本人通知。单条和全部已读操作均幂等。

Web 管理员在控制台顶栏查看未读角标和最近 20 条通知。选择通知后系统标记已读并导航到对应巡检、条目或聊天位置；店长 Web 端仍显示使用 Mobile 的提示。

Mobile 店长从底部通知入口查看本人收件箱，管理员从管理主页进入通知；两端都显示未读数，应用回到前台时刷新。收件箱按未读和已读分组，支持刷新、分页、跳转和标记已读；店长通知跳转到任务、条目或聊天，管理员通知跳转到任务、审核队列或聊天。

## 接口

API 使用当前 HttpOnly 会话认证：

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/me/notifications?after=&unread_only=` | 读取本人通知，最多 50 条，返回 `notifications` 和 `nextCursor` |
| `GET /api/me/notifications/unread-count` | 读取本人未读总数 |
| `POST /api/me/notifications/:id/read` | 标记一条本人通知已读，成功返回 204 |
| `POST /api/me/notifications/read-all` | 标记本人全部未读通知，成功返回 204 |

## 数据结构

`floorwalk.notifications` 保存 `id`、`org_id`、`user_id`、`type`、`payload_json`、`created_at` 和可空 `read_at`。`type` 由上述七种类型约束；`(org_id,user_id)` 外键关联用户并在用户删除时级联。收件箱索引覆盖 `(org_id,user_id,created_at,id)`，未读索引使用相同键并限定 `read_at IS NULL`。

## 修订记录

| 日期 | 用户或调用方可观察的变化 |
| --- | --- |
| 2026-11-17 | FW-036 增加七类站内通知、本人收件箱 API、管理员 Web 入口及未读角标。 |
| 2026-11-18 | FW-037 增加 Mobile 店长和管理员通知入口、未读角标、分组分页与已读导航。 |
