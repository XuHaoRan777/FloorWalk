# g02 契约：聊天、门店与模板、记录页

> ID：`FW-011`
>
> 状态：`approved`

## 目标

并行组 g02 的契约单元（[`howto/parallel.md`](../../howto/parallel.md) 第 1 节）。一次定好聊天、门店与模板管理、Mobile 记录页三个功能要用的表、迁移、接口、权限和错误，交付契约代码、骨架、预建的注册行与空组件、演示链和跨端最薄链路，并过三道开组门。
做完后三个并行单元（聊天、门店与模板 CRUD、记录页）各在自己的文件里写，互不交叉。

## 非目标

- 不实现三个功能的业务：骨架返回符合 schema 的数据，真实规则由并行单元实现（聊天的最薄链路例外，见 AC-08）。
- 不做用户与角色管理（Backlog 另列）、按门店分配模板、实时推送、已读未读、通知、消息编辑与删除。
- 不改现有接口的行为，除「契约」里列出的三处（today、建单、看板）的字段和停用规则。
- 不加依赖。

## 契约

### 表（schema `floorwalk`，一次迁移）

- `sites` 加 `deactivated_at timestamptz` 可空；空为启用中。
- `templates` 加 `is_current boolean not null default false`，部分唯一索引保证 `is_current = true` 的行最多一个；种子把现有模板设为当前。
- `template_items` 加唯一约束 `(template_id, position)`（迁移前核对现有数据无重复）。
- 新表 `chat_messages`：`id` uuid 主键；`seq bigint` 自增、唯一；`inspection_id` 外键；`author_id` 外键；`body text` 可空、最多 1000 字；`storage_key text`、`mime text`、`size integer` 可空；`created_at`。检查约束：`body` 与 `storage_key` 至少一个非空；`storage_key`、`mime`、`size` 同时为空或同时非空。索引 `(inspection_id, seq)`。

### 接口（前缀 `/api`，都需会话 cookie）

| 接口                                                               | 角色           | 请求                                                                           | 成功响应                                                                                                     |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `GET /inspections/:id/messages?after=<seq>&before=<seq>&limit=<n>` | 能读该单者     | `after`、`before` 互斥，都不带时返回最近的；`limit` 默认 50、最大 100          | 200，`{ messages, hasMoreBefore }`，按 `seq` 升序；每条带作者 `displayName`、`role`，有图时带签名 `imageUrl` |
| `POST /inspections/:id/messages`                                   | 本店店员、主管 | multipart：`text` 可选（1～1000 字），`file` 可选（jpeg/png，≤10MB），至少一个 | 201，新消息                                                                                                  |
| `GET /messages/:id/image-url`                                      | 能读该单者     | —                                                                              | 200，`{ url, expiresAt }`                                                                                    |
| `GET /inspector/inspections?cursor=<c>&limit=<n>`                  | 店员           | `limit` 默认 10、最大 50；`cursor` 不透明字符串                                | 200，`{ items, nextCursor }`，本店全部状态，按 `created_at` 倒序；`nextCursor` 为 null 表示没有更多          |
| `GET /admin/sites`                                                 | 总部、主管     | —                                                                              | 200，全部门店（含已停用），带 `active`                                                                       |
| `POST /admin/sites`                                                | 总部、主管     | `{ code, name }`                                                               | 201，新门店                                                                                                  |
| `PATCH /admin/sites/:id`                                           | 总部、主管     | `{ name?, active? }`                                                           | 200，门店                                                                                                    |
| `GET /admin/templates`                                             | 总部、主管     | —                                                                              | 200，全部模板，带 `isCurrent` 和检查项                                                                       |
| `POST /admin/templates`                                            | 总部、主管     | `{ name, items }`                                                              | 201，新模板（不设为当前）                                                                                    |
| `PUT /admin/templates/:id`                                         | 总部、主管     | `{ name, items }`，`items` 整体替换、至少 1 项、`position` 从 1 连续           | 200，模板                                                                                                    |
| `POST /admin/templates/:id/current`                                | 总部、主管     | —                                                                              | 200，模板；原当前模板改为非当前                                                                              |

现有接口三处变化：`GET /inspector/today` 的 `site` 带 `active`，模板取当前模板；`POST /inspections` 门店已停用时返回 409 `INVALID_STATE`；`GET /dashboard/sites` 每家店带 `active`。

### 权限（能读该单 = 现有 `assertInspectionAccess`：本店店员、主管、总部）

- 发聊天：总部 403；外店店员 403；单子在任何状态都能发。
- 记录页：主管、总部 403。
- 管理接口：店员 403。
- 门店 `code` 重复、模板 `name` 重复：409 `INVALID_STATE`；请求体不合法：400 `VALIDATION_FAILED`；单、消息、门店、模板不存在：404 `NOT_FOUND`。不新增错误码。

### 存储

聊天图片存储键为 `chat/<inspectionId>/<uuid>.<ext>`，签名与读取复用现有 `storage/*key` 接口和 HMAC，有效期与证据照片相同。

## 验收标准

