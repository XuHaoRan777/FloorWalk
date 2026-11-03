# g03 协议：多商家、账号、存储与 AI 接口

> ID：`FW-017`
>
> 状态：`approved`

## 目标

并行组 g03 的协议单元（[`howto/parallel.md`](../../howto/parallel.md) 第 1、2 节）。一次定死本组全部表、角色、接口和两个内部接口（存储、AI 适配），让三条线只填实现。用户看不到新功能：现有行为不变，只是 `hq` 改名为商家管理员、存储读写改走接口。

## 非目标

- 不给现有查询加商家边界（L1-1 做），不实现注册、指派、账号管理的写规则（L1-2、L1-3 做）。
- 不实现 OSS 驱动（L2 做），不实现 AI 适配器（L3 做），只定接口和一个本地/假实现。
- 不改界面样式；新页面只挂空桩，用 FW-016 的组件。
- 不做个人中心、日程、模板改造等功能组内容。

## 契约

### 表（schema `floorwalk`，一次迁移）

- 新表 `organizations`：`id` uuid 主键、`name text not null`、`timezone text not null default 'Asia/Shanghai'`、`created_at`。
- `sites`、`users`、`templates` 加 `org_id uuid not null` 外键；迁移先建 Northbean 商家行，再把现有行全部指向它，最后加 `not null`。`inspections`、`inspection_items`、`evidence`、`reviews`、`chat_messages` 不加，商家经 `site_id` 或 `inspection_id` 推出。
- 唯一约束改为按商家：`sites (org_id, code)`、`templates (org_id, name)`；`users.email` 保持全局唯一。
- `users.role` 的取值改为 `inspector | supervisor | admin`，迁移把 `hq` 改成 `admin`；`inspector` 必须有 `site_id`，`supervisor`、`admin` 的 `site_id` 为空。
- `users` 加 `must_change_password boolean not null default false`、`disabled_at timestamptz` 可空、`created_by uuid` 可空外键。
- 新表 `site_supervisors`：`site_id` 主键并外键（一店最多一个主管）、`user_id` 外键、`assigned_at`。
- `sessions` 加 `last_seen_at timestamptz not null default now()`；会话有效 = 未吊销且 `last_seen_at` 在 7 天内；`expires_at` 列保留但不再参与判断（L1-3 删或改由它处理）。

### 角色与权限的写法

- 路由表 `roles` 的取值改为 `inspector | supervisor | admin`。
- 新增门店范围判断函数（签名在 `@libs/shared`，实现在 API）：`admin` 可访问本商家全部门店；`supervisor` 只能访问 `site_supervisors` 里自己名下的门店；`inspector` 只能访问自己的 `site_id`。协议单元只建函数和测试，不接进现有查询。

### 接口（前缀 `/api`）

| 接口                              | 角色              | 请求                                                              | 成功响应                                                                                                                  | 实现在                     |
| --------------------------------- | ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `POST /orgs`                      | 无需登录          | `{ orgName, timezone?, adminName, email, password }`，密码 ≥ 8 位 | 201，`{ org, user }`，同时登录（设会话 cookie）                                                                           | L1-2                       |
| `GET /admin/sites`                | admin、supervisor | —                                                                 | 现有响应，每家店加 `supervisor: { id, displayName } \| null`；supervisor 只看自己名下                                     | L1-1（范围）、L1-2（字段） |
| `PUT /admin/sites/:id/supervisor` | admin             | `{ userId: string \| null }`                                      | 200，门店                                                                                                                 | L1-2                       |
| `GET /admin/users`                | admin、supervisor | —                                                                 | 200，账号列表：admin 看本商家全部，supervisor 只看自己门店的店员；每条带 `role`、`site`、`disabled`、`mustChangePassword` | L1-3                       |
| `POST /admin/users`               | admin、supervisor | `{ email, displayName, role, siteId?, password }`                 | 201，账号；supervisor 只能建 `inspector` 且 `siteId` 在自己名下                                                           | L1-3                       |
| `PATCH /admin/users/:id`          | admin、supervisor | `{ displayName?, disabled? }`                                     | 200，账号；停用即吊销全部会话                                                                                             | L1-3                       |
| `POST /admin/users/:id/password`  | admin、supervisor | `{ password }`                                                    | 204；设 `must_change_password`，吊销全部会话                                                                              | L1-3                       |
| `POST /me/password`               | 已登录本人        | `{ currentPassword, newPassword }`                                | 204；清 `must_change_password`，吊销本人其他会话                                                                          | L1-3                       |

现有接口两处变化：`GET /me` 和登录响应的 `user` 加 `org: { id, name }` 和 `mustChangePassword`；`must_change_password` 为真时，除 `GET /me`、`POST /me/password`、`DELETE /auth/session` 外的受保护接口返回 403 `FORBIDDEN`（L1-3 实现，协议单元只写进路由表的标记）。

权限总则（L1-1～L1-3 按它实现，协议单元写进契约测试的期望表）：

