# 并行组 g01 集成 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：T02
- 阻塞：无
- 下一步：全量类型检查、lint、格式检查、构建与 API/e2e 槽位门禁
- 并行组：g01，集成单元（并行 FW-004、FW-005、FW-006）

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 合并：按单元号顺序合并三个分支，合并前核对契约等路径 | `done` | AC-01 |
| T02 | 全量门禁 | `in_progress` | AC-02 |
| T03 | 演示链 e2e 与三端界面 e2e，全部连真接口 | `pending` | AC-03 |
| T04 | 跨端界面演示链 e2e | `pending` | AC-04 |
| T05 | 交付与归档：登记人工项，用户确认后按顺序归档 FW-004～006，Promote | `pending` | AC-05 |
| T06 | 最终代码审查：只审本单元自己的改动（冲突的解法、T04、第 7 节记在本单元的修复）；审完补试行记录，归档本单元 | `pending` | 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是「最终代码审查」。T05 用户测出的问题按 parallel.md 第 7 节修，记在本单元的修复在 T06 一并审。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `git diff --stat g01/start g01/FW-004|005|006 -- <hardline 路径>`; `git merge --no-ff g01/FW-004|005|006` | `docs/backlog.md` | 三分支按序合入；FW-005、FW-006 的 backlog 相邻行冲突依规保留 master 再更新刚合并单元状态；契约/schema/迁移/package/lock 无未批准差异。FW-006 补审在合并后另行派发。 |

<!-- 行格式见 AGENTS.md 第 7 节。artifact 只写代码格式的路径。 -->

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户采纳：增加跨端界面演示链 e2e（AC-04）。
- 2026-10-24（集成前，用户授权"清理主目录"）：主目录从 `g01/FW-006` 切回 master，丢掉 FW-004、FW-005 留在主目录的 13 个过期改动（逐个核对过，内容都在分支里，或比分支旧）。`.gitattributes` 加 `* text=auto eol=lf`，新检出的文件一律 LF；`apps/api/src/db/seed.ts`、`seed.test.ts` 只做了格式化，master 的 `format:check` 转绿。FW-004、FW-005 自建的工作树 `F:/project/FloorWalk-fw004`、`-fw005` 不归 Codex 管，收组时手动删。
- 2026-10-24 用户授权 FW-004 在 `g01/FW-004` 上给 `scripts/demo-chain.mjs` 的第二次审核补一次 `start`，契约不改。这是 FW-004 分支里唯一一处写入范围外的改动，属于已批准的改动。
- 2026-10-25 用户要求：T01 合并后，先由独立 Subagent 按 `docs/howto/final-review.md` 补审 FW-006 的 `git diff g01/start g01/FW-006`（其最终审查为同会话完成）；finding 按 `parallel.md` 第 7 节作为 FW-006 回修，记录在 FW-006 的 plan。
