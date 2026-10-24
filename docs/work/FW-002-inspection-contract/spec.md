# 巡检主链契约与骨架

> ID：`FW-002`
>
> 状态：`approved`

## 目标

并行组 g01 的契约单元（[`howto/parallel.md`](../../howto/parallel.md) 第 1 节）。三个演示账号能登录 API，下文「契约」的每个接口都能调用，返回符合 schema 的数据。
数据库按契约建好表并灌入 Northbean 种子数据；e2e 能按槽位跑；演示链 e2e 已写好，开组时允许是红的。
Mobile 能在 Expo Web 里打开并被 Playwright 驱动，FW-004 据此按方式 B 验收。

## 非目标

- 不实现巡检业务规则：提交锁分、审核、权限细分、看板取分留给 FW-003。本单元只做登录和角色校验，其他接口返回固定数据。
- 不做三端页面：登录页、巡检表单、审核队列、看板分别留给 FW-004、FW-005。
- 不做门店、模板、用户的管理页，不做聊天和 Web Demo 说明页，这些归第二组。
- 不做注册、找回密码、多组织、模板版本号、closed 状态。

## 契约

以下即契约内容，2026-10-24 用户审定。契约代码放在 `packages/shared/src/contract/`，是本节的代码形式，不多不少。归档后契约目录登记为 hardline，内容 Promote 到 `docs/specs/inspection.md`。

### 表（schema `floorwalk`）

主键都是 uuid，时间都是 timestamptz，所有表都有 `created_at`。

| 表 | 字段 |
| --- | --- |
| `sites` | `code`（唯一，如 `NB-001`）、`name` |
| `users` | `email`（唯一）、`password_hash`（argon2）、`display_name`、`role` `inspector\|supervisor\|hq`、`site_id`（仅 inspector，必填；其他角色为空） |
| `templates` | `name` |
| `template_items` | `template_id`、`position`、`title`、`photo_required`、`critical` |
| `inspections` | `site_id`、`template_id`、`inspector_id`、`status`、`score`（提交时锁定，0–100 整数，提交前为空）、`submitted_at`、`decided_at` |
| `inspection_items` | `inspection_id`、`position`；开单时从模板复制的 `title`、`photo_required`、`critical`；`result` `pending\|pass\|fail`、`note` |
| `evidence` | `inspection_item_id`、`storage_key`、`mime`、`size`；文件存放在 `STORAGE_DIR` 下 |
| `reviews` | `inspection_id`、`reviewer_id`、`action` `start\|approve\|rework\|fail`、`comment`、`rework_item_ids`（仅 rework 时有值） |

### 状态

`draft →（店员提交）submitted →（主管开始审核）in_review →（通过 / 打回 / 不合格）passed | rework | failed`；`rework →（店员重新提交）submitted`。`passed`、`failed` 是终态。

### 规则（FW-003 实现，契约里写成表和函数签名）

- 提交时所有项都不能是 `pending`，`photo_required` 的项至少要有 1 张照片。
- 分数 = 合格项数 ÷ 总项数 × 100，四舍五入取整，提交时锁定；重新提交时重算、重新锁定。
- 有 `critical` 项为 `fail` 时，主管只能判不合格，点通过会被拒。
- 看板上每家店取最近一次 `passed` 或 `failed` 的单的分数。
- 店员只能读写本店的单；主管、总部能读全部；只有主管能审核。

### 接口（前缀 `/api`；除登录外都要带 `Authorization: Bearer <token>`）

| 接口 | 调用方 | 说明 |
| --- | --- | --- |
| `POST /auth/login` | 全部 | `{email, password}` → `{token, user}` |
| `GET /me` | 全部 | 当前用户 |
| `GET /inspector/today` | Mobile | 本店模板、今天是否已提交、本店所有 `rework` 状态的单 |
| `POST /inspections` | Mobile | `{templateId}`，新建 `draft` 单 |
| `GET /inspections/:id` | 全部 | 单的详情，含各项和照片列表 |
| `PATCH /inspections/:id/items/:itemId` | Mobile | `{result, note}`，只在 `draft`、`rework` 状态下可改 |
| `POST /inspections/:id/items/:itemId/evidence` | Mobile | multipart 上传照片 |
| `GET /evidence/:id` | 全部 | 返回 1 小时有效的签名链接 |
| `POST /inspections/:id/submit` | Mobile | 提交并锁分 |
| `GET /review/queue` | Web | `submitted`、`in_review` 状态的单 |
| `POST /inspections/:id/review` | Web | `{action, comment, reworkItemIds?}` |
| `GET /dashboard/sites` | Web | 每家店和它最近一次的分数 |

### 错误

统一格式 `{code, message}`：401 `UNAUTHENTICATED`；403 `FORBIDDEN`（角色不对，或店员访问别的店）；409 `INVALID_STATE`（当前状态不允许）；422 `INCOMPLETE`（有 `pending` 项，或必拍项没有照片）；422 `CRITICAL_FAILED`（有严重项不合格却点了通过）。

### 种子

