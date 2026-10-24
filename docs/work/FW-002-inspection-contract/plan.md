# 巡检主链契约与骨架 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：完成
- 阻塞：无
- 下一步：无，已归档
- 并行组：g01，契约单元（计划：并行 FW-003 API、FW-004 Mobile、FW-005 Web；集成 FW-006）

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | Expo Web 探针：Mobile 首页在浏览器打开，Playwright 点击按钮并截图；做不到就停下报告 | `done` | AC-07 |
| T02 | 一次装好第一组依赖；API 监听地址支持 `HOST`；各端 `.env*.example` 补变量名 | `done` | AC-08、AC-09 |
| T03 | 契约代码 `packages/shared/src/contract/` | `done` | AC-01 |
| T04 | 迁移与种子，测试断言数量和分数 | `done` | AC-02 |
| T05 | e2e 设施：按 `FW_SLOT` 选库和端口，跑前重建 schema；三个槽位同时跑 | `done` | AC-05 |
| T06 | 登录与角色；其余接口返回符合 schema 的固定数据；e2e 断言 | `done` | AC-03、AC-04 |
| T07 | 演示链 e2e（API 层），确认它因业务规则未实现而红 | `done` | AC-06 |
| T08 | 最终代码审查 | `done` | 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `pnpm e2e:mobile` | `docs/work/FW-002-inspection-contract/evidence/t01-mobile-home.png` | Playwright 自动启动 Expo Web，点击“体验按钮”后显示“按钮响应成功”，截图已文件化保存。 |
| T02 | passed | `pnpm install --frozen-lockfile`; `pnpm peers check`; `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/mobile typecheck`; `pnpm --filter @apps/web typecheck` | `pnpm-workspace.yaml`; `apps/api/src/main.ts`; `apps/*/.env*.example`; `pnpm-lock.yaml` | 依赖安装冻结通过、peer 无问题；API 支持 `HOST`，默认 127.0.0.1；示例变量齐全。 |
| T03 | passed | `pnpm --filter @libs/shared build`; `pnpm --filter @libs/shared typecheck` | `packages/shared/src/contract/index.ts`; `packages/shared/src/index.ts` | 共享契约覆盖表、枚举、状态迁移、接口 schema、错误码和规则函数签名；构建与类型检查通过。 |
| T04 | passed | `pnpm --filter @apps/api db:migrate`; `pnpm --filter @apps/api test` | `apps/api/drizzle/0000_dry_thaddeus_ross.sql`; `apps/api/src/db/schema.ts`; `apps/api/src/db/seed.ts`; `apps/api/src/db/seed.test.ts` | 空库迁移成功；种子断言 12 店、3 账号、1 模板、8 项、20 单，NB-001 历史通过单为 88 分。测试数据由种子事务重建。 |
| T05 | passed | `pnpm e2e:slots` | `tests/e2e/slot.ts`; `tests/e2e/global-setup.ts`; `playwright.config.ts`; `scripts/e2e-slots.mjs` | 三槽位并发各自重建 schema、种子和 `apps/api/.e2e/slot-N/storage`，隔离测试均通过。 |
| T06 | passed | `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/api test` | `apps/api/src/auth.ts`; `apps/api/src/inspection.controller.ts`; `apps/api/src/contract.e2e.test.ts` | 三演示账号登录、错误密码 401、无 token 401、店员审核 403；其余契约端点逐个调用并用共享 zod schema 断言。 |
| T07 | failed | `pnpm --filter @apps/api dev` + `pnpm e2e:demo` | `scripts/demo-chain.mjs` | 预期失败：骨架提交接口返回 88，测试明确要求重新提交后为 100；失败原因是 FW-003 业务规则尚未实现，符合 AC-06 允许的红灯状态。 |
| T08 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `pnpm --filter @apps/api test`; `pnpm e2e:slots`; `pnpm e2e:mobile`; `python scripts/validate_docs.py` | `apps/api/src/contract.e2e.test.ts`; `docs/work/FW-002-inspection-contract/plan.md` | 全量门禁通过；API 3 项测试、三槽位并发、Mobile Playwright 通过。独立 Subagent 审查发现的认证、越权、迁移与响应 schema 问题已修复；独立 Subagent 仅复核原 finding，均关闭。首轮 Mobile e2e 与构建并发时服务未就绪，顺序单跑通过。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-24 用户：FW-004（Mobile）、FW-005（Web）都按方式 B 验收；Mobile 用 Expo Web + Playwright 取证，原生相机和真机外观登记「待人工验收」。T01 不通过时，FW-004 在开组前改回 A。
- 2026-10-24 用户："其他默认"。不建组织表；模板不做版本号，开单时复制各项；打回时指定具体项；照片用签名链接；有严重项不合格时不能通过；「今日待巡」包含本店所有打回单；演示密码公开。
- 2026-10-24：`pnpm --filter @apps/mobile check` 报 5 个 Expo 依赖小版本与当前 SDK 预期不一致；AC 所需安装冻结、类型检查、Playwright 和 Android JS bundle 均通过，未升级规格外依赖。
- 2026-10-24 用户确认：JWT token 有效期为 1 小时，保留当前实现；过期后需重新登录。
- 归档时：契约目录、迁移目录、认证模块登记进 `scripts/workflow.conf` 的 `hardline`。并行组 g01 其余单元的 spec 在本单元归档后由用户另行讨论、批准。
