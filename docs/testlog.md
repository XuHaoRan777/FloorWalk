# FloorWalk 修正记录

修正模式的缓冲（[`AGENTS.md`](../AGENTS.md) 第 3 节）：只存上次"收一下"以来、已归档功能上的改动，一条一行；活动单元的回修记在该单元 `plan.md`「回修」，不在这里。`python scripts/validate_docs.py` 报 `testlog-debt` 时该收了，收尾步骤见 [`howto/fix-promote.md`](howto/fix-promote.md)；历史查 `git log --grep 'Mode: fix'` 和各 spec 的修订记录，不在这里。

列说明：`日期`；`场景` 用户在哪看到的；`改动` 一句话；`验证` 跑了什么；`specs` 为 `无` 或 `待同步 <文件>「<小节>」`；`审查` 为 `无` 或 `待审查`（命中硬线）。

| 日期 | 场景 | 改动 | 验证 | specs | 审查 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-24 | Northbean 种子 | 所有非草稿单的分数按该单合格检查项实算并四舍五入 | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api test -- src/db/seed.test.ts` passed | 待同步 specs/inspection.md「种子数据」 | 无 |
| 2026-10-24 | Northbean 看板种子 | 总量调整为 18 张，额外 failed/rework/submitted 各 2 张，11 家通过、1 家不合格 | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api test -- src/db/seed.test.ts` passed | 待同步 specs/inspection.md「种子数据」 | 无 |
