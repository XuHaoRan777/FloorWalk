# 巡检主链契约修订

> ID：`FW-003`
>
> 状态：`approved`

## 目标

修正 FW-002 交付后用户核验发现的契约偏差，让三端能照契约开发，演示链 e2e 能真正验收集成结果。
做完后：契约代码里有路由表和权限表；API 的每个接口都按契约的路径、角色、请求和响应工作；错误统一成 `{code, message}`；种子满足契约的不变量；演示链 e2e 按完整链路写好。
本单元是并行组 g01 开组前的最后一个契约单元（[`howto/parallel.md`](../../howto/parallel.md) 第 1 节）。

## 非目标

- 不实现巡检业务规则：提交锁分、审核状态变更、看板取分、照片落盘与签名校验，仍由并行单元 FW-004 实现。
- 不做三端页面。
- 不改已批准的表结构和状态迁移；只把 FW-002 多加的约束和索引补写进契约。

## 契约变更

以下变更 2026-10-24 由用户批准（原话"可以，开一个修订单元"），在 FW-002 契约的基础上增改。

### 路由表与权限表

契约代码新增路由表，每个接口一条，列出方法、路径（含 `/api` 前缀）、允许的角色、请求 schema、响应 schema、成功状态码；权限矩阵由路由表推出，不另写一份。API 的路由、角色检查和 e2e 都从这张表取值。

| 方法与路径                                         | 允许角色                 | 响应                              |
| -------------------------------------------------- | ------------------------ | --------------------------------- |
| `POST /api/auth/login`                             | 不需登录                 | `{token, user}`                   |
| `GET /api/me`                                      | 全部                     | 当前用户                          |
| `GET /api/inspector/today`                         | inspector                | 今日待巡                          |
| `POST /api/inspections`                            | inspector                | 新建的单                          |
| `GET /api/inspections/:id`                         | 全部（inspector 限本店） | 单的详情                          |
| `PATCH /api/inspections/:id/items/:itemId`         | inspector（限本店）      | 改后的那一项                      |
| `POST /api/inspections/:id/items/:itemId/evidence` | inspector（限本店）      | 新建的照片记录                    |
| `GET /api/evidence/:id`                            | 全部（inspector 限本店） | `{url, expiresAt}`                |
| `POST /api/inspections/:id/submit`                 | inspector（限本店）      | 提交后的单                        |
| `GET /api/review/queue`                            | supervisor、hq           | `submitted`、`in_review` 状态的单 |
| `POST /api/inspections/:id/review`                 | supervisor               | 审核后的单（详情）                |
| `GET /api/dashboard/sites`                         | supervisor、hq           | 每家店最近一次判定                |

### 规则修订

- 店员能读写本店的所有单，不限本人创建（回到 FW-002 契约原文）。
- 看板上每家店的"最近一次"，取 `decided_at` 最大的那张 `passed` 或 `failed` 单。
- `GET /api/evidence/:id` 返回的 `url` 是绝对地址，由 API 自己的访问地址拼出，不写死主机和端口。
- 照片上传的 multipart 字段名为 `file`，只接受 `image/jpeg`、`image/png`，单张不超过 10 MB。
- 浏览器端的 Web 和 Expo Web 跨源访问 API：API 允许 `CORS_ORIGINS` 列出的来源，未配置时允许本机开发端口（3019、3020 以及 e2e 槽位的 31N1、31N2）。

### 错误修订

在原有 5 个错误码之外新增两个：400 `VALIDATION_FAILED`（请求体或参数不符合 schema），404 `NOT_FOUND`（单、检查项、照片不存在）。API 加全局异常过滤器，所有错误响应都是 `{code, message}`，没有 Nest 默认格式，也没有 500 漏出来的校验错误。

### 补写进契约的结构

FW-002 实现时多加的结构，用户 2026-10-24 同意保留：`templates.name` 唯一；`inspections(site_id, status)`、`inspections(created_at)`、`evidence(inspection_item_id)` 三个索引；各表的 CHECK 约束（与枚举一致）。

### 种子重做

