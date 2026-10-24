# Web 主管审核与总部看板 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：T07 最终代码审查
- 阻塞：无
- 下一步：打完成标记，等待并行组其他单元
- 并行组：g01，并行单元，槽位 3（并行 FW-004、FW-005、FW-006；集成 FW-007）

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | e2e 配置按槽位起 API 和 Web；登录、保持登录、退出、按角色分流 | `done` | AC-01 |
| T02 | 审核队列 | `done` | AC-02 |
| T03 | 审核详情：检查项、照片、审核历史；打开时自动开始审核 | `done` | AC-03 |
| T04 | 通过、不合格、打回（选择打回项）；严重项不合格时禁用通过 | `done` | AC-04 |
| T05 | 总部看板与只读权限 | `done` | AC-05 |
| T06 | 错误提示与 401 回登录 | `done` | AC-06 |
| T07 | 最终代码审查 | `done` | `FW_SLOT=3` 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/console.spec.ts` | AC-01 通过；6 条 Web e2e 全绿。 |
| T02 | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/console.spec.ts` | AC-02 通过；队列字段按同一时刻 API 响应断言。 |
| T03 | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/console.spec.ts` | AC-03 通过；检查项、照片和审核历史可见，提交单自动开始审核。 |
| T04 | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/console.spec.ts` | AC-04 通过；打回需选项，严重项不合格时通过禁用。 |
| T05 | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/console.spec.ts` | AC-05 通过；12 店看板和总部只读审核详情通过。 |
| T06 | passed | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/console.spec.ts` | AC-06 通过；403/网络错误中文提示，401 回登录。 |
| T07 | passed | `pnpm --filter @apps/web typecheck; pnpm --filter @apps/web build; pnpm exec eslint apps/web/src playwright.web.config.ts tests/web/console.spec.ts` | `apps/web/src`, `playwright.web.config.ts`, `tests/web/console.spec.ts` | 机器门通过；主 Agent 在共享工作树中按 spec、plan 和完整差异完成只读审查，无法切换独立工作树因为其他并行单元有未提交现场修改。 |

<!-- 行格式见 AGENTS.md 第 7 节。截图存本单元 `evidence/`，artifact 只写代码格式的路径。 -->

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户默认：主管打开待审核的单时，界面自动开始审核；界面 e2e 对照 API 返回，不写死数值。
