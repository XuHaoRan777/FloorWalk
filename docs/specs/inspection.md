# 巡检主链

代码（归档时再生成）：`packages/shared/src/contract/`；API 认证、接口与数据访问在 `apps/api/src/auth.ts`、`apps/api/src/inspection.controller.ts`、`apps/api/src/db/`；数据库迁移在 `apps/api/drizzle/`。

## 契约与权限

共享契约以 `packages/shared/src/contract/` 为机器校验形式，覆盖表、枚举、状态迁移、接口 schema、错误码及规则函数。当前 API 实现登录、当前用户和固定/种子数据骨架；提交锁分、审核状态变更、真实照片存储与签名机制仍待后续工作单元。

角色为 `inspector`、`supervisor`、`hq`。店员只能访问本人所属门店且由本人创建的巡检单；主管和总部可读全部；只有主管能审核。JWT 缺少 `JWT_SECRET` 时 API 拒绝启动，token 有效期为一小时，受保护请求从数据库读取当前角色与门店绑定。

## 巡检规则

状态迁移为 `draft → submitted → in_review → passed | rework | failed`；`rework → submitted`。`passed` 和 `failed` 是终态。

提交要求所有检查项均非 `pending`，必拍项至少有一张照片。分数为合格项数除以总项数乘 100，四舍五入取整，并在提交时锁定；重新提交重新计算。存在 `critical` 项不合格时不能通过。看板按每家门店最近一张 `passed` 或 `failed` 巡检单显示分数。

统一错误格式为 `{code, message}`：401 `UNAUTHENTICATED`；403 `FORBIDDEN`；409 `INVALID_STATE`；422 `INCOMPLETE`；422 `CRITICAL_FAILED`。

## 接口

除 `POST /api/auth/login` 外，接口需携带 `Authorization: Bearer <token>`。

| 方法与路径 | 说明 |
| --- | --- |
| `POST /api/auth/login` | 邮箱密码登录，返回 token 与用户 |
| `GET /api/me` | 当前用户 |
| `GET /api/inspector/today` | 本店模板、今日提交标记及本店所有打回单 |
| `POST /api/inspections` | 新建草稿 |
| `GET /api/inspections/:id` | 巡检单详情、检查项与照片列表 |
| `PATCH /api/inspections/:id/items/:itemId` | 更新检查项 |
| `POST /api/inspections/:id/items/:itemId/evidence` | 上传照片 |
| `GET /api/evidence/:id` | 获取一小时有效的照片链接 |
| `POST /api/inspections/:id/submit` | 提交巡检单 |
| `GET /api/review/queue` | 审核队列 |
| `POST /api/inspections/:id/review` | 开始审核、通过、打回或判不合格 |
| `GET /api/dashboard/sites` | 各店最近巡检分数 |

骨架中的非登录接口按契约 schema 返回固定或种子数据，不代表业务写入与照片签名已经实现。

## 数据结构

schema 为 `floorwalk`，主键均为 uuid，时间均为 timestamptz，所有表有 `created_at`。

| 表 | 字段 |
| --- | --- |
| `sites` | `code`（唯一）、`name` |
| `users` | `email`（唯一）、`password_hash`（argon2）、`display_name`、`role`、`site_id`（仅店员必填） |
| `templates` | `name` |
| `template_items` | `template_id`、`position`、`title`、`photo_required`、`critical` |
| `inspections` | `site_id`、`template_id`、`inspector_id`、`status`、`score`、`submitted_at`、`decided_at` |
| `inspection_items` | `inspection_id`、`position`、复制的 `title`、`photo_required`、`critical`、`result`、`note` |
| `evidence` | `inspection_item_id`、`storage_key`、`mime`、`size` |
| `reviews` | `inspection_id`、`reviewer_id`、`action`、`comment`、`rework_item_ids`（仅打回时有值） |

## 种子数据

Northbean Coffee 有 12 家门店 `NB-001`～`NB-012`，三个公开演示账号（店员、主管、总部）共用演示密码。模板「开店检查」有 8 项，冷柜温度和食品效期必拍，没有严重项。历史单共 20 条左右；每家店有一张通过单，`NB-001` 得 88 分，其余分数、失败单与打回单由种子确定。演示主链目标是新单提交 88、打回补拍后重新提交 100、通过后看板显示 100；业务链 e2e 由后续 FW-003 实现后转绿。

## 修订记录

| 日期 | 用户或调用方可观察的变化 |
| --- | --- |
| 2026-10-24 | 建立巡检主链契约、Northbean 种子、登录与角色校验，以及供各端开发使用的 API 骨架。 |
