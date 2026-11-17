# 站内通知（后端 + Web 收件箱） - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：完成，待归档
- 阻塞：无。FW-016 队列 390px 横向溢出按用户要求留给 FW-016。
- 下一步：Promote 当前事实并归档

Preflight（2026-11-17）：起点 `dbf4563`，上游 FW-035 已 verified 且提交在当前分支；工作区干净，文档校验 0 问题。预计修改 shared 契约、API schema/前向迁移/控制器/服务/测试和 Web 控制台组件/客户端/e2e；通知表尚不存在，无既有通知数据统计。

Preflight（2026-11-17）：`local-pg18` 的先前环境记录使用 5433；本次 `pg_isready` 不可用（PostgreSQL 客户端不在 PATH），槽位服务状态与端口需通过仓库测试设施再次确认。项目进程管理器无已登记服务；`--env-keys` 报无可检查配置，按接力探针由用户手动核对，本次不把配置项记作通过；未读取 `.env*`。API 测试负责启动既有隔离槽位，尚未连接数据库或启动应用。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 通知持久化与共享 API 契约 | `done` | 无，机器门：notifications 表及索引/迁移、列表与分页/未读数/已读请求响应契约 |
| T02 | 本人通知 API、隔离与已读操作 | `done` | AC-02、AC-03、AC-06：列表最多 50 条、游标与未读过滤、计数、单条/全部已读、本人及跨商家不可见 |
| T03 | 七类事件与业务事务原子发布 | `done` | AC-01、AC-05、AC-06：各事件收件人、商家隔离、排除聊天发送者、业务事务原子性及无订阅者行为 |
| T04 | Web 顶栏入口与收件箱导航 | `done` | AC-04：未读角标、最近 20 条已读/未读、打开即标已读并跳转；notification e2e 通过 |
| T05 | 最终代码审查 | `done` | 全量测试、类型检查、lint、格式、构建及独立只读审查；storage 验签优先语义已确认并覆盖合法签名 traversal |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `pnpm --filter @libs/shared build`; `pnpm --filter @libs/shared typecheck`; `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/api exec drizzle-kit check`; changed-file ESLint/Prettier; `git diff --check` | `apps/api/drizzle/0018_fw036_notifications.sql`, `apps/api/drizzle/meta/0018_snapshot.json`, `packages/shared/src/contract/notifications.ts` | 通知表复合 `(org_id,user_id)` 外键、类型约束、按用户时间顺序与未读部分索引已生成；shared/API 类型、Drizzle 和格式检查通过。SQL 格式由 migration generator 管理，Prettier 未配置 SQL parser。 |
| T02 | failed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/notifications.test.ts` | `apps/api/drizzle/0018_fw036_notifications.sql` | 数据库迁移失败，未进入测试断言：既有 users 实际 schema 缺少 `(org_id,id)` 唯一约束，导致通知外键无法创建；下一次实验：为 users 补复合唯一约束并重生成当前未提交的 0018 迁移，再运行同一测试文件。 |
| T02 | failed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/notifications.test.ts` | `apps/api/src/tests/notifications.test.ts` | 修复唯一约束后迁移和播种通过，测试初始化登录时因夹具引用不存在的 `manager1@northbean.example` 返回 401；下一次实验：改用播种账号 `inspector+nb-002@northbean.example`，仅复跑该测试文件。 |
| T02 | passed | `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/notifications.test.ts` | `apps/api/src/tests/notifications.test.ts` | AC-02、AC-03、AC-06：3/3 通过；50/2 分页、未读过滤计数、幂等已读/全部已读、本人和跨商家 404。此前将登录返回的 `user.org.id` 误写为 `user.orgId`，导致 SQL 参数为空，错误推断缺少第二商家；已用共享 User 类型修复，复用既有“演示二号”，未新增夹具。测试通知已清理，会话撤销，应用与池关闭。 |
| T03 | passed | `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/tasks.test.ts src/tests/chat.test.ts src/tests/notifications.test.ts`; `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/notifications.test.ts` | `apps/api/src/services/notifications.ts`, `apps/api/src/tests/tasks.test.ts`, `apps/api/src/tests/chat.test.ts`, `apps/api/src/tests/notifications.test.ts` | AC-01、AC-05、AC-06：完整事件套件 22/22，通过新增无匹配收件人用例后 notifications 4/4。覆盖七类事件、AI/管理员打回、同店多店长与异店隔离、首次整单判定与后续改判、严重项、逾期、关闭 AI/重试耗尽、聊天排除作者及签名失败回滚；业务事务复用 PoolClient。聊天测试清理限定为本次创建的通知 ID。 |
| T04 | blocked | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/notifications.spec.ts`（额外授权的诊断运行） | `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/error-context.md` | AC-04 未通过。临时诊断输出：匹配数为 1；唯一按钮 `outerHTML` 是通知列表项，最近 `[role="dialog"]` 祖先为通知 Sheet 且 `data-state="open"`。因此没有页面外副本或重复渲染；原 locator 指向的正是 Sheet 中唯一按钮，但 Playwright `toBeVisible()` 仍判 hidden。诊断代码已移除；不改 locator、不做第四次运行，尚需查明 CSS/布局条件。 |
| T04 | blocked | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/notifications.spec.ts`（用户再次授权最多一次布局诊断） | `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/error-context.md`, `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/trace.zip` | 原文 `expect(locator).toBeVisible() failed`、`Expected: visible`、`Received: hidden`，Call log 14 次 `unexpected value "hidden"`。Sheet open 可见等待通过；按钮 rect 为 x=1296.8297119140625、y=182、width=0、height=412、right=left=x、bottom=594；disabled=false、visibility=visible、display=flex、inert=false、ariaHidden=false。直接确认按钮零宽，未证明动画为根因；未改 locator 或业务组件、未重复运行。临时等待和打印均已移除，停止于 T04。 |

