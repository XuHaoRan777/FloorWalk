# 巡检主链

代码（归档时再生成）：共享契约 `packages/shared/src/contract/`；API 认证、注册、验证码与找回密码、本人资料、巡检/任务、上传、逐条审核、看板、聊天、通知、门店/模板/AI 标准、日程与记录分别在 `apps/api/src/auth/auth.ts`、`apps/api/src/controllers/auth.controller.ts`、`apps/api/src/controllers/orgs.controller.ts`、`apps/api/src/controllers/verification.controller.ts`、`apps/api/src/controllers/password-recovery.controller.ts`、`apps/api/src/controllers/users.controller.ts`、`apps/api/src/controllers/inspection.controller.ts`、`apps/api/src/controllers/evidence.controller.ts`、`apps/api/src/controllers/task-review.controller.ts`、`apps/api/src/controllers/dashboard.controller.ts`、`apps/api/src/controllers/chat.controller.ts`、`apps/api/src/controllers/notifications.controller.ts`、`apps/api/src/controllers/admin.controller.ts`、`apps/api/src/controllers/templates.controller.ts`、`apps/api/src/controllers/ai-standards.controller.ts`、`apps/api/src/controllers/schedules.controller.ts`、`apps/api/src/controllers/records.controller.ts`、`apps/api/src/queries/inspection-queries.ts`；AI 提示词拼装、模型适配与请求额度管理在 `apps/api/src/ai/prompt.ts`、`apps/api/src/ai/openai.ts`、`apps/api/src/ai/request-budget.ts`；任务排程与日程持久化在 `apps/api/src/services/task-scheduler.ts`、`apps/api/src/services/schedule-persistence.ts`；数据库定义与迁移在 `apps/api/src/db/`、`apps/api/drizzle/`；Web 控制台在 `apps/web/src/pages/console.tsx`、`apps/web/src/components/console/`、`apps/web/src/lib/api/`；Mobile 页面与聊天组件在 `apps/mobile/app/`、`apps/mobile/components/mobile/`、`apps/mobile/lib/api/`。

## 契约与权限

共享契约以 `packages/shared/src/contract/` 为机器校验形式，覆盖表、枚举、状态迁移、路由与角色、接口 schema、错误码、照片上传约束及规则函数。API 通过 `/api` 前缀提供全部业务接口，路由表是角色检查和 e2e 的共同来源。

角色为 `store_manager`、`admin`；每个商家只有一个 admin，store manager 必须绑定一家门店。所有业务数据按 `org_id` 隔离；跨商家资源按不可见处理，返回 404。店长可访问本人当前门店的任务和巡检，以及本人参与过的调店前历史巡检；任务详情和逐条上传只允许访问当前绑定门店。商家管理员可访问本商家全部门店。任务审核队列和逐条判定只允许商家管理员。聊天消息对有权访问巡检单的店长和商家管理员可读；本店店长可发送，商家管理员只读。记录列表仅本店店长可访问，并额外包含本人参与过的历史记录。门店、账号、模板、AI 标准与日程管理路由只允许商家管理员。登录名当前作为通用文本接受，不强制手机号或邮箱格式；同一登录名与密码匹配多个商家的启用账号时先返回商家候选，不建立会话，客户端选定后再次登录。候选数量耗时差异是用户接受的剩余侧信道，见 [ADR 0004](../adr/0004-cross-org-login-timing.md)。注册商家前须验证邮箱；验证码有效 5 分钟，同邮箱同用途 60 秒内不能重发，连续输错 5 次后作废，验证码只保存哈希。管理员可用邮箱验证码找回密码；不存在管理员的邮箱返回相同成功响应且不发信；店长密码由管理员重置。首次登录须改密码；强制改密期间仅允许读取当前用户、改密和退出。停用账号立即吊销其全部会话，重新启用后可登录。会话闲置超过 7 天失效，每个受保护请求续期。客户端只保存 HttpOnly `fw_session` cookie；服务端会话表只保存会话 ID 的 SHA-256，并记录 `last_seen_at`。受保护请求读取数据库中的当前角色、商家、门店绑定和停用状态。