- Northbean Coffee 12 家店 `NB-001`～`NB-012`。
- 三个演示账号：店员绑定 `NB-001`，另有主管、总部各一个。密码统一，写进 README，这是公开的演示账号。
- 模板「开店检查」8 项，其中冷柜温度、食品效期是必拍项，没有严重项。
- 历史单：每家店一条 `passed`，`NB-001` 那条 88 分（7/8）；另有几条 `failed` 和 `rework`；总数约 20 条。
- 演示链：店员新开一单，冷柜标不合格，提交（88）→ 主管打回冷柜一项 → 店员补拍、改为合格、重新提交（100）→ 主管通过 → 看板上 `NB-001` 从 88 变成 100。

## 验收标准

- AC-01（`用户要求`）：`packages/shared/src/contract/` 覆盖上文「契约」的全部表、枚举、状态迁移、接口请求与响应 schema、错误码，内容与本 spec 一致，没有多出来的结构。
- AC-02（`用户要求`）：迁移在空库里建出全部 8 张表；种子灌入后，店、账号、模板项、历史单的数量和分数与「种子」一致。用测试断言。
- AC-03（`用户要求`）：三个演示账号用正确密码登录拿到 token，`GET /me` 返回对应角色；错误密码返回 401 `UNAUTHENTICATED`；不带 token 访问任一接口返回 401；店员调 `POST /inspections/:id/review` 返回 403 `FORBIDDEN`。用 e2e 断言。
- AC-04（`用户要求`，parallel.md 第 1 节的骨架）：其余接口都能调用，返回的数据能通过契约里的响应 schema 校验。用 e2e 逐个断言。
- AC-05（`用户要求`）：e2e 设施可以用 `FW_SLOT=1|2|3` 选择库 `floorwalk_e2e_N` 和端口 `31N0`/`31N1`/`31N2`（见 parallel.md 第 3 节），照片目录也按槽位分开；每次运行前清空并重建本槽位的 schema 和照片目录；三个槽位同时运行互不干扰。连接信息取自 `apps/api/.env.development` 的 `DATABASE_URL`：由测试进程加载，只替换其中的库名；Agent 不读、不打印它的值（AGENTS.md 第 12 节）。
- AC-06（`用户要求`）：按「种子」里的演示链写好 API 层 e2e，断言提交得 88、重新提交得 100、看板 `NB-001` 变为 100。它用单独的命令运行，不进默认测试套件。本单元结束时它是红的，失败原因是业务规则还没实现；不要为了让它变绿去实现业务规则，那是 FW-003 的事。
- AC-07（`用户要求`）：Mobile 在 Expo Web 中能打开首页，Playwright 能点击按钮并截图。做不到时停下报告，FW-004 在开组前改回方式 A。
- AC-08（`用户要求`）：第一组要用的依赖一次装好：shared 的 zod；API 的 drizzle-orm、drizzle-kit、pg、JWT、argon2、上传组件；Web 与 Mobile 的 @tanstack/react-query；Mobile 的 expo-image-picker、expo-secure-store（用 `npx expo install` 装）；e2e 的 Playwright；API 测试的 vitest、supertest。`pnpm install --frozen-lockfile` 通过。
- AC-09（`用户要求`）：API 监听地址由 `HOST` 决定，默认仍为 `127.0.0.1`。各端 `.env*.example` 列出新变量名：API 的 `DATABASE_URL`、`JWT_SECRET`、`STORAGE_DIR`、`HOST`，Web 的 `VITE_API_BASE_URL`，Mobile 的 `EXPO_PUBLIC_API_BASE_URL`；示例值只用占位符。

## 验收方式

`B Agent 验收`

AC-07 用 Playwright 截图取证，截图存在本单元的 `evidence/`。Mobile 相关的实现开始前，先加载 `expo-overview` skill（位于 `~/.agents/skills/`），按它的路由加载 `expo-router`、`expo-data-fetching`、`expo-ui`；装 Expo 包用 `npx expo install`；Web 入口要查 SDK 57 版本的文档。

## 涉及的当前事实

- 新增 `specs/inspection.md`，归档时 Promote 生成：「契约」节的内容，以及骨架阶段的接口行为。
- [`specs/workspace.md`](../../specs/workspace.md)「API 进程探针」「Mobile 运行」「没有的」：API 可配置 `HOST`；Expo Web 入口可用；不再写"没有数据库"。
- [`context/dev-environment.md`](../../context/dev-environment.md)：验证命令加 e2e 和槽位用法，环境配置加新变量名。
- [`howto/local-development.md`](../../howto/local-development.md)：补迁移、种子、e2e 的步骤。

## 依赖

- FW-001

## 批准记录

- 批准依据：用户 2026-10-24 审定契约草案 v1，原话"005改成B，其他默认"；验收方式 B，原话"关于mobile，我还是想B验收"。
- 批准时间：`2026-10-24`
- 特殊授权：可以写业务代码，范围是 API、shared、三端的配置与入口、测试、种子；可以在仓库根和各应用里装 AC-08 列出的依赖；可以在 master 上本地提交，不推送；连库只用 `floorwalk` 角色，只连本机 `floorwalk*` 库。
