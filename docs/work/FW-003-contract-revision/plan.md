# 巡检主链契约修订 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无
- 阻塞：无
- 下一步：按归档流程 Promote、提交并打 `g01/start`
- 并行组：g01，契约单元（修订；计划：并行 FW-004 API、FW-005 Mobile、FW-006 Web；集成 FW-007）

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 契约代码：路由表、两个响应 schema、7 个错误码、规则修订、补写的结构 | `done` | AC-01，机器门 |
| T02 | API：`/api` 前缀，路由与角色检查从路由表取值，全局异常过滤器，店员按本店授权，CORS | `done` | AC-02、AC-03、AC-04、AC-07 |
| T03 | 种子重做，测试逐条断言 | `done` | AC-05 |
| T04 | 演示链 e2e 完整链路，按槽位运行，确认第一处失败落在业务规则上 | `done` | AC-06 |
| T05 | Expo 版本对齐，Mobile 探针按槽位取端口 | `done` | AC-08 |
| T06 | 最终代码审查 | `done` | 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `pnpm typecheck` | `packages/shared/src/contract/index.ts` | AC-01 契约表/schema/错误码/规则与结构约束均已类型检查；完整审查再按 AC 对照。 |
| T02 | passed | `pnpm --filter @apps/api test` | `apps/api/src/contract.e2e.test.ts` | AC-02/03/04 覆盖路径、权限、统一错误与本店跨创建人访问；7 个 API 测试全绿，其中 CORS 负载响应通过错误 schema。 |
| T02 | passed | `pnpm e2e:cors` | `tests/cors.spec.ts` | AC-07 Web、Expo Web 浏览器读取 API 返回 401 `UNAUTHENTICATED` JSON，未被 CORS 拦截；2 项通过。 |
| T03 | passed | `pnpm --filter @apps/api test` | `apps/api/src/db/seed.test.ts` | AC-05 种子不变量逐条测试；3 项种子测试通过。 |
| T04 | passed | `$env:FW_SLOT='1'; pnpm e2e:demo` | `scripts/demo-chain.mjs` | AC-06 完成全链路后，唯一首个业务失败为第二次提交分数仍为 88（预期 100，留给 FW-004）；无 404、401、连接失败。命令以此预期红断言结束。 |
| T05 | passed | `$env:FW_SLOT='1'; pnpm e2e:mobile` | `tests/mobile-home.spec.ts` | AC-08 Expo Web 首页交互通过；槽位 1 使用 3112，截图为 `docs/work/FW-003-contract-revision/evidence/t05-mobile-home-slot-1.png`。 |
| T05 | passed | `pnpm --filter @apps/mobile check` | `apps/mobile/package.json` | AC-08 Expo SDK 57 依赖对齐检查通过。 |
| T06 | passed | `pnpm typecheck` | `apps/api/src`、`apps/mobile/src`、`apps/web/src`、`packages/shared/src` | 全工作区类型检查通过。 |
| T06 | passed | `pnpm lint` | `apps`、`packages` | 全仓 lint 通过。 |
| T06 | passed | `pnpm format:check` | `apps`、`packages` | 格式检查通过。 |
| T06 | passed | `pnpm build` | `apps/api`、`apps/mobile`、`apps/web`、`packages/shared` | API、Android bundle、Web、shared 构建通过。 |
| T06 | passed | `pnpm e2e:slots` | `tests/e2e/slot-facility.spec.ts` | 三槽位并发隔离测试通过；同时重置演示链在槽位 1 写入的数据与存储。 |
| T06 | passed | `python scripts/validate_docs.py` | `docs/work/FW-003-contract-revision/plan.md` | 文档校验通过，0 个问题。 |
| T06 | passed | `pnpm --filter @apps/api test` | `apps/api/src/contract.e2e.test.ts`、`apps/api/src/db/seed.test.ts` | 独立 Subagent 复核三条 finding 后：非法 UUID 返回 400；契约 e2e 遍历每条路由并逐角色验证禁止访问；全部照片占位文件逐个检查；7 个测试全绿。 |
| T06 | passed | 独立 Subagent 复核 | `apps/api/src/inspection.controller.ts`、`packages/shared/src/contract/index.ts`、`scripts/demo-chain.mjs` | 首轮审查 finding 已修复；复核范围内无残留。上传 schema 已与 multipart `file` 形状一致，演示链 Windows 清理整棵 API 子进程树。 |
| T06 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `pnpm e2e:slots`; `pnpm e2e:cors`; `$env:FW_SLOT='1'; pnpm e2e:mobile`; `python scripts/validate_docs.py` | `packages/shared`、`apps/api`、`apps/mobile`、`apps/web`、`tests/` | 最终整轮门禁全绿：类型、lint、格式、构建、三槽位隔离、Web/Expo CORS、Mobile 探针、文档校验均通过。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-24 起因：用户核验 FW-002 后发现——接口缺 `/api` 前缀（`GET /api/me` 返回 404）；演示链 e2e 只调了一次提交，而且用的是写死的 id；种子违反契约的不变量（20 张单时间相同，没有打回记录和照片，其余 8 张单都堆在 NB-001）；改检查项、审核两个接口缺响应 schema；404、400 不是统一格式。用户核验时发现、但当时没列出的：API 没有 CORS；Mobile 探针写死端口 3112。
- 2026-10-24 用户批准的 10 条默认值：
  1. 补路由表与权限表，加 `/api` 前缀。
  2. 补两个响应 schema。
  3. 新增 400、404 两个错误码，加全局异常过滤器。
  4. 看板按 `decided_at` 取最近一次。
  5. 种子重做，每家店一个店员。
  6. 演示链写成完整链路。
  7. 店员按本店授权。
  8. Expo 版本对齐。
  9. FW-002 多加的结构补写进契约。
  10. parallel.md 和试行记录由协作方修改，不在本单元。
- 2026-10-24：并行组编号顺延为 FW-004 API、FW-005 Mobile、FW-006 Web、FW-007 集成；FW-002 的计划编号作废。
- 归档时：确认 `scripts/workflow.conf` 的 hardline 覆盖契约目录、`apps/api/src/db/schema.ts`、迁移、认证模块；`g01/start` 打在本单元归档后的 master 上。
- 2026-10-24 最终审查澄清：种子规格中的“每家店一张已判定单”解释为每家店一张基线已判定单，非 `NB-001` 另有历史 `failed`、`rework`、`submitted` 单；规格已同步消除歧义。
