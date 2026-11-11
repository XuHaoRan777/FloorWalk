# 任务与条目状态机 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无（T06 完成）
- 阻塞：无
- 下一步：已于 2026-11-12 Promote 并随接力线归档。

Preflight：范围为 shared 契约、API 任务生成/上传/判定、版本化迁移、种子、Web 逐条审核与 API/Web e2e；无新增配置键或依赖。迁移测试只读统计开发库种子：12 sites、14 users、1 template、8 template_items、18 inspections、144 inspection_items、36 evidence、16 reviews、0 sessions、2 chat_messages；开发库不写入，迁移测试只写入并恢复 `floorwalk_e2e_1` 和对应槽位存储。本单元新增结构并保留已有历史巡检记录。

Node `24.19.0`、pnpm `11.21.0`；`local-pg18` 运行中且宿主 5433 可连接，`proc.mjs status` 为空，3018–3020 与 3110–3132 无监听。本地配置沿用接力探针的用户手动核对结果；未读取环境文件。

## 任务表

| ID  | 任务                                                      | 状态          | 交付的 AC 与证据           |
| --- | --------------------------------------------------------- | ------------- | -------------------------- |
| T01 | 新增每日任务/巡检关联、条目判定与审计持久化结构及共享契约 | `done`        | 无，机器门                 |
| T02 | 按日程幂等生成任务，并同步当天未开始任务的日程变更        | `done`        | AC-01                      |
| T03 | 实现店长逐条上传、时间窗、并发首传、自动提交与逾期        | `done`        | AC-02、AC-03、AC-04、AC-05 |
| T04 | 实现管理员逐条判定、截止自动判定、锁分和改判              | `done`        | AC-06、AC-07、AC-08、AC-09 |
| T05 | 完成 Web 逐条审核闭环，移除旧整单入口并更新历史种子       | `done`        | AC-10、AC-11               |
| T06 | 最终代码审查（全量机器门与收尾）                          | `done`        | 最终核对全部已取证 AC      |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                                                                                                       | artifact                                                                                                                                       | 备注                                                                                                                                                                        |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `pnpm --filter @apps/api exec drizzle-kit generate --name fw028_task_state_machine`；`pnpm --filter @libs/shared build`；`pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test src/db/migrate.test.ts` | `apps/api/drizzle/0010_fw028_task_state_machine.sql`；`packages/shared/src/contract/tasks.ts`                                                  | Drizzle 再次生成无 schema 漂移；迁移测试 3/3 通过，验证空库、开发种子只读副本和槽位数据的前向迁移；开发库未写入，测试槽位恢复完成。                                         |
| T02  | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/schedules.test.ts`；`pnpm --filter @apps/api typecheck`                                                                                                                           | `apps/api/src/task-scheduler.ts`；`apps/api/src/schedules.test.ts`                                                                             | 8/8 通过；固定日期验证幂等生成、当天方案变更、跳过区间增删、取消选用及保留已开始任务；类型检查通过。                                                                        |
| T03  | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/tasks.test.ts`；`pnpm --filter @apps/api typecheck`；`pnpm --filter @libs/shared build`                                                                                           | `apps/api/src/evidence.controller.ts`；`apps/api/src/task-scheduler.ts`；`apps/api/src/tasks.test.ts`；`packages/shared/src/contract/tasks.ts` | 5/5 通过；验证并发首传只创建一单、同店不同店长逐项覆盖、照片整组替换、照片数/零照片备注、异店 403、开始前一小时边界、逾期和打回后一小时重传；测试槽位数据与对象存储已清理。 |
| T04  | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/tasks.test.ts`；`pnpm --filter @apps/api typecheck`                                                                                                                               | `apps/api/src/task-decisions.ts`；`apps/api/src/task-review.controller.ts`；`apps/api/src/tasks.test.ts`                                       | 5/5 通过；验证首结论和首自评、截止自动补建空巡检并判未完成、截止分数及整单结论、打回等待与最晚强制判定、逐次改判审计和分数重算。                                            |
| T05  | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/chat.spec.ts tests/web/console.spec.ts`；`FW_SLOT=3 pnpm e2e:demo-ui`；`FW_SLOT=1 pnpm e2e:mobile`；`FW_SLOT=1 pnpm --filter @apps/api test src/chat.test.ts src/contract.e2e.test.ts`；`pnpm --filter @apps/web typecheck`；`pnpm lint`；`pnpm format:check` | `apps/web/src/pages/console.tsx`；`packages/shared/src/contract/index.ts`；`apps/api/src/chat.test.ts`；`tests/web/chat.spec.ts`；`tests/demo/inspection-chain.spec.ts` | Web 聊天与审核 7/7、Demo UI 2/2、Mobile 全套 18/18、API 授权 3/3、契约 E2E 15/15；管理员聊天只读控件与 POST 403 均已验证，店长发信后管理员恢复前台可补拉。修复测试中旧登录参数、旧建单夹具及过时角色/审核历史断言；槽位套件结束后服务退出。 |
| T06  | passed | `pnpm typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm --filter @apps/mobile check`；`pnpm build`；`FW_SLOT=1 pnpm --filter @apps/api test`；`FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts`；`FW_SLOT=1 pnpm e2e:mobile`；`pnpm e2e:demo-ui`；`FW_SLOT=1 pnpm e2e:demo`；`FW_SLOT=1 pnpm e2e tests/e2e/g03.integration.spec.ts`；`python scripts/validate_docs.py`；独立最终审查 | `apps/api/src/task-decisions.ts`；`apps/api/src/task-review-query.ts`；`apps/api/drizzle/0012_fw028_nullable_inspector.sql`；`docs/specs/inspection.md` | 全量类型、lint、格式、Mobile 配套检查、构建和文档校验通过；API 150/150（3 跳过）、Web 27/27（1 跳过）、Mobile 18/18、Demo UI 2/2、Demo API 链及 G03 1/1 通过。独立 Subagent 按 `docs/howto/final-review.md` 七个失败域审查，无 finding；注明审核队列全量查询随历史数据增长有负载风险，当前不阻断。G03 运行后 API 槽位已停止。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 交接

<!-- 方式 A 机器门过后写这两行，方式 B 删掉本节。不写逐条验收脚本。第一行写实现与讨论时说定的不同之处（AC 改动、没做的、做法变了的），没有写"无"；第二行在讨论时的功能点之外，只列机器验不了的（真钱、真机、真回调），没有写"无"。 -->

- 和讨论时不一样的：
- 需要你测的：

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

| 日期       | 决策或偏差                                                                               | 影响                                                     |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2026-11-11 | 用户确认：全程未上传任务在截止自动判定时由系统补建无上传巡检记录，`inspectorId` 允许为空 | AC-02 已澄清；新增前向迁移移除 `inspector_id` 的非空限制 |
| 2026-11-11 | 用户确认：管理员聊天按 `chat.md` 设为只读，Web 移除发送控件，API 写入返回 403            | AC-10；店长发送、管理员接收用于 Web 与 Demo 往返验证     |