## 巡检规则

每日任务按商家时区的门店日程生成，重复同步幂等；日程变更会重算当天尚未开始且没有巡检上传的任务，已开始任务保持不变。任务状态为 `not_started`、`in_progress`、`submitted`、`overdue`。一个任务最多关联一张巡检单：首次逐条上传时创建；若到期仍从未上传，系统在自动判定时补建无上传巡检单，`inspector_id` 为空。

店长在任务开始前 1 小时起可以上传。截止后未上传的条目不能补传；已打回的条目可在截止后 1 小时内重传。每次上传包含自评、备注及本次照片；照片整组覆盖旧照片，同一条目以最后一次上传为准，并记录提交店长与服务端时间。照片数为 0 时备注必填；照片数须达到模板最低张数。所有条目首次上传后任务变为 `submitted`；截止未交齐的任务变为 `overdue`。

启用 AI 的模板在上传事务内按条目及上传版本入队，后台异步给出通过、打回或属实不合格；打回与不合格必须附 1～500 字理由。打回不限制次数。失败按 1、2、4 秒退避重试，含首次最多调用 4 次，耗尽后转「待人工」。重传取消旧版本尚未开始的任务，已开始的旧调用也不能覆盖新版本；管理员手工判定后，后台调用不能覆盖其结论。关闭 AI 的模板上传时不创建审核任务，直接显示「待人工」，由管理员逐条判定。管理员任务详情返回当前上传版本的 AI 审核状态及理由。

AI 在应用检查项的业务标准前，先评估照片证据是否足以支持判断：画面须清晰可辨、关键对象完整入镜、光线足以看清相关细节。证据缺失、遮挡、模糊或无法确认时，只能判为打回，并在理由中具体说明缺少或无法辨认的证据。只有证据充足且结果明确，才可按管理员标准与验收要点判为通过或属实不合格；该通用约束不改变管理员填写的业务尺度。

## 本人资料

`GET /api/me` 按当前会话返回本人资料和有效期一小时的头像链接。`PATCH /api/me` 只允许管理员更新本人的昵称，长度为 1～30 字；店长调用返回 403。`POST /api/me/avatar` 仅操作当前用户，接受 JPEG 或 PNG，最大 2 MB；新头像成功保存后替换旧头像并清理旧对象。头像读写不接受指定其他用户的 ID。

管理员逐条判为通过、打回或不合格。未上传条目不能提前判；截止时尚未判定的已上传条目自动判不合格，未上传条目自动判不合格并标记「未完成」。截止后 1 小时仍打回的条目强制判不合格并标记「未完成」。存在打回项时，系统等待它们有结论；无打回项则在截止时判定，最晚截止后 1 小时强制判定。分数为通过条目数除以总条目数乘 100，四舍五入取整。任一严重项不合格，或不合格条目达到总数一半，整单不通过。判定后管理员仍可逐条改判，系统重算分数和整单结论，并记录操作人、时间、原结论和新结论。每条保存首次自评及首次判定，用于计算自检准确率。

AI 结论沿用上述判定时间规则：无打回历史的任务在截止时判定，有打回历史的任务在截止后取得最终结论时判定，最晚截止后 1 小时。首次自评、首次结论及首传店长独立保存，重传与改判不覆盖。自检准确率按任务日期的闭区间筛选，按门店或首传店长聚合；样本为首次自评和首次结论均非空的条目，一致条目数除以样本数为准确率（0～1），首次结论为打回时计入样本但不算一致；无样本时准确率为 `null`。旧记录首传者未知时保留为空，不归到后续重传者。

巡检详情与历史记录为只读；旧整单创建、检查项编辑、整单提交与整单审核接口已删除。看板按每家门店 `decided_at` 最大的 `passed` 或 `failed` 巡检单显示分数。照片上传字段为 `files`，只接受 `image/jpeg`、`image/png`，单张不超过 10 MB；照片链接使用 API 当前访问地址拼接。