- 12 家店各一个店员账号，只有 `NB-001` 的店员写进 README 当演示账号；主管、总部各一个。所有演示账号同一个密码，也写进 README。
- 每家店各有一张基线已判定单，`NB-001` 那张是 `passed`、88 分；其他店的基线分数各不相同。除这 12 张基线单外，`NB-001` 不放其他单；其他门店再各放 2～3 张 `failed`、2～3 张 `rework`、2～3 张 `submitted`。所有单的 `created_at`、`submitted_at`、非空 `decided_at` 各不相同。
- 在 `NB-001` 以外的店再放：2～3 张 `failed`、2～3 张 `rework`、2～3 张 `submitted`。`NB-001` 除那张 88 分的单外没有别的单。
- 种子满足契约的不变量：非 `draft` 单的必拍项都有照片（占位图，文件放在 `STORAGE_DIR`）；`rework` 单有对应的打回记录，记录里指出打回的项；`passed`、`failed` 单有对应的审核记录。

## 验收标准

- AC-01（`用户要求`）：契约代码有路由表，内容与上文「路由表与权限表」一致；改检查项、审核两个接口有各自的响应 schema；错误码共 7 个；`dashboard` 规则、照片字段、补写的结构都写进契约。不多不少。
- AC-02（`用户要求`）：API 的每个接口都在 `/api` 前缀下；e2e 遍历路由表，对每一条断言：路径可达、成功时状态码与表一致、响应通过表里的响应 schema；对每个不在允许角色里的角色断言 403 `FORBIDDEN`。
- AC-03（`用户要求`）：错误格式统一。e2e 断言：查不存在的单返回 404 `NOT_FOUND`；登录请求体不合法返回 400 `VALIDATION_FAILED`；所有错误响应都能通过契约里的错误 schema。
- AC-04（`用户要求`）：店员能读本店别人建的单，读不了别的店的单。用 e2e 断言。
- AC-05（`用户要求`）：种子符合上文「种子重做」的每一条，用测试逐条断言，包括时间各不相同、各状态的单数、照片与审核记录的不变量、`NB-001` 只有一张 88 分的单。
- AC-06（`用户要求`）：演示链 e2e 写成完整链路：店员登录 → 建单 → 冷柜标不合格、其余合格、必拍项上传照片 → 提交，断言 88 → 主管开始审核、打回冷柜一项 → 店员补拍、改为合格、重新提交，断言 100 → 主管通过 → 看板 `NB-001` 断言 100。它用单独的命令运行，不进默认套件，按槽位起 API、不依赖开发端口；本单元结束时它是红的，第一处失败必须落在业务规则上（如提交后分数不对或状态没变），不能是 404、401 或连接失败。不要为了让它变绿去实现业务规则，那是 FW-004 的事。
- AC-07（`用户要求`）：Web（任一 Vite 页面）和 Expo Web 从浏览器调用 `GET /api/me` 不被 CORS 拦截。用 Playwright 断言。
- AC-08（`用户要求`）：用 `npx expo install --fix` 把 Expo 相关包对齐到 SDK 57 的期望版本，`pnpm --filter @apps/mobile check` 通过；Mobile 的 Expo Web 探针（FW-002 的 `pnpm e2e:mobile`）仍然通过，并改为按槽位取端口。

## 验收方式

`B Agent 验收`

Expo 相关改动前先加载 `expo-overview` skill（`~/.agents/skills/`），装包用 `npx expo install`。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)「契约与权限」「巡检规则」「接口」「数据结构」「种子数据」：按上文「契约变更」改写。
- [`context/dev-environment.md`](../../context/dev-environment.md)：验证命令补演示链 e2e 的槽位用法和 `CORS_ORIGINS`；「已知偏差」删掉 Expo 版本落后（本单元修掉）。
- 仓库根 `README.md`：演示账号与密码。

## 依赖

- FW-002

## 批准记录

- 批准依据：用户 2026-10-24 核验 FW-002 后批准开修订单元，原话"可以，开一个修订单元"；对应的 10 条修订默认值见本单元 plan「决策与偏差」。
- 批准时间：`2026-10-24`
- 特殊授权：可写业务代码，范围是 API、shared 契约、种子、测试、e2e 设施、Mobile 和 Web 的配置；契约目录、迁移和认证模块属于 hardline，相关提交信息加「硬线：」行；可以在 master 上本地提交，不推送；只用 `floorwalk` 角色连本机 `floorwalk*` 库。
