# 管理员审核与改判（Web） - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：无（T01～T05 已完成）
- 阻塞：无
- 已交付：待人工/今天已判定分组、逐条附理由打回与改判、失败理由/照片展示、顶栏待处理计数，完整 Web 链与权限边界已取证
- 下一步：本地提交并自动接力 FW-032；本单元保持 active，线尾统一归档

- Preflight：改动 shared contract、API 队列查询/审核审计、Web 控制台与对应测试；新增可空的打回理由列，不回填既有记录。
- Preflight：FW-030 提交 `4bee580` 已在当前分支；其 AI 队列实现与共享审核契约文件存在。当前工作区干净。
- Preflight：Node 24.19.0、pnpm 11.21.0 可用；`local-pg18` 运行并发布 5433；应用及测试槽位端口未监听。`proc.mjs status` 有一个已退出的 API 注册记录（pid 不存活）。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 按任务分组呈现待人工与今日已判定队列，显示模板、提交时间和理由 | `done` | AC-01 |
| T02 | 打回时收集并记录理由，展示逐条审核信息与改判后的分数/结论 | `done` | AC-02 |
| T03 | 顶栏显示待我处理任务数并按 10 秒刷新 | `done` | AC-04 |
| T04 | 验证假模型失败到管理员判定、改判及分数变化的完整 Web 流程 | `done` | AC-03 |
| T05 | 最终代码审查 | `done` | AC-01、AC-02、AC-03、AC-04 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | `passed` | `FW_SLOT=1 pnpm --filter @apps/api test -- src/tests/tasks.test.ts`; `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/task-review.spec.ts`; API/Web typecheck | `apps/api/src/queries/task-review-query.ts`; `apps/web/src/components/console/queue-view.tsx`; `apps/web/src/components/console/review-detail.tsx`; `apps/api/src/tests/tasks.test.ts`; `tests/web/task-review.spec.ts` | API 16/16、Web 1/1；首轮夹具问题已修正后通过。T04 补存 AI 重试耗尽的失败理由后重取：队列与详情均显示「AI 调用失败，请人工审核。」，照片 naturalWidth=1。审查修复后重取 API 16/16：关闭 AI 上传后再启用，原条目仍可人工判定。 |
| T02 | `passed` | `FW_SLOT=1 pnpm --filter @apps/api test -- src/tests/tasks.test.ts`; `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/task-review.spec.ts`; API/Web typecheck | `apps/api/drizzle/0016_fw031_rework_reason.sql`; `apps/api/src/tests/tasks.test.ts`; `tests/web/task-review.spec.ts` | API 16/16、Web 1/1；打回必须填写理由，审计落库与刷新后回显通过；沿用操作人、时间、前后结论验证；50→100 分与整单结论重算、宽限期后禁止打回通过。测试夹具在 finally 清理，存储由既有清理逻辑回收。 |
| T03 | `passed` | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/task-review.spec.ts`; Web typecheck；受影响 Web 文件 ESLint | `apps/web/src/components/console/use-review-queue.ts`; `apps/web/src/pages/console.tsx`; `tests/web/task-review.spec.ts` | Web 1/1；停留在总部看板时，10 秒轮询将新任务计数 +1；同一任务的两个条目只计一次，判完后恢复原计数。审核后主动刷新，窗口聚焦也刷新；旧请求和卸载回调不会覆盖新数据。 |
| T04 | `passed` | `FW_SLOT=1 pnpm --filter @apps/api test -- src/tests/tasks.test.ts src/tests/contract.e2e.test.ts`（分次运行）；`FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/task-review.spec.ts`；API/Web typecheck | `tests/e2e/fake-ai-failure.mjs`; `tests/web/task-review.spec.ts`; `apps/api/src/services/ai-review-queue.ts` | API 16+15/31、Web 1/1（22.5 秒）；真实队列各调用假模型 4 次后入待人工，经 Web 判通过→今天已判定→改判 100→50→100；无登录 401、店长 403、跨商家详情/判定 404 且不进入队列。finally 删除本任务上传文件、审核队列、审计及业务夹具，未新增配置键或生产失败开关。 |
| T05 | `passed` | `FW_SLOT=1 pnpm --filter @apps/api test`; `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts`; `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `python scripts/validate_docs.py`; `git diff --check`; 独立 Subagent 最终审查 | `apps/api/src/tests/tasks.test.ts`; `tests/web/task-review.spec.ts`; `apps/api/drizzle/meta/0016_snapshot.json`; `apps/api/src/queries/task-review-query.ts` | 完整 API 163 passed、3 skipped（外部真实服务探针）；完整 Web 27 passed、1 skipped；全模块类型、lint、格式、API/Web/Android bundle 构建与文档检查通过。首轮格式和 Backlog 状态错误已修正。保存失败理由时补齐条目→队列锁顺序后，API types/build 与对应 16 项测试、Web 1/1（21.9 秒）复验通过。本轮进程均已退出、项目端口无监听；启动前已有的失效 API 注册记录未改。独立 Subagent 按 final-review.md 七失败域审查，唯一 P2 已修：无当前 job 的已上传 pending 条目统一投影为 manual。定向 API 16/16、类型/构建/lint/格式及 diff check 通过；同一独立 Subagent 仅复核此 finding 后关闭，无剩余问题。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 队列“今天”按商家时区的 `decided_at` 日期计算；“待我处理”按包含待人工条目的任务组计数，与队列分组口径一致。