- AC-01（`用户要求`）：契约代码覆盖上文「契约」：schema、类型、路由表（新增 11 条，现有三处字段变化）、权限写进路由表 `roles`；`DELETE` 以外不新增 method。契约 e2e 按路由表遍历新路由，验证每条的角色放行与拒绝、响应 schema 合法。
- AC-02（`用户要求`）：迁移在空库和现有槽位库上都能跑通；种子灌入后当前模板恰好 1 个、所有门店启用、`chat_messages` 有演示数据（NB-002 那张打回单上主管 1 条文字、店员 1 条带图）；种子重置时清空 `chat_messages` 和聊天图片文件。
- AC-03（`用户要求`，骨架）：门店、模板、记录页的新接口都能调用，按角色放行与拒绝，返回符合 schema 的数据（可以是种子数据的直接查询，不实现停用规则、模板替换、设为当前等写规则）；三处现有接口带上新字段。
- AC-04（`用户要求`）：聊天三条接口按「契约」实现完整的读写（插入、按 `seq` 游标读取、`before` 分页、发图存储与签名），因为最薄链路（AC-08）要真实往返；聊天单元在此之上做界面和体验。
- AC-05（`用户要求`）：预建注册行：`app.module.ts` 注册 `chat.controller.ts`、`admin.controller.ts`、`records.controller.ts`；Web 与 Mobile 的 `lib/api.ts` 导出 `lib/api/chat.ts`、`admin.ts`、`records.ts`（Mobile 无 admin）；Web 控制台加「门店」「模板」两个分区（只对总部、主管显示），各挂一个空页组件；Mobile Tabs 加「记录」，挂空列表页，并建好只读详情路由 `app/(authenticated)/records/[id].tsx`（空页）。
- AC-06（`用户要求`）：`ChatPanel` 组件两端各一个（Web `components/console/chat-panel.tsx`，Mobile `components/mobile/chat-panel.tsx`），参数 `{ inspectionId, canSend }`；挂在 Mobile 巡检页、Web 审核详情、Mobile 记录只读详情三处。契约单元的版本是简陋可用版：消息列表、文本框、选图按钮、发送，打开时拉一次，不轮询、不分页、不加样式。
- AC-07（`用户要求`）：API 层演示链扩展：主管打回 NB-002 后发一条说明，店员回一条带图的消息，双方 `GET messages` 都看到两条；店员 `GET /inspector/inspections` 第一页里有这张单。开组时演示链的其余部分可以是红的，聊天这两步必须绿。
- AC-08（`用户要求`，跨端最薄链路）：在模拟器上用 Expo Go 打开 Mobile 巡检页的 `ChatPanel`，发一条文字、一条从系统相册选的图；Web 审核详情里能看到这两条且图能显示；Web 主管回一条，Mobile 重开页面后看到。logcat 无 JS 错误。
- AC-09（`用户要求`，开组门）：按 `howto/parallel.md` 第 1 节过三道门：按流程走路由表（对三个并行单元的用户流程逐步对到路由表与权限，演示链每一步对照状态迁移表）；新库实测（重置槽位、起 API、用真请求核对种子不变量和每条新接口的响应）；并发隔离（三个槽位同时跑全部测试命令都通过，开发库未被清空，不设 `FW_SLOT` 时每条命令都报错退出）。三道门之外在 master 上跑一次全量门禁。结果写进证据，查出的缺口在本单元修完再过门。
- AC-10（`用户要求`）：现有 API 测试、契约 e2e、Web e2e、`e2e:mobile`、`e2e:cors`、`e2e:demo-ui` 全绿；为新字段改断言可以，不放宽。
- AC-11（`建议采纳`）：聊天列表接口支持 `before` 分页，`hasMoreBefore` 正确；契约 e2e 覆盖：不带游标返回最近 50 条、`before` 取更早、`after` 取新消息、`after` 与 `before` 同时带返回 400。

## 验收方式

`B Agent 验收`

- 改契约目录、`schema.ts`、迁移目录，都是 hardline，相关提交带一行「硬线：」。
- 模拟器取证照 [`dev-environment.md`](../../context/dev-environment.md)「Mobile 原生」一行。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)「契约与权限」「接口」「数据结构」「种子数据」：新增 11 条接口、三张表的变化、聊天与管理权限、种子聊天数据。
- [`context/product.md`](../../context/product.md)「角色」：主管的主表面加「Admin 配置（门店、模板）」。
- 业务行为的 `specs/` 小节（聊天、门店与模板、记录页）由各并行单元归档时 Promote，本单元不写。

## 依赖

- FW-010

## 批准记录

- 批准依据：用户 2026-10-28 定 g02 产品决定与补充默认，采纳默认 A～I 与建议 1（原话"A～I 按默认，建议 1 采纳，写契约单元的 spec 和 plan 给我看。"），随后批准（原话"批准 FW-011，提交推送后给我 Codex 启动语。"）
- 批准时间：`2026-10-28`
- 特殊授权：可以写业务代码，范围是 API、shared、Web、Mobile、测试与脚本；在主目录 master 上做，按任务本地提交，用户说推送再推送。预授权（给 g02 并行单元）：本单元写的测试或演示链漏了步骤，并行单元可在自己分支上补，不算契约改动；原有的不稳定测试只许改定位、不许放宽断言，改动在证据里写明。