统一错误格式为 `{code, message}`：401 `UNAUTHENTICATED`；403 `FORBIDDEN`；409 `INVALID_STATE`；422 `INCOMPLETE`；422 `CRITICAL_FAILED`；400 `VALIDATION_FAILED`；404 `NOT_FOUND`；429 `RATE_LIMITED`。CORS 仅允许配置白名单来源并启用 credentials；带 Origin 的写请求若来源不在白名单返回 403，不带 Origin 的原生与服务端请求不受影响。白名单由 `CORS_ORIGINS` 提供，开发模式补充本机地址。会话 Cookie 设置 `SameSite=Strict`。当前决策见 [ADR 0003](../adr/0003-cors-origin-allowlist.md)，ADR 0002 已被取代。

## 接口

除登录与退出外，接口使用 `fw_session` cookie 认证；不接受 Bearer token。

注册流程先用 `POST /api/auth/registration-code` 获取邮箱验证码，再通过 `POST /api/orgs` 注册商家及首个 admin，并建立登录会话。登录名可在不同商家重复；匹配多个商家时登录流程返回商家选择。管理员找回密码使用 `POST /api/auth/password-recovery-code`、`POST /api/auth/password-recovery/verify`、`POST /api/auth/password-recovery/reset`；店长密码由商家 admin 重置。账号管理与角色范围见[门店与模板管理](admin.md)及[Web 控制台](web-console.md)。

