# API 共用数据库连接池 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：全部完成
- 阻塞：无
- 下一步：无

Preflight：动 `apps/api/src`（`auth.ts` 是 hardline）和新增的 API 测试；不动 `apps/web`、`apps/mobile`、契约、`schema.ts`、迁移、`package.json`、锁文件、`scripts/`、`tests/`。全程用槽位 1，不占 3018～3020，同一槽位的套件串行跑。开工前记下 `git rev-parse HEAD`。

## 任务表

| ID  | 任务                                                 | 状态   | 交付的 AC 与证据                                                                          |
| --- | ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| T01 | 拆前基线：快照、并发测试先写好并记下改动前的连接峰值 | `done` | 无，基线：快照文件路径、改动前连接峰值、各套件通过数                                      |
| T02 | 连接池 provider 与生命周期；守卫和控制器改为注入     | `done` | AC-01、AC-02、AC-04、AC-05；API 测试、契约 e2e                                            |
| T03 | 行为不变的回归                                       | `done` | AC-03（拆后快照逐字节相同；Web e2e、`e2e:mobile`、`e2e:cors`、`e2e:demo`、`e2e:demo-ui`） |
| T04 | 最终代码审查（独立 Subagent）                        | `done` | 派审查前跑全量门禁；审查记录                                                              |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                                                      | artifact                                                                                                              | 备注                                                                                                                                                                                                         |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T01  | passed | `git rev-parse HEAD`                                                                                                                                                         | `docs/work/FW-010-shared-db-pool/plan.md`                                                                             | 开工 HEAD：`3e5c9633efab0e9462a4b7465a012179db8b161f`；工作区初始干净，文档校验通过。                                                                                                                        |
| T01  | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/contract.e2e.test.ts -t "keeps API connections within the default pool limit under concurrent requests"`                      | `apps/api/src/contract.e2e.test.ts`                                                                                   | 测试先写后跑；50 个受保护请求全部 200，改动前 `pg_stat_activity` 连接峰值 50，<=10 断言按要求作为拆前对照失败。首次采样过滤默认空 `application_name` 得到无效峰值 0，修正为按槽位库名并排除监控 PID 后重跑。 |
| T01  | passed | `FW_SLOT=1 node --env-file=apps/api/.env.development scripts/api-snapshot.mjs docs/work/FW-010-shared-db-pool/evidence/api-before.json`                                      | `docs/work/FW-010-shared-db-pool/evidence/api-before.json`                                                            | 拆前快照 66 次请求、13 路由 × 3 角色；finally 重置槽位库、存储并清理 API。                                                                                                                                   |
| T01  | failed | `FW_SLOT=1 pnpm --filter @apps/api test`                                                                                                                                     | `apps/api/src/contract.e2e.test.ts`                                                                                   | 拆前全量 API 28/29、session 20/20、seed 4/4；唯一失败为新 AC-04 连接峰值 50 超过 10，属预期对照，不改断言。                                                                                                  |
| T01  | passed | `FW_SLOT=1 pnpm e2e`                                                                                                                                                         | `tests/e2e/slot-facility.spec.ts`                                                                                     | 槽位设施 1/1。                                                                                                                                                                                               |
| T01  | passed | `FW_SLOT=1; NO_PROXY=127.0.0.1,localhost; no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts`                                          | `tests/web/console.spec.ts`                                                                                           | Web e2e 7/7。                                                                                                                                                                                                |
| T01  | passed | `FW_SLOT=1 pnpm e2e:mobile`                                                                                                                                                  | `tests/mobile/mobile-inspection.spec.ts`                                                                              | e2e:mobile 9/9。                                                                                                                                                                                             |
| T01  | passed | `FW_SLOT=1 pnpm e2e:cors`                                                                                                                                                    | `tests/cors.spec.ts`                                                                                                  | e2e:cors 3/3。                                                                                                                                                                                               |
| T01  | passed | `FW_SLOT=1 pnpm e2e:demo`                                                                                                                                                    | `scripts/demo-chain.mjs`                                                                                              | 演示链退出码 0。                                                                                                                                                                                             |
| T01  | passed | `FW_SLOT=1; NO_PROXY=127.0.0.1,localhost; no_proxy=127.0.0.1,localhost pnpm e2e:demo-ui`                                                                                     | `tests/demo/inspection-chain.spec.ts`                                                                                 | e2e:demo-ui 1/1。所有自启动服务结束后 3018～3020、3110～3112 均无监听进程。                                                                                                                                  |
| T02  | passed | `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 pnpm --filter @apps/api test -- src/contract.e2e.test.ts`; `FW_SLOT=1 pnpm --filter @apps/api test`                          | `apps/api/src/contract.e2e.test.ts`                                                                                   | 类型检查通过；契约测试 6/6、API 全套 30/30；AC-04 峰值 10（拆前对照 50）；覆盖独立 Nest app 池和 app.close 后连接为 0。                                                                                      |
| T02  | passed | `rg -n "createPool\\(                                                                                                                                                        | pool\\.end\\(" apps/api/src --glob "!**/\*.test.ts" --glob "!**/*.e2e.test.ts"`                                       | `apps/api/src`                                                                                                                                                                                               | AC-02：命中全部位于 `db/` 下，包含生命周期 provider、migrate、seed 和 client；非 `db/` 业务代码无命中。3018～3020、3110～3112 无监听。 |
| T03  | passed | `FW_SLOT=1 node --env-file=apps/api/.env.development scripts/api-snapshot.mjs docs/work/FW-010-shared-db-pool/evidence/api-after.json`; `Get-FileHash ... -Algorithm SHA256` | `docs/work/FW-010-shared-db-pool/evidence/api-before.json`; `docs/work/FW-010-shared-db-pool/evidence/api-after.json` | 拆后快照 66 次请求；逐字节相同，SHA256 `F2C25A2CDC6BEF7752DFFB9E296055E3629EA9BD9F2577E216E7406AE325FDCB`。                                                                                                  |
| T03  | passed | `FW_SLOT=1; NO_PROXY=127.0.0.1,localhost; no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts`                                          | `tests/web/console.spec.ts`                                                                                           | 拆后 Web e2e 7/7。                                                                                                                                                                                           |
| T03  | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts -g "NB-002 打回单显示主管意见并可重新提交"`; `FW_SLOT=1 pnpm e2e:mobile`                           | `tests/mobile/mobile-inspection.spec.ts`                                                                              | 原定位曾在整套运行中两次产生标题/tab 歧义；用户扩展范围后改为精确的 tab role/name 定位，产品断言未放宽。回修后隔离用例 1/1、全套 9/9。                                                                       |
| T03  | passed | `FW_SLOT=1 pnpm e2e:cors`; `FW_SLOT=1 pnpm e2e:demo`; `FW_SLOT=1; NO_PROXY=127.0.0.1,localhost; no_proxy=127.0.0.1,localhost pnpm e2e:demo-ui`                               | `tests/cors.spec.ts`; `scripts/demo-chain.mjs`; `tests/demo/inspection-chain.spec.ts`                                 | CORS 3/3；演示链退出码 0；demo-ui 1/1。                                                                                                                                                                      |
| T04  | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `FW_SLOT=1 pnpm --filter @apps/api test`; `FW_SLOT=1 pnpm e2e`                                             | workspace；`apps/api/src/contract.e2e.test.ts`; `tests/e2e/slot-facility.spec.ts`                                     | 类型、lint、格式、构建通过；API 30/30；槽位设施 1/1。Web/CORS/demo/demo-ui/mobile 全套结果见 T03，均通过。                                                                                                   |
| T04  | passed | 独立 Subagent：审查 `3e5c9633efab0e9462a4b7465a012179db8b161f..37f61c84f5fb51e6dd38eb8918fa2b58ad1d864a`，按 `docs/howto/final-review.md` 七失败域检查                       | FW-010 完整差异                                                                                                       | 独立 Subagent；无代码 finding。七域结论及 AC-03 遗留风险见审查报告；审查者核对 `git diff --check` 通过。                                                                                                     |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期       | 反馈         | 改动                                                                    | 提交      |
| ---------- | ------------ | ----------------------------------------------------------------------- | --------- |
| 2026-10-28 | “扩展，继续” | 将 NB-002 登录成功断言改为定位 `tab[name="今日待巡"]`，保留其余巡检断言 | `66172ac` |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-28 用户采纳建议 1（并发连接数测试，AC-04），不采纳建议 2（连接池大小做成环境变量配置）。
- 2026-10-28 连接池用 Nest provider 随应用实例创建与关闭，不用模块级单例：API 测试在同一进程里多次 `createNestApplication`，单例会在实例之间泄漏连接。
- 2026-10-28 已解决的测试问题：NB-002 用例的通用文本定位会同时命中首页标题和同名 tab；用户扩展范围后改为按 tab role/name 定位，其他断言未放宽。
- 2026-10-28 串行基线人工触点：开对话 ×1；其余人工触点 0。
- 2026-10-28 用户扩展测试范围，授权最小化修正 NB-002 用例定位；修复后 `e2e:mobile` 全套通过。
- 卡在哪一步：AC 已验证并 Promote，归档收尾的本地证据清理受命令策略阻止，归档门禁尚未运行。
- 要用户定什么：请手动删除本单的 `docs/work/FW-010-shared-db-pool/evidence/` 目录，并告知清理完成。
- 可选项和倾向：手动清理该本地证据目录后继续归档（倾向，满足项目归档步骤）；或暂时保留已验证、尚 active 的工作单元。
- 串行基线：按 [试行记录](../../parallel-trial.md)「值不值」的口径分类记人工触点：开对话、批审批、答停下、传话（含用户回到 Claude 会话转述进度）、人工验收、排障，每次在这里加一行；归档时汇总进试行记录表，和 FW-008、FW-009 那两行按类别对照。
- 2026-10-28 归档收尾（由 Claude 在用户授权下完成）：删除本地 `evidence/`；Codex 两次 `Remove-Item` 被命令策略拒绝，原因未确认。
- 2026-10-28 串行基线人工触点更正为 4 次：开对话 1；答停下 2（AC-03 授权改 NB-002 定位、删除 evidence 的阻塞）；传话 1（用户回到 Claude 会话报"已完成"）。原记 1 次漏了用户答复停下和回 Claude 会话两类。
