# 巡检业务规则 API - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`approved`
- 归档状态：`active`
- 当前任务：T05 看板与演示链
- 阻塞：无
- 下一步：运行槽位 1 演示链并派独立最终代码审查
- 并行组：g01，并行单元，槽位 1（并行 FW-004、FW-005、FW-006；集成 FW-007）

- 预检：仅改 `apps/api/src/inspection.controller.ts`、`apps/api/src/storage.controller.ts` 及本计划证据；契约、数据库、认证和依赖只读。
- 预检：FW_SLOT=1 的 API 测试使用 `floorwalk_e2e_1` 与槽位存储目录；本机 PostgreSQL 与工作区依赖已可用。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID  | 任务                                                       | 状态      | 交付的 AC 与证据                   |
| --- | ---------------------------------------------------------- | --------- | ---------------------------------- |
| T01 | 提交：完整性检查、状态检查、锁分、重新提交重算             | `done`    | AC-01                              |
| T02 | 审核：状态迁移、审核记录、`decided_at`、严重项、打回项归属 | `done`    | AC-02、AC-03                       |
| T03 | 检查项修改与照片上传的状态限制                             | `done`    | AC-04                              |
| T04 | 照片落盘、签名链接与文件路由的签名校验                     | `done`    | AC-05                              |
| T05 | 看板取分；演示链 e2e 转绿                                  | `blocked` | AC-06、AC-07                       |
| T06 | 最终代码审查                                               | `done`    | `FW_SLOT=1` 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。 -->

## 证据

| 任务 | status  | command                                                    | artifact                                                                                               | 备注                                                                                                                                                                                                                |
| ---- | ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`                                                                | API 套件 2 个文件、8 个测试通过；提交完整性、状态与实算分数通过。                                                                                                                                                   |
| T02  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`, `apps/api/src/contract.e2e.test.ts`                           | 审核状态迁移、审核记录、非法打回项和严重项不合格时 422 均通过 API 测试。                                                                                                                                            |
| T03  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`                                                                | 检查项及照片写入使用状态行锁；契约流程在可编辑状态通过。                                                                                                                                                            |
| T04  | passed  | `$env:FW_SLOT='1'; pnpm --filter @apps/api test`           | `apps/api/src/inspection.controller.ts`, `apps/api/src/storage.controller.ts`                          | 照片落盘、带查询签名 URL、错误/过期签名 403 和路径越界 400 通过。                                                                                                                                                   |
| T05  | blocked | `$env:FW_SLOT='1'; pnpm e2e:demo`                          | `scripts/demo-chain.mjs`                                                                               | 脚本已补第二次审核前的 `start`；当前目标工作树 `.env.development` 仍为占位数据库连接串，使用临时本地连接尝试时 PostgreSQL 宿主端口未发布/角色密码不可用，命令在迁移阶段退出，未到达演示链断言。                     |
| T06  | blocked | 独立 Subagent 按 `docs/howto/final-review.md` 审查（只读） | `apps/api/src/inspection.controller.ts`, `apps/api/src/contract.e2e.test.ts`, `scripts/demo-chain.mjs` | 发现 P1：照片 `storageKey` 使用 `Date.now()` 存在同毫秒碰撞覆盖；P2：AC-01 的 `INCOMPLETE`、AC-05 的 MIME/大小失败路径缺少测试；AC-07 仍因数据库配置未执行。当前授权只允许演示脚本单处修改，未擅自修 API 或扩测试。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户默认：打回后店员能改所有项，不强制重拍；签名错误或过期返回 403 `FORBIDDEN`。
- 2026-10-25 用户授权：仅在 `scripts/demo-chain.mjs` 第二次审核的 `approve` 前补一次 `start`；契约与 API 不改。
- 2026-10-25 阻塞：目标工作树没有真实数据库连接配置，`FW_SLOT=1 pnpm e2e:demo` 在迁移阶段无法连接；不读取或复制其他工作树 `.env`，不修改数据库认证。
- 2026-10-25 独立最终审查：发现照片键碰撞运行时风险，以及 AC-01/AC-05 失败路径证据缺口；需后续授权补修，当前不打完成标记。