| T04 | failed | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/notifications.spec.ts`（按用户要求只复跑一次） | `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/error-context.md` | viewport 1280×720；Sheet rect x=1279.8297、right=1295.8297、width=16，computed width/maxWidth 均为 16px。移除 `notification-inbox.tsx` 的 `w-full sm:max-w-md`，仅保留 `overflow-y-auto` 以使用 Sheet 默认宽度；复跑仍在 `toBeVisible()` 失败，未进入点击。零宽现象仍待查明；不再运行、不进入 T05。 |
| T04 | passed | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/notifications.spec.ts` | `tests/web/notifications.spec.ts`, `packages/tokens/tokens.css`, `apps/web/src/components/console/notification-inbox.tsx` | AC-04 1/1 通过。根因是 `tokens.css` 缺 Tailwind v4 `--container-*` 且 `--spacing-md` 抢先解析 `.max-w-md`，生成宽度为 16px；补齐官方 container 默认值并加 `--max-width-*` 映射后，恢复 Sheet 原 `w-full overflow-y-auto sm:max-w-md` class，Sheet 展开为 24rem，真人可见可点。 |
| T04 | failed | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/ui-foundation.spec.ts tests/web/users.spec.ts` | `tests/web-results/slot-1/ui-foundation-FW-016-AC-05-登录后五屏三宽截图/error-context.md`, `tests/web/users.spec.ts` | 既有样式基线 `ui-foundation` 在 queue 390px 页面横向溢出，与 token 修复前观察到的失败相同，失败位置在门店 `max-w-sm` 页面之前；`users.spec.ts` 3/3 通过（含“演示二号”）。此 FW-016 队列布局问题不改变 T04 结果，留给其归属单元处理。 |
| T05 | failed | `pnpm --filter @apps/api test`; `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts` | `apps/api/src/tests/contract.e2e.test.ts`, `apps/api/src/services/task-scheduler.ts`, `apps/api/drizzle/meta/_journal.json`, `apps/api/drizzle/meta/0018_snapshot.json`, `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/error-context.md`, `tests/web-results/slot-1/ui-foundation-FW-016-AC-05-登录后五屏三宽截图/error-context.md` | 通过：全 workspace 类型检查、根构建（含 Web/Vite）、`git diff --check`、`python scripts/validate_docs.py`。失败：API 171 passed/2 failed/3 skipped（契约路由数仍期望 50，实际 54；存储路径输入预期 400、实得 403）；lint 的 `task-scheduler.ts` 411 行超 400；format 检查两个 Drizzle JSON 元数据文件。Web 全量 33 passed/2 failed/1 skipped：通知用例定位器期待精确标签“通知，1 条未读”但未找到；只读槽位查询显示全套运行后总部用户有 54 条未读通知，证实共享槽位有通知状态污染，单文件测试 1/1 通过；FW-016 queue 390px 横向溢出（修复前已复现）。 |
| T05 | passed | 独立只读 Standards/Spec 审查：比较 `dbf4563` 到当前完整工作树，核对 `AGENTS.md`、`docs/howto/final-review.md`、FW-036 spec/plan 与所有新文件 | `docs/work/FW-036-notifications-backend/spec.md`, `docs/work/FW-036-notifications-backend/plan.md` | 两个独立审查视角均无额外 finding：Standards 无可行动规范违规或新增 smell；Spec 未发现 AC-01～06 漏项、越界或实现偏差。门禁失败仍阻塞本单元 verified/归档。 |
| T01 | passed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/contract.e2e.test.ts` | `packages/shared/src/contract/index.ts`, `apps/api/src/tests/contract.e2e.test.ts` | 完整路由表检查通过 54/54；四条 notifications 契约定义此前已存在于 shared，本次将旧总数期望从 50 同步为 54。 |
| T03 | passed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/tasks.test.ts src/tests/notifications.test.ts` | `apps/api/src/services/notifications.ts`, `apps/api/src/services/task-scheduler.ts`, `apps/api/src/services/task-decisions.ts` | 20/20 通过。逾期状态更新与通知发布整体移入 notifications helper 事务；scheduler 委托调用；首次整单判定通知改由 helper 发布，事务与收件人行为不变。 |
| T04 | passed | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts` | `tests/web/notifications.spec.ts`, `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/error-context.md` | 全量 Web 34 passed、1 failed、1 skipped；通知用例通过。其 beforeEach 先删除 HQ 用户已有通知，再插入单条测试通知，保留“通知，1 条未读”断言；唯一失败是明确排除的 FW-016 queue 390px 横向溢出。 |
| T05 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build` | `apps/api/drizzle/meta/_journal.json`, `apps/api/drizzle/meta/0018_snapshot.json`, `apps/api/src/services/task-scheduler.ts` | 类型、lint、格式与根构建均通过。两个 Drizzle 元数据文件已用 Prettier 定点格式化；任务通知抽离后 scheduler 低于 400 行。 |
| T05 | failed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test` | `apps/api/src/tests/contract.e2e.test.ts`, `apps/api/src/controllers/storage.controller.ts`, `apps/api/src/storage/signed-url.ts` | API 全量 172 passed、1 failed、3 skipped。唯一失败用例 `inspection contract API > exposes every existing contracted endpoint with its response schema` 请求 `/storage/..%2Foutside.jpg`，断言 400/`VALIDATION_FAILED`，实得 403/`FORBIDDEN`。原因是 StorageController 先验签；无 `expires`/`signature` 时 `verifyStorageSignedUrl` 先抛 403，尚未执行越界路径校验。该 storage 路由与实现没有 FW-036 差异，行为选择待用户决定。 |
| T04 | passed | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts` | `tests/web/notifications.spec.ts`, `tests/web-results/slot-1/notifications-FW-036-AC-04-通知面板显示未读并标记后跳转任务详情/error-context.md` | 全量 Web 34 passed、1 failed、1 skipped；通知用例通过。beforeEach 清理 HQ 通知前事务快照既有行，afterEach 事务删除本次通知并恢复旧行；created_at/read_at 使用文本保留 PostgreSQL 微秒。唯一失败是已排除的 FW-016 queue 390px 横向溢出。 |
| T05 | passed | 独立 Standards/Spec 增量复核：复核通知 e2e 数据隔离 finding 的修复 | `tests/web/notifications.spec.ts` | 两位独立审查者确认原通知删除/微秒精度 finding 已关闭：事务回滚保护清理与恢复，时间戳按原精度保留。FW-016 溢出与该 finding 无关。 |
| T05 | passed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test` | `apps/api/src/tests/contract.e2e.test.ts`, `apps/api/src/services/notifications.ts`, `apps/api/src/services/task-scheduler.ts`, `apps/api/drizzle/meta/_journal.json`, `apps/api/drizzle/meta/0018_snapshot.json` | 全量 API 26 个文件通过、2 个 smoke 文件跳过；173 passed、3 skipped。旧无签名 `/storage/..%2Foutside.jpg` 断言改为 403，保留验签优先；新合法签名 `../outside.jpg` 请求经签名校验后仍由本地存储路径检查返回 400/`VALIDATION_FAILED`，未改 StorageController。契约路由 54/54；任务通知已抽离；格式修复已验证。 |
| T05 | passed | `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts` | `tests/web/notifications.spec.ts`, `tests/web/ui-foundation.spec.ts`, `tests/web-results/slot-1/ui-foundation-FW-016-AC-05-登录后五屏三宽截图/error-context.md` | 全量 Web 34 passed、1 skipped、1 failed；通知用例通过且 beforeEach 清理 HQ 用户历史通知后插入固定单条通知。唯一失败为已明确留给 FW-016 的 queue 390px 横向溢出。 |
| T05 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `python scripts/validate_docs.py`; 独立 Standards/Spec 审查与增量复核 | `docs/work/FW-036-notifications-backend/spec.md`, `apps/api/src/tests/contract.e2e.test.ts`, `tests/web/notifications.spec.ts` | 类型、lint、格式、构建及文档门通过；两个独立审查视角无 finding，契约 storage 增量复核确认合法签名 traversal 仍被拒绝。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 用户提交 `da8c2e7` 已将 AC-01 修订为七类，按七项清单实现；“涉及的当前事实”省略 `docs/` 前缀，按仓库唯一权威目录 `docs/specs/` Promote。
- 首次整单判定仅在首次结算发给店长；管理员改变已有条目结论时另发改判通知。
- 2026-11-17 用户纠正 T02 停止依据后继续：第二商家已存在，失败源于测试响应解码错误；复用既有种子，不新增商家夹具。
- 用户 2026-11-17 授权在原两次修复外增加一次诊断尝试，并明确失败后停止、不做第四次。该次 count/DOM 证据推翻“隐藏副本”假设：唯一匹配位于打开的通知 Sheet；可见性失败原因尚未查明。临时诊断语句已从测试删除，未改 T01～T03。
- 用户再次授权最多一次 Sheet 布局诊断和一次修复后复跑。Sheet 为 16px 宽且右越视口；仅移除 `notification-inbox.tsx` 宽度类后仍失败，当时暂停 T04。用户随后指出 Tailwind v4 container token 缺失并授权补齐；T04 最终通过，具体证据见后续 passed 行。
- 2026-11-17 用户指出 Tailwind v4 `@theme` 缺少官方 `--container-*` 默认值。构建 CSS 进一步证实同后缀 `--spacing-*` 优先于 `--container-*`：例如 `.max-w-md` 被生成成 `var(--fw-space-md)`，而 `max-w-2xl/3xl` 已使用容器值；保留 spacing 语义并添加 `--max-width-*` 到对应 container token 的映射。
- 2026-11-17 用户确认保留 StorageController 验签优先；无签名 traversal 返回 403。新合法签名 traversal 请求通过签名校验后仍被本地存储路径边界以 400 拒绝，未发现路径穿越漏洞。
- FW-016 队列 390px 横向溢出在本次 token 修复前已复现，最终全量 Web 仍复现；用户要求本单元不修，归档时转交 FW-016。全量 Web 首轮还暴露出通知用例依赖干净槽位未读数；已在测试前清理 HQ 通知并隔离恢复旧数据。
