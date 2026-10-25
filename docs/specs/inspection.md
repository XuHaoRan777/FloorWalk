# 巡检主链

代码（归档时再生成）：`packages/shared/src/contract/`；API 认证、接口与数据访问在 `apps/api/src/auth.ts`、`apps/api/src/inspection.controller.ts`、`apps/api/src/db/`；数据库迁移在 `apps/api/drizzle/`。

## 契约与权限

共享契约以 `packages/shared/src/contract/` 为机器校验形式，覆盖表、枚举、状态迁移、路由与角色、接口 schema、错误码、照片上传约束及规则函数。API 通过 `/api` 前缀提供全部业务接口，路由表是角色检查和 e2e 的共同来源。

角色为 `inspector`、`supervisor`、`hq`。店员只能访问本人所属门店的巡检单，不限创建人；主管和总部可读全部；只有主管能审核。JWT 缺少 `JWT_SECRET` 时 API 拒绝启动，token 有效期为一小时，过期后返回 401 `UNAUTHENTICATED`；受保护请求从数据库读取当前角色与门店绑定。

## 巡检规则

状态迁移为 `draft → submitted → in_review → passed | rework | failed`；`rework → submitted`。`passed` 和 `failed` 是终态。

提交要求所有检查项均非 `pending`，必拍项至少有一张照片。分数为合格项数除以总项数乘 100，四舍五入取整，并在提交时锁定；重新提交重新计算。存在 `critical` 项不合格时不能通过。看板按每家门店 `decided_at` 最大的 `passed` 或 `failed` 巡检单显示分数。照片上传字段为 `file`，只接受 `image/jpeg`、`image/png`，单张不超过 10 MB；照片链接使用 API 当前访问地址拼接。

统一错误格式为 `{code, message}`：401 `UNAUTHENTICATED`；403 `FORBIDDEN`；409 `INVALID_STATE`；422 `INCOMPLETE`；422 `CRITICAL_FAILED`；400 `VALIDATION_FAILED`；404 `NOT_FOUND`。浏览器来源由 `CORS_ORIGINS` 控制，未配置时允许本机开发与三个 e2e 槽位端口。

## 接口

除 `POST /api/auth/login` 外，接口需携带 `Authorization: Bearer <token>`。