- 跨商家一律 404 `NOT_FOUND`，不暴露对方是否存在。
- supervisor 不能建、改、停用、重置 supervisor 或 admin；对不在自己名下的门店操作返回 403。
- 最后一个启用的 admin 不能被停用：409 `INVALID_STATE`。
- 停用的账号登录返回 401 `UNAUTHENTICATED`。
- 不新增错误码。

### 存储接口（`apps/api/src/storage/`）

- `StorageDriver`：`put(key, buffer, mime)`、`get(key)` 返回流和 mime、`delete(key)`、`signedUrl(key, expiresInSeconds)`。
- 键格式统一为 `org/<orgId>/<现有键>`，例如 `org/<orgId>/evidence/<inspectionId>/<uuid>.jpg`；种子和迁移把现有本地文件按新键挪动。
- 协议单元提供 `LocalStorageDriver`（现有本地目录 + HMAC 签名，行为不变），并把 `chat`、`evidence`、`storage` 三个控制器和种子改走接口。按 `STORAGE_DRIVER=local|oss` 选择，默认 `local`，`oss` 时抛"未实现"（L2 实现）。

### AI 适配接口（`apps/api/src/ai/`）

- `AiReviewer.review(input)`：输入为商家的审核标准提示词、模板名、检查项列表（标题、是否必拍、是否严重项、最少张数、验收要点、店员自评、照片的签名链接或 base64）；输出为整单结论 `pass | fail | rework`、每项 `{ itemId, verdict: pass | fail, reason }`、`reworkItemIds`。
- 输出用 zod schema 定在 `@libs/shared`；结果不符合 schema、超时或调用失败时返回 `{ kind: 'needs_human', reason }`，不抛异常。
- 协议单元提供 `FakeAiReviewer`：按输入里的店员自评原样返回，带固定理由。真实适配器由 L3 实现。按 `AI_DRIVER=fake|openai` 选择，默认 `fake`。
- 不接入提交流程，不加表。

### 进程脚本

`scripts/dev/proc.mjs` 加 `api` 服务：槽位端口 `31N0`，库 `floorwalk_e2e_N`，存储目录 `apps/api/.e2e/slot-N/storage`，环境变量写在脚本里，不手动拼 `DATABASE_URL`（FW-016 T07 手动起 API 漏改库名，把开发库重置成了种子）。

## 环境

