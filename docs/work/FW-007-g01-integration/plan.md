# 并行组 g01 集成 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：无（T06 已完成；T04、T05 阻塞）
- 阻塞：T04 演示链 e2e 阻塞；T05 归档还需用户完成人工验收
- 下一步：用户按本地启动说明完成 FW-005 真机验收；T04 后续单元查明 UI 提交阻塞原因
- 并行组：g01，集成单元（并行 FW-004、FW-005、FW-006）

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID  | 任务                                                                                                       | 状态      | 交付的 AC 与证据       |
| --- | ---------------------------------------------------------------------------------------------------------- | --------- | ---------------------- |
| T01 | 合并：按单元号顺序合并三个分支，合并前核对契约等路径                                                       | `done`    | AC-01                  |
| T02 | 全量门禁                                                                                                   | `done`    | AC-02                  |
| T03 | 演示链 e2e 与三端界面 e2e，全部连真接口                                                                    | `done`    | AC-03                  |
| T04 | 跨端界面演示链 e2e                                                                                         | `blocked` | AC-04                  |
| T05 | 交付与归档：登记人工项，用户确认后按顺序归档 FW-004～006，Promote                                          | `blocked` | AC-05                  |
| T06 | 最终代码审查：只审本单元自己的改动（冲突的解法、T04、第 7 节记在本单元的修复）；审完补试行记录，归档本单元 | `done`    | 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是「最终代码审查」。T05 用户测出的问题按 parallel.md 第 7 节修，记在本单元的修复在 T06 一并审。 -->

## 证据

| 任务 | status  | command                                                                                                                                                                                                                   | artifact                                                                                                                                | 备注                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `git diff --stat g01/start..g01/FW-004`; `git diff --stat g01/start..g01/FW-005`; `git diff --stat g01/start..g01/FW-006`; `git merge --no-ff g01/FW-004`; `git merge --no-ff g01/FW-005`; `git merge --no-ff g01/FW-006` | `docs/backlog.md`                                                                                                                       | 三分支按序合入；FW-005、FW-006 的 backlog 相邻行冲突依规保留 master 再更新刚合并单元状态；契约/schema/迁移/package/lock 无未批准差异。FW-006 补审在合并后另行派发。                                                                                                                                                                         |
| T02  | passed  | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `FW_SLOT=1 pnpm --filter @apps/api test`; `pnpm e2e:slots`; `FW_SLOT=1 pnpm e2e:cors`                                                                   | `docs/context/dev-environment.md`                                                                                                       | 全部通过：API 测试 8 项、槽位隔离 3 项、CORS 2 项。开始前验证 `docker port local-pg18` 映射到 5433 且宿主连接成功；先前阻塞已按用户确认的 `docker restart` 恢复，数据完好。                                                                                                                                                                 |
| T03  | passed  | `FW_SLOT=1 pnpm e2e:demo`; `FW_SLOT=2 pnpm e2e:mobile`; `FW_SLOT=3 NO_PROXY=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts`                                                              | `tests/demo`; `tests/mobile/mobile-inspection.spec.ts`; `tests/web/console.spec.ts`                                                     | API 演示链通过；Mobile 6 项通过；Web 6 项通过。Web AC-06 首跑失败，证据显示登录请求在立即 reload 时被中断；等待队列标题后，AC-06 单测通过。Web 测试进程需绕过 localhost 代理。                                                                                                                                                              |
| T04  | blocked | `FW_SLOT=1 pnpm e2e:demo-ui`（两次旧运行；本轮一次）                                                                                                                                                                      | `tests/demo/inspection-chain.spec.ts`; `tests/web-results/demo-slot-1`                                                                  | 旧运行未捕获首次提交 POST；FW-005 回修后本轮已成功发送提交并完成主管打回、店员重提和主管通过，随后在 HQ 新页面因继承主管 localStorage 会话，等待邮箱输入框超时。tests/demo 按要求未修改；T04 仍受测试上下文问题阻塞。                                                                                                                       |
| T05  | blocked | `python scripts/validate_docs.py`                                                                                                                                                                                         | `docs/specs/inspection.md`; `docs/specs/mobile-inspector.md`; `docs/specs/web-console.md`; `docs/specs/workspace.md`; `docs/backlog.md` | specs Promote 已完成，包含 Web localStorage Token XSS 风险；FW-005 真机人工项已登记。按 parallel.md，FW-005～006 归档需用户在主目录测完后确认；T04 仍阻塞，故不能完成 AC-05 或归档。文档校验通过。                                                                                                                                          |
| T06  | passed  | `独立 Subagent 最终审查；仅复核已修 finding`                                                                                                                                                                              | `docs/work/FW-007-g01-integration/plan.md`; `docs/backlog.md`                                                                           | 独立审查。plan 状态和 T01 Markdown 表格 finding 已修复；补充审查发现 Backlog 能力现状过期，已依 Promote specs 更新。T04 更新检查项后的异步 API/详情重载未逐项等待，可能导致提交读取旧状态；受两次失败预算约束保持 blocked，不再运行。仅复核上述 finding，本轮文档校验和 `git diff --check` 通过。T04/T05 未完成，单元不能 verified 或归档。 |

<!-- 行格式见 AGENTS.md 第 7 节。artifact 只写代码格式的路径。 -->

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户采纳：增加跨端界面演示链 e2e（AC-04）。
- 2026-10-24（集成前，用户授权"清理主目录"）：主目录从 `g01/FW-006` 切回 master，丢掉 FW-004、FW-005 留在主目录的 13 个过期改动（逐个核对过，内容都在分支里，或比分支旧）。`.gitattributes` 加 `* text=auto eol=lf`，新检出的文件一律 LF；`apps/api/src/db/seed.ts`、`seed.test.ts` 只做了格式化，master 的 `format:check` 转绿。FW-004、FW-005 自建的工作树 `F:/project/FloorWalk-fw004`、`-fw005` 不归 Codex 管，收组时手动删。
- 2026-10-24 用户授权 FW-004 在 `g01/FW-004` 上给 `scripts/demo-chain.mjs` 的第二次审核补一次 `start`，契约不改。这是 FW-004 分支里唯一一处写入范围外的改动，属于已批准的改动。
- 2026-10-25 用户要求：T01 合并后，先由独立 Subagent 按 `docs/howto/final-review.md` 补审 FW-006 的 `git diff g01/start g01/FW-006`（其最终审查为同会话完成）；finding 按 `parallel.md` 第 7 节作为 FW-006 回修，记录在 FW-006 的 plan。
- 2026-10-25 用户授权本单元附加改动：忽略 `tests/web-results/`；将 Web localStorage Token 风险列入第二组待开单元并在 Promote 的 Web specs「没有的」记录；记录 `local-pg18` 端口映射偏差及恢复方式。