| 方法与路径                                         | 说明                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/auth/login`                             | 邮箱密码登录，返回 token 与用户                                              |
| `GET /api/me`                                      | 当前用户                                                                     |
| `GET /api/inspector/today`                         | 本店门店、模板、今日提交标记及本店所有打回单                                 |
| `POST /api/inspections`                            | 新建草稿                                                                     |
| `GET /api/inspections/:id`                         | 巡检单详情、门店、检查项、照片列表与审核记录（审核记录按 `createdAt` 升序）  |
| `PATCH /api/inspections/:id/items/:itemId`         | 更新检查项                                                                   |
| `POST /api/inspections/:id/items/:itemId/evidence` | 上传照片                                                                     |
| `GET /api/evidence/:id`                            | 获取照片链接；`url` 对调用方不透明，原样作为图片地址使用，可能带查询参数     |
| `POST /api/inspections/:id/submit`                 | 提交巡检单                                                                   |
| `GET /api/review/queue`                            | 审核队列；每张单含门店、检查项、照片与按 `createdAt` 升序的审核记录          |
| `POST /api/inspections/:id/review`                 | 开始审核、通过、打回或判不合格                                               |
| `GET /api/dashboard/sites`                         | 各店按 `decided_at` 最近的巡检分数                                           |
| `GET /storage/*key`                                | 按 `storageKey` 从 `STORAGE_DIR` 读取照片；拒绝任何越出 `STORAGE_DIR` 的路径 |

`GET /api/inspector/today` 的“今天”按 `Asia/Shanghai` 时区的日历日计算。提交会校验检查项和必拍照片、锁定分数；审核动作推进状态并保存审核记录。照片上传写入 `STORAGE_DIR`，证据链接签名有效一小时，照片文件路由校验签名后按存储键读取文件。

## 数据结构

schema 为 `floorwalk`，主键均为 uuid，时间均为 timestamptz，所有表有 `created_at`。

| 表                 | 字段                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `sites`            | `code`（唯一）、`name`                                                                      |
| `users`            | `email`（唯一）、`password_hash`（argon2）、`display_name`、`role`、`site_id`（仅店员必填） |
| `templates`        | `name`（唯一）                                                                              |
| `template_items`   | `template_id`、`position`、`title`、`photo_required`、`critical`                            |
| `inspections`      | `site_id`、`template_id`、`inspector_id`、`status`、`score`、`submitted_at`、`decided_at`   |
| `inspection_items` | `inspection_id`、`position`、复制的 `title`、`photo_required`、`critical`、`result`、`note` |
| `evidence`         | `inspection_item_id`、`storage_key`、`mime`、`size`                                         |
| `reviews`          | `inspection_id`、`reviewer_id`、`action`、`comment`、`rework_item_ids`（仅打回时有值）      |

`templates.name` 唯一；另有索引 `inspections(site_id, status)`、`inspections(created_at)`、`evidence(inspection_item_id)`。角色/状态/结果与照片大小等数据库 CHECK 约束，以及表间完整约束，以共享契约中的 `databaseConstraints` 和现有迁移为准。

## 种子数据

Northbean Coffee 有 12 家门店 `NB-001`～`NB-012`，每家店一个店员账号，另有主管和总部账号，共享演示密码。模板「开店检查」有 8 项，冷柜温度和食品效期必拍，没有严重项。每家店有一张基线已判定单，`NB-001` 为 `passed`、88 分；其余基线通过，只有 `NB-012` 基线不合格。种子共 18 张巡检单；`NB-001` 没有额外巡检单，其他门店合计有 2 张额外 `failed`、2 张 `rework`、2 张 `submitted`。看板基线为 `NB-001` 显示 88，其他门店多数显示通过，只有 1～2 家显示不合格。所有非草稿单的分数等于该单合格检查项数除以检查项总数乘 100 后四舍五入取整。非草稿单的必拍项有浏览器可显示的 JPEG 占位照片；照片写入种子实际使用的存储目录。种子写入前清理自己的 `seed/` 子目录；e2e 槽位重置先清空并创建槽位存储目录，再灌入种子。`rework` 有打回记录，`passed`/`failed` 有审核记录；所有历史时间按单独时间点写入。演示主链目标是新单提交 88、打回补拍后重新提交 100、通过后看板显示 100。

## 修订记录

| 日期       | 用户或调用方可观察的变化                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-24 | 建立巡检主链契约、Northbean 种子、登录与角色校验，以及供各端开发使用的 API 骨架。                                                                             |
| 2026-10-24 | 用户确认演示账号 JWT 有效期为一小时；过期 token 需要重新登录。                                                                                                |
| 2026-10-24 | FW-003 修订 `/api` 路由、角色访问、错误格式、照片约束、CORS、种子不变量和按 `decided_at` 的看板规则。                                                         |
| 2026-10-24 | 调整 Northbean 种子总量与看板分布，要求分数从检查项实算，并将有效 JPEG 写入实际种子存储目录（含 e2e 槽位）。                                                  |
| 2026-10-24 | 巡检详情、审核队列和店员今日响应补充门店与审核记录；照片 URL 改为调用方不透明并新增受 `STORAGE_DIR` 边界保护的照片文件路由；今日按 Asia/Shanghai 日历日计算。 |
| 2026-10-25 | 提交锁定分数，审核状态迁移与门店看板使用真实业务数据；照片上传和签名链接可用。                                                                                |
| 2026-10-25 | FW-004 完成提交、审核、照片证据与看板业务规则，演示链 API 闭环通过。                                                                                          |