| 方法与路径                                        | 说明                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/auth/session`                          | 登录名与密码登录；多商家同名时先返回候选商家，选择后再次登录                              |
| `DELETE /api/auth/session`                        | 撤销当前会话并清除 cookie；未登录也返回 204                                               |
| `GET /api/me`                                     | 当前用户资料、角色、门店与有效期一小时的头像链接                                          |
| `PATCH /api/me`                                   | 当前 admin 更新本人昵称                                                                  |
| `POST /api/me/avatar`                             | 当前用户上传 JPEG/PNG 头像（≤2 MB）并返回头像存储键                                      |
| `POST /api/auth/registration-code`                | 请求注册邮箱验证码                                                                        |
| `POST /api/orgs`                                  | 验证邮箱后创建商家及首个 admin，并建立会话                                               |
| `POST /api/auth/password-recovery-code`            | 请求管理员找回密码验证码；不泄露邮箱是否对应管理员                                       |
| `POST /api/auth/password-recovery/verify`          | 验证找回验证码并返回可选商家                                                              |
| `POST /api/auth/password-recovery/reset`            | 为选定商家账号设置新密码并吊销其会话                                                      |
| `POST /api/me/password`                           | 当前用户改密                                                                              |
| `GET /api/inspector/today`                        | 本店、商家时区、今日任务与模板、提交标记及打回巡检                                        |
| `GET /api/inspector/tasks/:taskId`                | 只读任务详情与逐项结论、上传人和时间；仅当前绑定门店可读                                  |
| `GET /api/inspections/:id`                        | 巡检单只读详情、门店、检查项、照片列表与历史审核记录                                      |
| `POST /api/tasks/:taskId/items/:position/uploads` | 店长上传一个任务条目；请求含自评、备注及本次照片                                          |
| `GET /api/evidence/:id`                           | 获取照片链接；`url` 对调用方不透明，原样作为图片地址使用，可能带查询参数                  |
| `GET /api/review/tasks`                           | 商家管理员的任务审核队列                                                                  |
| `GET /api/tasks/:taskId/review`                   | 任务、巡检结果、逐条上传人与时间、照片及结论                                              |
| `POST /api/tasks/:taskId/items/:itemId/decision`  | 商家管理员逐条判定或改判；响应更新后的整单分数与结论                                      |
| `GET /api/dashboard/sites`                        | 各店按 `decided_at` 最近的巡检分数                                                        |
| `GET /api/dashboard/period?period=week\|month`    | 商家管理员读取本周或本月的任务、分数与各维度统计                                          |
| `GET /api/stats/self-check`                       | 仅管理员；`scope=site\|manager`、`id`、`from`、`to` 必填，返回样本数、一致数及自检准确率 |
| `GET /storage/*key`                               | 由当前存储驱动按 `storageKey` 返回照片；本地驱动拒绝越出 `STORAGE_DIR` 的路径             |
| `GET /api/inspections/:id/messages`               | 按消息序号读取聊天；`after` 与 `before` 互斥，不带游标读最近消息；默认 50 条，最多 100 条 |
| `POST /api/inspections/:id/messages`              | 发送 1～1000 字文本和/或 jpeg/png 图片，图片最大 10 MB                                    |
| `GET /api/messages/:id/image-url`                 | 获取巡检聊天图片的签名链接                                                                |
| `GET /api/inspector/inspections`                  | 店长读取本店记录及本人参与过的历史；附任务日期、模板名与任务状态，默认 10 条、最多 50 条 |
| `GET /api/admin/sites`                            | 商家管理员读取本商家全部门店，包含停用门店和 `active`                                     |
| `POST /api/admin/sites`                           | 新建门店并持久化：请求 `{ code, name }`，响应 201                                         |
| `PATCH /api/admin/sites/:id`                      | 更新门店并持久化：请求 `{ name?, active? }`，响应 200                                     |
| `GET/POST /api/admin/users`                       | 读取或创建本商家店长账号                                                                  |
| `PATCH /api/admin/users/:id`                      | 调整店长昵称、门店或启用状态                                                              |
| `POST /api/admin/users/:id/password`              | 管理员重置店长密码                                                                        |
| `GET/POST /api/admin/ai-standards`                | 读取或新建本商家 AI 审核标准                                                               |
| `PUT/DELETE /api/admin/ai-standards/:id`          | 更新或删除未被模板引用的标准                                                              |
| `GET /api/admin/templates`                        | 商家管理员读取本商家模板、检查项与 AI 审核配置                                            |
| `POST /api/admin/templates`                       | 新建模板并持久化，响应 201                                                                |
| `POST /api/admin/templates/quick-setup`           | 从预设创建模板与 AI 标准，响应 201                                                        |
| `PUT /api/admin/templates/:id`                    | 更新模板名称、AI 设置并整体替换检查项，响应 200                                           |

聊天、记录和管理路由均已接入实际数据；门店与模板的持久化及停用规则见[门店与模板管理](admin.md)。`GET /api/inspector/today` 按组织时区返回本店、当天任务、模板、打回巡检与提交标记；Mobile 点任务后以 `GET /api/inspector/tasks/:taskId` 按需读取详情。日程方案通过[日程接口](schedules.md#接口)配置；任务创建、上传和自动判定规则见本节「巡检规则」。巡检证据和聊天图片使用 `STORAGE_DRIVER` 选择的存储驱动；对象键按商家分路径，读取链接有效一小时。当前为本地驱动，配置为 OSS 时使用私有 Bucket 和 OSS 签名 GET 链接。

## 数据结构

schema 为 `floorwalk`。主键通常为 uuid；消息序号为 bigint。各实体表通常记录 `created_at`，纯关系和日程明细表不单独记录创建时间。

| 表                          | 字段                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`             | `name`、`timezone`                                                                                                                                                  |
| `email_verifications`       | `email`、`purpose`、`code_hash`、`attempt_count`、`requested_at`、`expires_at`、`verified_at`、`recovery_token_hash`、`consumed_at`                                |
| `sites`                     | `org_id`、`code`（商家内唯一）、`name`、`deactivated_at`（空表示启用）                                                                                              |
| `users`                     | `org_id`、`login_name`（商家内唯一）、`password_hash`（argon2）、`display_name`、`avatar_storage_key`、`role`、`site_id`（店长必填）、`must_change_password`、`disabled_at`、`created_by` |
| `ai_review_standards`       | `org_id`、`name`（商家内唯一）、`prompt`                                                                                                                           |
| `templates`                 | `org_id`、`name`（商家内唯一）、`ai_enabled`、`ai_standard_id`                                                                                                      |
| `template_items`            | `template_id`、`position`（组合唯一）、`title`、`min_photo_count`、`acceptance_criteria`、`critical`                                                                |
| `schedules`                 | `org_id`、`name`（商家内唯一）                                                                                                                                      |
| `schedule_days`             | `org_id`、`schedule_id`、`weekday`（组合主键）、`enabled`                                                                                                          |
| `schedule_tasks`            | `org_id`、`schedule_id`、`weekday`、`position`（组合主键）、`template_id`、`starts_at`、`ends_at`                                                                  |
| `site_schedules`            | `org_id`、`site_id`（组合主键）、`schedule_id`                                                                                                                     |
| `site_schedule_skips`       | `org_id`、`site_id`、`starts_on`、`ends_on`、`note`                                                                                                                |
| `inspection_tasks`          | `org_id`、`site_id`、`template_id`、`task_date`、`position`、`occurrence`、`starts_at`、`due_at`、`status`                                                          |
| `inspections`               | 可空 `task_id`（任务单唯一）、`site_id`、`template_id`、可空 `inspector_id`、`status`、`score`、`submitted_at`、`decided_at`                                        |
| `inspection_items`          | `inspection_id`、`position`、模板快照、`result`、`self_assessment`、`first_self_assessment`、`first_result`、`first_uploaded_by_id`、`uploaded_by_id`、`uploaded_at`、`upload_version`、`ai_reason`、`incomplete`、`note` |
| `ai_review_jobs`            | `inspection_item_id`、`uploaded_at`、`upload_version`、`status`、`conclusion`、`attempt_count`、`available_at`、`created_at` |
| `inspection_participants`   | `inspection_id`、`user_id`（逐条上传参与者）                                                                                                                        |
| `inspection_item_decisions` | `inspection_item_id`、`actor_id`、`previous_result`、`new_result`、`created_at`（逐条判定审计）                                                                     |
| `evidence`                  | `inspection_item_id`、`storage_key`、`mime`、`size`                                                                                                                 |
| `reviews`                   | `inspection_id`、`reviewer_id`、`action`、`comment`、`rework_item_ids`（仅打回时有值）                                                                              |
| `sessions`                  | `token_hash`（唯一）、`user_id`、`created_at`、`last_seen_at`、`expires_at`、`revoked_at`（可空）                                                                   |
| `chat_messages`             | `seq`（自增、唯一）、`inspection_id`、`author_id`、`body`（最多 1000 字）、`storage_key`、`mime`、`size`                                                            |

`chat_messages` 的 `body` 与 `storage_key` 至少一项非空；图片存储键、MIME 与大小同时为空或同时非空；另有 `(inspection_id, seq)` 索引。每个商家一个管理员，管理员账号不能停用；店长必须绑定门店。`inspection_tasks` 按商家、门店、日期、模板、时间窗和重复序号唯一；每个非空 `inspections.task_id` 至多一条巡检记录。模板与 AI 标准均按商家名称唯一；日程方案名称也按商家唯一。另有 `inspection_tasks(status, due_at)`、`inspection_item_decisions(inspection_item_id, created_at)`、`evidence(inspection_item_id)`、`sessions(user_id)` 等索引，以及验证码用途/尝试次数、角色/状态/结果、时间窗和照片大小等 CHECK 约束；完整约束以现有 schema 与迁移为准。

AI 审核任务以条目和上传版本唯一，状态为 `pending|processing|completed|manual|cancelled`；领取使用行锁及 75 秒租约，调用次数为 0～4。保留每次已完成的 AI 结论，用于识别重传前的打回历史；条目保存当前 AI 理由。

## 种子数据

Northbean 有 12 家门店 `NB-001`～`NB-012`，每店至少一位店长，`NB-001` 另有一位店长，并有一位商家管理员。演示二号商家另有一家门店、一位店长、一位管理员和独立模板。两个商家的「开店检查」模板各有 8 项；冷柜温度和食品效期各需 1 张照片，其余不拍，没有严重项，验收要点为空且 AI 关闭。Northbean 有 18 张过去 7 天内的任务巡检单，每张关联一条任务；12 张为门店基线，另有 3 张 `failed`、2 张 `rework`、1 张 `passed`。`NB-001` 基线为 `passed`、88 分；`NB-012` 基线不合格。`NB-002` 的打回单带一条管理员文字聊天和一条店长 JPEG 图片聊天，签名读取可返回种子图片；重置种子会一并清理聊天行和 `chat/` 图片。所有种子巡检项保留首次自评、首次判定与判定记录；必拍项有 JPEG 占位照片，图片写入种子实际使用的存储目录。种子写入前清理自己的 `seed/` 子目录；e2e 槽位重置先清空并创建槽位存储目录，再灌入种子。所有分数按通过检查项数除以总检查项数四舍五入取整。

日程方案、门店选用和跳过区间的 API 清单见[日程方案与门店安排](schedules.md#接口)。

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
| 2026-10-26 | FW-008 按认证、巡检、证据、审核、看板拆控制器；接口、权限与业务规则保持不变。                                                                                 |
| 2026-10-27 | FW-009 改用服务端会话表与 HttpOnly cookie，移除旧登录和 Bearer 认证；写请求检查 Origin，CORS 开启 credentials。                                               |
| 2026-10-29 | 用户确认 API 接受任意 Origin，移除写请求 Origin 白名单校验；CORS 回显请求来源并继续启用 credentials。                                                         |
| 2026-10-29 | FW-011 增加聊天、门店/模板与店员记录 API 契约和存储结构；接入聊天读写、签名图片及记录分页，today、建单和看板补门店/当前模板字段。                             |
| 2026-10-29 | 门店与模板写接口持久化，停用限制新建，模板修改保留既有巡检快照；详见管理规格。                                                                                |
| 2026-11-03 | FW-017 完成多商家协议：角色使用 `admin`，模板当前索引按商家唯一，演示二号拥有当前模板；商家管理员可审核，主管权限保持不变。                                   |
| 2026-11-03 | g03 完成商家数据隔离、主管门店范围、账号停用与首次改密、7 天闲置续期及 CORS 来源白名单；ADR 0003 取代任意来源策略。                                           |
| 2026-11-11 | FW-028 增加按日程生成的巡检任务、店长逐条上传与管理员逐条判定/改判；删除整单写接口，并允许系统为从未上传任务补建 `inspector_id` 为空的巡检记录。              |
| 2026-11-11 | FW-024～FW-029 收敛为 admin 与 store_manager 两层角色，增加邮箱验证码与日程契约，并接入按需任务详情、Mobile 逐项操作和调店后的参与记录可见性。 |
| 2026-11-17 | FW-030 接入逐条异步 AI 审核、退避重试与待人工，保留首传信息并提供管理员自检准确率接口；AI 与人工结论沿用任务判定时间规则。 |
| 2026-11-18 | FW-031 完成管理员逐条审核与改判，审计改判前后结论并返回重算后的分数和整单结论。 |
| 2026-11-18 | FW-032 增加管理员今日视图与按周/月查询的看板统计接口。 |
| 2026-11-18 | FW-035 增加本人头像上传和管理员昵称更新接口；本人资料只通过当前会话读写。 |
| 2026-11-18 | FW-038（用户要求）在 AI 系统提示中加入通用证据充分性评估；证据不足只能打回并说明缺失，证据充足且结果明确才可通过或属实不合格，不改变管理员业务标准。 |
