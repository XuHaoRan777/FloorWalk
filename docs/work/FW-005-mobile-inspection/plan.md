# Mobile 店员巡检 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：T06 最终代码审查（已完成）
- 阻塞：无
- 下一步：最终代码审查
- 并行组：g01，并行单元，槽位 2（并行 FW-004、FW-005、FW-006；集成 FW-007）
- 预检：改动限定在 `apps/mobile`、`tests/mobile/`、`playwright.mobile.config.ts`；API、契约、依赖和迁移只读。槽位 2 的数据库与存储可由现有迁移/种子命令初始化。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | e2e 配置按槽位起 API 和 Expo Web；登录、保持登录、「我的」与退出 | `done` | AC-01 |
| T02 | 「今日待巡」 | `done` | AC-02 |
| T03 | 做巡检：逐项标记、拍照上传、提交 | `done` | AC-03 |
| T04 | 打回单：高亮打回项、主管意见、补拍、重新提交 | `done` | AC-04 |
| T05 | 错误提示与 401 回登录 | `done` | AC-05 |
| T06 | 最终代码审查 | `done` | `FW_SLOT=2` 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01-T05 | passed | `FW_SLOT=2 pnpm e2e:mobile` | `apps/mobile/components/mobile-app.tsx`, `apps/mobile/lib/api.ts`, `apps/mobile/lib/storage.ts`, `playwright.mobile.config.ts`, `tests/mobile/mobile-inspection.spec.ts` | 6 个 Mobile Web e2e 全部通过：登录/重启/我的/退出、错误密码、今日数据与必拍缺失、照片上传提交、NB-002 打回重提、401 回登录。 |
| T01-T05 | passed | `pnpm --filter @apps/mobile typecheck` | `apps/mobile` | TypeScript 通过。 |
| T01-T05 | passed | `pnpm --filter @apps/mobile lint` | `apps/mobile` | ESLint 通过。 |
| T01-T05 | passed | `pnpm exec prettier --check apps/mobile/components/mobile-app.tsx apps/mobile/lib/api.ts playwright.mobile.config.ts tests/mobile/global-setup.ts tests/mobile/mobile-inspection.spec.ts` | `apps/mobile`, `tests/mobile`, `playwright.mobile.config.ts` | 格式检查通过。 |
| T01-T06 | passed | `FW_SLOT=2 FLOORWALK_ENV_FILE=<main-worktree-env> pnpm e2e:mobile` | `tests/mobile/mobile-inspection.spec.ts`, `playwright.mobile.config.ts` | 修复 401 上传回登录、备注串行持久化、启动恢复网络错误提示后，6 个 Mobile Web e2e 全部通过；测试动态读取今日门店、模板、提交标记、打回数量、检查项和必拍项。凭据值未打印。 |
| T06 | passed | `pnpm --filter @libs/shared build && pnpm --filter @apps/mobile typecheck && pnpm --filter @apps/mobile lint` | `apps/mobile` | 修复后 shared 构建、Mobile 类型检查和 lint 通过。 |
| T06 | passed | `docs/howto/final-review.md` | `apps/mobile/components/mobile-app.tsx`, `playwright.mobile.config.ts` | 独立审查发现的两个 P1 已修复并复核通过：照片上传 401 回登录；备注保留服务端值并在提交前串行保存。 |

<!-- 行格式见 AGENTS.md 第 7 节。截图存本单元 `evidence/`，artifact 只写代码格式的路径。 -->

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户默认：打回后店员能改所有项，界面只高亮被打回的项，不强制重拍；不做「记录」页；界面 e2e 对照 API 返回，不写死数值。
- 2026-10-24：Mobile e2e 的 API webServer 使用 `nest start --watch` 时在测试间重编译导致 dist 入口短暂缺失；改为一次性 `nest start`，槽位 2 全量 e2e 稳定通过。
