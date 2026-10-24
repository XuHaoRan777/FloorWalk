# FloorWalk 修正记录

修正模式的缓冲（[`AGENTS.md`](../AGENTS.md) 第 3 节）：只存上次"收一下"以来、已归档功能上的改动，一条一行；活动单元的回修记在该单元 `plan.md`「回修」，不在这里。`python scripts/validate_docs.py` 报 `testlog-debt` 时该收了，收尾步骤见 [`howto/fix-promote.md`](howto/fix-promote.md)；历史查 `git log --grep 'Mode: fix'` 和各 spec 的修订记录，不在这里。

列说明：`日期`；`场景` 用户在哪看到的；`改动` 一句话；`验证` 跑了什么；`specs` 为 `无` 或 `待同步 <文件>「<小节>」`；`审查` 为 `无` 或 `待审查`（命中硬线）。

| 日期 | 场景 | 改动 | 验证 | specs | 审查 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-24 | Northbean 种子 | 所有非草稿单的分数按该单合格检查项实算并四舍五入 | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api test -- src/db/seed.test.ts` passed | 待同步 specs/inspection.md「种子数据」 | 无 |
| 2026-10-24 | Northbean 看板种子 | 总量调整为 18 张，额外 failed/rework/submitted 各 2 张，11 家通过、1 家不合格 | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api test -- src/db/seed.test.ts` passed | 待同步 specs/inspection.md「种子数据」 | 无 |
| 2026-10-24 | 槽位种子照片 | 重置时先清空并创建槽位存储目录，种子清理自身 seed 子目录并写入 JPEG 占位图 | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api test -- src/db/seed.test.ts`；`pnpm e2e -- tests/e2e/slot-facility.spec.ts` passed | 待同步 specs/inspection.md「种子数据」 | 无 |
| 2026-10-24 | 工作流硬线路径 | 将 `apps/api/src/db/schema.ts` 登记为 hardline 路径 | `pnpm --filter @apps/api typecheck`；`python -m unittest discover -s scripts/tests -t .` passed | 待同步 specs/inspection.md「种子数据」 | 无 |
