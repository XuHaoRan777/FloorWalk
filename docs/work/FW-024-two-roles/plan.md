# 角色收成两层 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无
- 已交付：两层角色、账号与门店管理、调店后的历史访问和跨商家登录
- 阻塞：无
- 下一步：已于 2026-11-12 Promote 并随接力线归档

Preflight：涉及 shared、API、数据库迁移与种子、Web、Mobile 和现有测试；无上游依赖。开发库只读统计：2 个商家、18 个用户、19 张巡检单；连接角色 `floorwalk`，PostgreSQL 5433 已发布。工作区开工时干净；随后 `docs/howto/relay.md` 出现外部改动，保留该改动。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 两层角色和参与记录的数据结构与共享契约 | `done` | 无，机器门 |
| T02 | 管理员管理店长、门店和种子 | `done` | AC-01、AC-02、AC-03、AC-04、AC-09 |
| T03 | 多商家登录与会话 | `done` | AC-06、AC-07 |
| T04 | 调店后的巡检和历史访问 | `done` | AC-05 |
| T05 | Web 与 Mobile 账号、门店和登录流程 | `done` | AC-08 |
| T06 | 最终代码审查 | `done` | 全量机器门及独立审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `pnpm --filter @libs/shared build`、`pnpm --filter @libs/shared typecheck`、`$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/db/migrate.test.ts -t 'FW-024 empty migration'` | `apps/api/src/db/migrate.test.ts` | 空槽位顺序迁移与管理员约束通过；测试后清空槽位并重新迁移，待新种子。旧 g03 迁移测试需适配不迁旧数据的新边界。 |
| T02 | blocked | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/db/seed.test.ts` | `apps/api/src/db/seed.test.ts` | 种子测试 6 项通过；账号 HTTP 测试和类型检查依赖 T03 的认证切换，槽位已留种子供后续测试。 |
| T02 | passed | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/users-fw024.test.ts` | `apps/api/src/users-fw024.test.ts` | 管理接口 2 项通过；测试账号清理。全部槽位及开发库重建仍待完成。 |
| T03 | blocked | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/session.test.ts`、`$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/users.test.ts`、`pnpm --filter @apps/api typecheck` | `apps/api/src/session.test.ts` | 会话 18 项与账号回归 7 项通过，覆盖重置密码与登录并发，测试数据已清理；类型检查受旧契约测试阻塞。 |
| T04 | passed | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/inspection-fw024.test.ts`、`$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/contract.e2e.test.ts`、`pnpm --filter @apps/api typecheck` | `apps/api/src/inspection-fw024.test.ts` | 调店后新门店、参与记录、历史详情及照片和聊天图片访问通过；契约回归 15 项通过，测试数据已清理。 |
| T05 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/users.spec.ts`、`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/protocol.spec.ts`、`FW_SLOT=1 pnpm exec playwright test --config=playwright.demo.config.ts tests/demo/fw024-accounts.spec.ts`、`pnpm typecheck` | `tests/demo/fw024-accounts.spec.ts` | Web、Mobile 各 3 项和同一账号跨端链路 1 项通过，测试账号已清理。Mobile 已读 expo-overview、expo-native-ui、expo-ui；SDK 57 官方文档页面 404，查阅 unpkg 的 expo@57.0.31 bundledNativeModules.json。 |
| T05 | failed | `FW_SLOT=2 pnpm --filter @apps/api test` | `apps/api/src/admin.test.ts` | 99 项通过、3 个套件初始化失败：仍使用旧登录字段；正适配后复测。槽位 2、3 已按仓库设施重建并写入种子。 |
| T06 | blocked | `pnpm --filter @apps/mobile check` | `apps/mobile/package.json` | Expo 在线配套检查推荐的新 patch 高于项目锁定版本；未擅自升级。 |
| T06 | passed | `FW_SLOT=2 pnpm --filter @apps/api test`、`pnpm build`、`python scripts/validate_docs.py` | `apps/api/src` | API 111 项通过、3 项外部服务 smoke 跳过；根构建和文档校验通过。最终独立审查尚未执行。 |
| T02 | passed | `runMigrations`、`seedDatabase`、四库只读统计 | `apps/api/src/db/seed.ts` | 用户调整存储配置后重建开发库；开发库及三个槽位均为 2 商家、2 管理员、14 店长、19 巡检单。开发种子图片写入仓库根目录的 `org/`，不纳入提交。 |
| T03 | passed | `pnpm typecheck`、`FW_SLOT=2 pnpm --filter @apps/api test` | `apps/api/src/session.test.ts` | 类型检查和会话回归通过。 |
| T06 | passed | `pnpm lint`、`pnpm format:check` | `apps` | lint 与格式检查通过。 |
| T06 | blocked | 独立 Subagent 审查、finding 复核；`FW_SLOT=1 pnpm --filter @apps/api test -- src/chat.test.ts src/session.test.ts src/contract.e2e.test.ts`、`pnpm typecheck` | `apps/api/src/auth.controller.ts` | 七个失败域已审查。管理员聊天修复及跨商家拒绝已通过定向测试并复核；不存在登录名已执行虚拟哈希，但多商家候选数量仍可能形成可观察耗时差异。旧契约断言更新后 `src/contract.e2e.test.ts` 15 项通过；首次运行的 2 项旧断言失败已修复。 |
| T06 | passed | `pnpm --filter @apps/mobile check`、`pnpm --filter @apps/mobile typecheck`、`pnpm --filter @apps/mobile build`、`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/protocol.spec.ts` | `apps/mobile/package.json` | 用户授权升级配套 patch；检查、类型、Android bundle 和 Mobile 3 项浏览器端测试通过。 |
| T06 | passed | 独立 Subagent 审查及 finding 复核 | `docs/howto/final-review.md` | 七个失败域完成；管理员聊天问题修复并复核，登录时序侧信道由用户明确接受。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 交接

<!-- 方式 A 机器门过后写这两行，方式 B 删掉本节。不写逐条验收脚本。第一行写实现与讨论时说定的不同之处（AC 改动、没做的、做法变了的），没有写"无"；第二行在讨论时的功能点之外，只列机器验不了的（真钱、真机、真回调），没有写"无"。 -->

- 和讨论时不一样的：
- 需要你测的：

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

- 用户已调整存储配置并完成开发库重建；当前存储目录为仓库根目录，生成的 `org/` 是本地种子数据，不纳入提交。仓库外原文件未删除。
- 用户 2026-11-09 接受简历项目的多商家候选数量耗时侧信道，并授权升级 Expo 配套 patch；不存在的登录名仍执行虚拟哈希。
- 2026-11-10：用户已提交自行修改的文档（`babfb1b`）；将 `org/` 加入 Git 本地排除项并保留种子图片，接力工作区阻塞解除，下游为 FW-025。

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->
