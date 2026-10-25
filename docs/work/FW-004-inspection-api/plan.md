# 巡检业务规则 API - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：T06 最终代码审查
- 阻塞：无
- 下一步：已完成并行单元验收，创建完成标记
- 并行组：g01，并行单元，槽位 1（并行 FW-004、FW-005、FW-006；集成 FW-007）

- 预检：业务实现范围为 `apps/api/src/inspection.controller.ts`、`apps/api/src/http-exception.filter.ts`、`apps/api/src/contract.e2e.test.ts` 及本计划证据；契约、数据库、认证和依赖只读。
- 预检：FW_SLOT=1 的 API 测试使用 `floorwalk_e2e_1` 与槽位存储目录；本机 PostgreSQL 与工作区依赖已可用。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID  | 任务                                                       | 状态      | 交付的 AC 与证据                   |
| --- | ---------------------------------------------------------- | --------- | ---------------------------------- |
| T01 | 提交：完整性检查、状态检查、锁分、重新提交重算             | `done`    | AC-01                              |
| T02 | 审核：状态迁移、审核记录、`decided_at`、严重项、打回项归属 | `done`    | AC-02、AC-03                       |
| T03 | 检查项修改与照片上传的状态限制                             | `done`    | AC-04                              |
| T04 | 照片落盘、签名链接与文件路由的签名校验                     | `done`    | AC-05                              |
| T05 | 看板取分；演示链 e2e 转绿                                  | `done`    | AC-06、AC-07                       |
| T06 | 最终代码审查                                               | `done`    | 全量门禁与三条 finding 定向复核    |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。 -->

## 证据

| 任务 | status  | command                                                    | artifact                                                                                               | 备注                                                                                                                                                                                                                |
| ---- | ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`                                                                | API 套件 2 个文件、8 个测试通过；提交完整性、状态与实算分数通过。                                                                                                                                                   |
| T02  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`, `apps/api/src/contract.e2e.test.ts`                           | 审核状态迁移、审核记录、非法打回项和严重项不合格时 422 均通过 API 测试。                                                                                                                                            |
| T03  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`                                                                | 检查项及照片写入使用状态行锁；契约流程在可编辑状态通过。                                                                                                                                                            |
| T04  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`, `apps/api/src/storage.controller.ts`                          | 照片落盘、带查询签名 URL、错误/过期签名 403 和路径越界 400 通过。                                                                                                                                                   |
| T05  | passed  | `FW_SLOT=1 pnpm e2e:demo`（连接本地槽位转发端口）          | `scripts/demo-chain.mjs`                                                                               | 演示链退出码 0；迁移、seed、API 启动及提交→审核打回→重新提交→通过→看板链路全绿。此前未注入转发端口的直接 API 测试连接默认 5433 失败（ECONNREFUSED），随后按真实工作树配置注入端口重跑通过；未读取 `.env.development` 内容。 |
| T06  | passed  | 独立 Subagent 初审并按 `docs/howto/final-review.md` 定向复核 | `apps/api/src/inspection.controller.ts`, `apps/api/src/http-exception.filter.ts`, `apps/api/src/contract.e2e.test.ts` | 初审发现 3 条 finding；修复后独立 Subagent 仅复核这三条，未重跑整轮审查：UUID 文件键/MIME 扩展名且不含原文件名、pending 与必拍照片缺失均 422 `INCOMPLETE`、非 jpeg/png 与超 10 MB 均 400 `VALIDATION_FAILED`，全部通过。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户默认：打回后店员能改所有项，不强制重拍；签名错误或过期返回 403 `FORBIDDEN`。
- 2026-10-25 用户授权：仅在 `scripts/demo-chain.mjs` 第二次审核的 `approve` 前补一次 `start`；契约与 API 不改。
- 2026-10-25 用户补充授权：上述三条最终审查 finding 均在本单元写入范围和 AC 内，按 AGENTS.md 第 9 节直接修复；照片存储键使用随机 UUID，按 MIME 决定扩展名，不将原始文件名放入路径；补齐 AC-01/AC-05 失败路径测试。不改契约与 API 语义。
- 2026-10-25 用户要求：T01 合并后先派独立 Subagent 按 `docs/howto/final-review.md` 补审 FW-006 差异（`git diff g01/start g01/FW-006`，其原最终审查由同会话执行）；finding 按 `docs/howto/parallel.md` 第 7 节作为 FW-006 回修，并记入 FW-006 的 plan。