- 环境变量：API 新增 `STORAGE_DRIVER`、`AI_DRIVER`（默认值写在代码里，env 里可以没有）；L2 用 `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_PREFIX`（可选 `OSS_ENDPOINT`）；L3 用 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`。协议单元只核对主目录 `apps/api/.env.development` 有没有这些键名，不读值，结果写进证据。
- 数据库：槽位库 1～3 就绪；开发库在集成单元重置并迁移到最新（用户已授权，产品基线「演示数据」）。
- 端口与进程：L1 槽位 1，L2 槽位 2，L3 槽位 3；本组没有原生线。常驻进程只用 `proc.mjs`。
- 测试环境：FW-016 后的状态仍在（UI 套件 `workers` 为 1、图片断言用 `naturalWidth`、`e2e:demo-ui` 前确认没有残留进程）。
- 用户明文授权（写进各单元批准记录，并行期间不再问）：本组改硬线路径（契约、`schema.ts`、迁移、`auth.ts`）；加迁移（只有协议单元）；集成单元重置开发库；L2、L3 的冒烟测试调用真实的阿里云 OSS 与模型接口各一次。线上单元不加依赖：协议单元在 `apps/api` 装好 `ali-oss@6.23.0`（L2 用）、`openai@7.47.0` 和 `sharp@0.35.5`（L3 用，照片压缩），版本固定不用范围；`sharp` 要原生二进制，装完在 Windows 上跑一次缩放确认可用。
- 探针：协议单元后段用 `OPENAI_*` 发一次带一张种子照片的请求，测三件事：能不能读图、支不支持结构化输出（`response_format` 的 JSON schema）、能不能直接给签名链接（本地 URL 外网拉不到，预期不能，改用 base64）。结果写进证据和 L3 spec；读不了图就停下报告。

### 写入范围（按线，线和线之间不交叉）

| 线  | 单元   | 写入范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | FW-018 | `apps/api/src/*.controller.ts`（`auth.controller.ts` 除外）、`inspection-queries.ts`、`apps/api/src/db/seed.ts`、`seed.test.ts`、`apps/api/src/*.test.ts`（`session.test.ts` 除外）、`tests/e2e/`、`tests/web/`、`tests/mobile/`、`tests/demo/`                                                                                                                                                                                                                            |
| L1  | FW-019 | `apps/api/src/orgs.controller.ts`（新）、`admin.controller.ts`、`apps/web/src/pages/register.tsx`（新）、`apps/web/src/components/console/sites-page.tsx`、`apps/web/src/lib/api/orgs.ts`、`admin.ts`、相关测试                                                                                                                                                                                                                                                            |
| L1  | FW-020 | `apps/api/src/auth.ts`、`auth.controller.ts`、`users.controller.ts`（新）、`session.test.ts`、`main.ts`（CORS）、`apps/web/src/components/console/users-page.tsx`（新）、`apps/web/src/pages/change-password.tsx`（新）、`apps/web/src/lib/api/users.ts`、`session.ts`、`apps/mobile/components/mobile/change-password-screen.tsx`（新）、`apps/mobile/app/(authenticated)/change-password.tsx`（新）、`apps/mobile/lib/api/auth.ts`、`docs/adr/0003-*.md`（新）、相关测试 |
| L2  | FW-021 | `apps/api/src/storage/oss.ts`（新）、`apps/api/src/storage/oss.test.ts`（新）、`apps/api/src/storage/oss.smoke.test.ts`（新）                                                                                                                                                                                                                                                                                                                                              |
| L3  | FW-022 | `apps/api/src/ai/openai.ts`（新）、`apps/api/src/ai/prompt.ts`（新）、`apps/api/src/ai/*.test.ts`（新）                                                                                                                                                                                                                                                                                                                                                                    |

L1 三个单元在同一分支上依次做，后面的单元可以改前面单元写过的文件。L2、L3 只加新文件；`storage/index.ts`、`ai/index.ts` 里按环境变量选驱动的那一行由协议单元写好，L2、L3 不改。

## 验收标准

- AC-01（`用户要求`）：迁移在空库、现有开发库副本和槽位库上都能跑通；跑完后全部 `sites`、`users`、`templates` 都属于 Northbean 商家，原 `hq` 账号是 `admin`，现有业务数据条数不变（迁移前后各计一次写进证据）。
- AC-02（`用户要求`）：种子重建为"Northbean 是第一个商家"：12 店分给 2 个主管各 6 家（`site_supervisors`），1 个商家管理员，12 个店员；另建第二个商家"演示二号"（1 店、1 主管、1 店员、1 商家管理员、1 张已判定单），供 L1-1 测跨商家隔离。存储键按新格式写入。
- AC-03（`用户要求`）：契约代码覆盖上文「契约」：schema、角色、路由表（新增 7 条接口、两处现有字段变化）、门店范围函数签名、存储接口、AI 输入输出 schema。契约 e2e 按路由表遍历新路由，验证角色放行与拒绝；新接口这时返回 501，契约 e2e 对 501 只检查角色，不检查响应体。
- AC-04（`用户要求`）：现有行为不变：存储改走 `LocalStorageDriver` 后，证据照片与聊天图片的上传、签名读取、失败清理照旧；`hq` 改名后，原总部账号的看板、审核详情只读、门店模板管理照旧。现有 API 测试、契约 e2e、Web e2e、`e2e:mobile`、`e2e:cors`、`e2e:demo`、`e2e:demo-ui` 全绿；断言里 `hq` 改 `admin` 可以，不放宽。
- AC-05（`用户要求`）：门店范围函数有单元测试：admin 看本商家全部门店、看不到另一商家；supervisor 只看名下门店；inspector 只看自己门店；停用的门店仍在范围内（历史可读）。
- AC-06（`用户要求`）：注册行与空桩：`app.module.ts` 注册 `orgs`、`users` 两个控制器（方法返回 501）；Web `lib/api.ts` 导出 `orgs`、`users`；Web 加注册页路由（首页"注册商家"入口）、控制台「账号」分区（admin、supervisor 可见）、改密码页路由，都挂空页；Mobile 加改密码路由，挂空页。
- AC-07（`用户要求`）：`FakeAiReviewer` 按 AI 输出 schema 返回；`needs_human` 的三种来源（schema 不符、超时、调用失败）各有一个测试，用可注入的假客户端触发。
- AC-08（`用户要求`）：AI 探针结果写进证据：读图、结构化输出、签名链接三项各 通过/不通过 + 原始错误；读不了图就停下报告，不开组。
- AC-09（`用户要求`）：`proc.mjs` 的 `api` 服务在槽位 1 起停一次：`/health` 200、`DATABASE_URL` 指向 `floorwalk_e2e_1`（只核对库名，不打印连接串）、停后端口释放。
- AC-10（`用户要求`，开组检查）：master 上类型检查、lint、`format:check`、构建、`FW_SLOT=1 pnpm --filter @apps/api test`、`pnpm e2e:slots` 通过；L1～L3 的 spec 与写入范围和本 spec 一致。

## 验收方式

`B Agent 验收`

- 改契约、`schema.ts`、迁移、`auth.ts`，提交带「硬线：」行。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)「契约与权限」：角色改名、商家、会话判断方式。由集成单元 Promote。
- [`specs/workspace.md`](../../specs/workspace.md)：存储接口、AI 适配接口、`proc.mjs` 的 `api` 服务。

## 依赖

- 无

## 批准记录

- 批准依据：用户 2026-11-03 原话"一起批准"（g03 七个单元一起批准）；组的构成与 9 条产品语义见 FW-017 plan「决策与偏差」
- 批准时间：`2026-11-03`
- 特殊授权：硬线路径与迁移授权见「环境」；`apps/api/package.json` 加 `ali-oss@6.23.0`、`openai@7.47.0`、`sharp@0.35.5`；在主目录 master 上提交，不推送；只用 `floorwalk` 角色连 `floorwalk*` 库。

- 2026-11-03：用户确认“修正为 7 条，继续”，AC-03 只修正新增路由数量，接口内容不变。
