# 日程方案与门店日程安排 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：T05
- 阻塞：无
- 下一步：已于 2026-11-12 Promote 并随接力线归档。

Preflight：变更范围为 shared 日程契约、API schema/迁移/控制器与测试、Web 管理页及 e2e；无新增配置键或依赖。只新增日程配置结构，不迁移既有业务数据、不写开发库；测试使用已授权的 e2e 槽位并清理夹具。Node 24.19.0、pnpm 11.21.0；`local-pg18` 运行中，`proc.mjs status` 为空，3018–3020 与 3110–3132 无监听；本地配置按接力探针由用户手动核对，本轮未读取环境文件。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 新增日程持久化结构、版本化迁移和共享契约 | `done` | 无，机器门 |
| T02 | 实现日程方案 API 与纯计算 | `done` | AC-01、AC-04 |
| T03 | 实现门店选用与跳过日期 API | `done` | AC-02、AC-03、AC-05 |
| T04 | 完成 Web 日程管理与端到端流程 | `done` | AC-06 |
| T05 | 最终代码审查、全量机器门与收尾 | `blocked` | 独立审查 1 项 P2 待修，等待夏令时策略 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `pnpm --filter @apps/api exec drizzle-kit generate --name fw027_schedules`；`pnpm --filter @libs/shared build`；shared/API `typecheck`；`git diff --check` | `apps/api/drizzle/0009_fw027_schedules.sql`；`packages/shared/src/contract/schedules.ts` | 5 张日程配置表与租户复合外键；新迁移先建引用目标唯一约束再加外键。未改历史迁移、未写开发库；实际迁移执行随 T02 槽位 API 测试取证。 |
| T02 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/schedules.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/schedules.test.ts` | AC-01：2 项通过，含七天、名称租户内唯一、分钟精度、重叠、重复模板、1 分钟与 24 小时、增改查及非法周结构。beforeAll 已执行新迁移；afterAll 事务删除测试商家及从属数据，并断言商家残留为 0。 |
| T02 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/schedule-plan.test.ts` | `apps/api/src/schedule-plan.test.ts` | AC-04：4 项通过，覆盖跨零点归开始日、含两端/单日/重叠跳过区间、停用天/店/未选方案、UTC/上海/加德满都/纽约跨夏令时；调用不修改输入，无写库。夏令时缺失时刻的边界经最终审查提出，用户明确决定不做夏令时适配，按该指示不扩展 AC 或实现。 |
| T03 | failed | `FW_SLOT=1 pnpm --filter @apps/api test src/schedules.test.ts`；API `typecheck` | `apps/api/src/schedules.test.ts` | 首跑 6/7 通过；模板删除确实被 `schedule_tasks_template_fk` 阻止，但 PostgreSQL 18 的 RESTRICT 返回 23001，测试误写 23503；另有测试数组缺显式类型。修正测试预期和类型后只复跑该文件与类型检查。afterAll 已清理全部夹具。 |
| T03 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/schedules.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/schedules.test.ts` | AC-02：批量选用、替换为另一方案、单店和批量清空通过；重复门店 ID 去重，数据库复合主键保证一家店只有一份方案。afterAll 事务清理全部测试商家及从属数据，残留商家为 0。 |
| T03 | passed | 同上 | `apps/api/src/schedules.test.ts` | AC-03：多店添加含备注区间、单日与重叠区间、删除后保留其他区间、非法日期与逆序拒绝通过；含两端计算证据见 AC-04。测试数据同上清理。 |
| T03 | passed | 同上 | `apps/api/src/schedules.test.ts` | AC-05：7 项测试全绿；选用中方案可改、删除 409，引用模板删除/跨商家迁移被指定外键阻止；8 条管理 API 对 store_manager 均 403，跨商家方案/模板/店/跳过区间 404，混合批量不部分写入。测试数据同上清理。 |
| T04 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/schedules.spec.ts --workers=1` | `tests/web/schedules.spec.ts`；`docs/work/FW-027-schedules/evidence/schedule.png`；`docs/work/FW-027-schedules/evidence/site-schedules.png` | AC-06：1/1 通过；浏览器 `/console` 内「日程方案」显示周一 23:30～01:15 与「次日结束」，七天默认启用；两店所选方案一致，仅第一店显示「2026-11-16 至 2026-11-18 / 门店装修」，刷新重进两页仍保留。首跑下拉框精确 label 超时，改用角色名称后通过。afterAll 事务清理方案、两店及从属配置，断言残留为 0。 |
| T04 | failed | `pnpm lint`；`pnpm format:check`；`pnpm --filter @apps/api exec drizzle-kit generate --name fw027_schema_split` | `apps/api/src/db/schedules.schema.ts` | schema 超 400 行、生成 JSON 未格式化，已拆出日程表定义并格式化；Drizzle 的 CJS 加载器不解析源码 .js 引用，改用 .ts 引用并启用编译时扩展名重写。下一步定向复验迁移生成无差异与类型检查。 |
| T05 | passed | `pnpm typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm build`；`python scripts/validate_docs.py`；`git diff --check`；`pnpm --filter @apps/api exec drizzle-kit generate --name fw027_schema_split` | `apps/api/src/db/schedules.schema.ts`；`apps/api/tsconfig.json` | shared/API/Web/Mobile 类型、lint、格式及构建通过；文档 0 问题，迁移生成确认无 schema 差异。Web 构建仅有既有体积提示。 |
| T05 | failed | `FW_SLOT=1 pnpm --filter @apps/api test` | `apps/api/src/contract.e2e.test.ts` | 140 passed、3 failed、3 skipped；失败均因中央契约测试未登记新增 8 条路由的总数、角色拒绝和成功响应覆盖。其余 API 文件通过。下一步仅补齐中央测试，跑该文件与 API 类型检查；本轮夹具已按各套件 afterAll 清理。 |
| T05 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/contract.e2e.test.ts`；`pnpm --filter @apps/api typecheck`；定向 Prettier 检查 | `apps/api/src/contract.e2e.test.ts` | 中央契约 15/15 通过；46 条路由的响应 schema 与拒绝角色覆盖齐全。新增日程、选用、区间夹具正常路径删除，afterAll 事务兜底清理。本轮未重复其他已通过 API 套件。 |
| T05 | failed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts --workers=1` | `tests/web/` | 11 passed、19 failed、1 skipped。日程、注册/验证码/找回和店长账号用例通过；2 个失败由新增侧栏导致「门店」模糊定位，已改精确匹配并定向复验。其余 17 个来自未改动的 5 份旧测试：chat 1、console 8、protocol 4、site-supervisors 3、ui-foundation 1，均停在旧 email 登录字段/「邮箱」标签或标签歧义；无法据此证明旧业务回归通过。FW-027 测试 afterAll 事务清理夹具并断言残留 0。 |
| T05 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts --workers=1`；`pnpm --filter @apps/web typecheck`；`pnpm exec prettier --check tests/web/admin.spec.ts` | `tests/web/admin.spec.ts` | 6/6 通过；两处「门店」按钮改 exact，不改变行为断言，新增侧栏造成的回归已消除；门店、模板、审核详情、错误提示与看板用例均通过。afterAll 清理本文件创建的门店、模板和标准。 |
| T05 | passed | `node scripts/dev/proc.mjs status`；`Get-NetTCPConnection -State Listen`（仅筛选 3018–3020、3110–3132） | `scripts/dev/proc.mjs` | Playwright 启动的服务已退出；项目进程登记为空，开发及三个槽位端口无监听。 |
| T05 | passed | 依 `docs/howto/final-review.md` 审查 HEAD `feaa8c7` 至当前全部 tracked diff 与 13 个新增文件；`python scripts/validate_docs.py`；`git diff --check` | `docs/work/FW-027-schedules/plan.md` | 独立 Subagent 完成七失败域审查，发现纽约春季跳时缺失端点会令窗口逆序，其他域无确定 finding。用户理解说明后明确决定不做任何夏令时适配、不考虑该边界；按用户最新决定保留实现与 AC，不做回修。八条路由 403/跨商家 404 有真实测试证据。文档校验 0 问题、差异检查通过。审查只运行一次。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-11-11：全量 Web 回归发现 5 份旧认证/角色测试（`chat.spec.ts`、`console.spec.ts`、`protocol.spec.ts`、`site-supervisors.spec.ts`、`ui-foundation.spec.ts`）17 项仍依赖 `email` 登录字段、「邮箱」标签和已移除的 `supervisor`；这些文件相对起始 HEAD 无改动，失败发生在日程功能之前。本单元不改这些旧行为断言；新增侧栏造成的 `admin.spec.ts` 两处「门店」模糊定位改为精确匹配，定向复验。后续应按现行两角色契约整理旧回归测试，避免持续报红掩盖真实回归。
- 2026-11-11 用户决定：针对最终审查提出的夏令时缺失时刻边界，用户明确要求“不做任何‘令时’适配”“不用考虑这条”；不调整计算、不扩展规格，按用户决定接受该边界，不再作为阻塞。
