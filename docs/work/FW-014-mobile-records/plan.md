# Mobile 记录页 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`approved`
- 归档状态：`active`
- 当前任务：T04
- 阻塞：无
- 下一步：跑本槽位全量测试和全量门禁，派独立 Subagent 做最终审查。
- 并行组：g02，并行单元，槽位 3（并行 FW-012、FW-013、FW-014；集成 FW-015）

Preflight：只改 spec「批准记录」的写入范围。`records.controller.ts` 已由 FW-011 实现游标分页（含毫秒精度修复），本单元核对并补测试，不重写。T02 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-router` 与 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。Mobile 首屏在三槽并发时偶发加载超时（FW-011 记录，根因未定），遇到先单独重跑一次。

## 任务表

| ID  | 任务                                           | 状态          | 交付的 AC 与证据                                         |
| --- | ---------------------------------------------- | ------------- | -------------------------------------------------------- |
| T01 | 记录列表 API 的分页完整性与权限测试            | `done`        | AC-01、AC-04（API 部分）；`apps/api/src/records.test.ts` |
| T02 | 「记录」Tab 列表：加载更多、下拉刷新、三种状态 | `done`        | AC-02、AC-05；`tests/mobile/records.spec.ts`             |
| T03 | 只读详情页                                     | `done`        | AC-03、AC-04（界面部分）；`tests/mobile/records.spec.ts` |
| T04 | 最终代码审查（独立 Subagent）                  | `in_progress` | 派审查前跑本槽位全部测试和全量门禁；审查记录             |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务                   | status | command                                                                                                                                                | artifact                                                                           | 备注                                                                                                                                                                                         |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 / AC-01、AC-04 API | passed | `FW_SLOT=3 pnpm --filter @apps/api test -- src/records.test.ts`                                                                                        | `apps/api/src/records.test.ts`                                                     | 对照数据库本店全集翻完所有页；同毫秒稳定分页、同店另一店员、外店隔离、角色 403、超限与伪造游标 400 均通过。首跑因 shared dist 缺失未收集测试，构建 shared 后重跑通过。                       |
| T02 前置阅读           | passed | `read Expo skills and SDK 57 Router reference`                                                                                                         | `apps/mobile/package.json`                                                         | expo-overview → expo-router、expo-data-fetching；Expo SDK 57.0.31 / Router 57.0.29，官方文档：`https://docs.expo.dev/versions/v57.0.0/sdk/router.md`。                                       |
| T02 / AC-02、AC-05     | passed | `FW_SLOT=3 pnpm e2e:mobile -- tests/mobile/records.spec.ts --workers=1`                                                                                | `apps/mobile/components/mobile/records-screen.tsx`; `tests/mobile/records.spec.ts` | Expo Web 用例通过，实时 API 对照分页、追加和刷新；覆盖加载/空状态、网络错误、400/403/404 中文提示及 401 登录跳转。Mobile 类型检查、目标 lint、Prettier 通过；槽位端口 3130–3132 无遗留监听。 |
| T03 / AC-03、AC-04 UI  | passed | `FW_SLOT=3 pnpm e2e:mobile -- tests/mobile/records.spec.ts --workers=1`                                                                                | `apps/mobile/app/(authenticated)/records/[id].tsx`; `tests/mobile/records.spec.ts` | 对照同一详情 API 响应，检查项/备注/照片可见、审核 ID 顺序相同、聊天显示且可发送、无巡检编辑控件。四个 Mobile Web 用例通过，类型检查、目标 lint、Prettier 通过；`ChatPanel` 挂载行未改。      |
| T04 全量门禁           | passed | `FW_SLOT=3 pnpm --filter @apps/api test`; `FW_SLOT=3 pnpm e2e:mobile -- --workers=1`; `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build` | `apps/api/src/records.test.ts`; `tests/mobile/records.spec.ts`                     | API 34/34、Mobile Web 13/13；类型、lint、格式和 API/Mobile/Web 构建全通过。槽位 e2e 串行运行，端口 3130–3132 已检查为空。                                                                    |
| T03 / AC-03、AC-04 UI  | passed | `FW_SLOT=3 pnpm e2e:mobile -- tests/mobile/records.spec.ts --workers=1`                                                                                | `apps/mobile/app/(authenticated)/records/[id].tsx`; `tests/mobile/records.spec.ts` | 对照同一详情 API 响应，检查项/备注/照片可见、审核 ID 顺序相同、聊天显示且可发送、无巡检编辑控件。四个 Mobile Web 用例通过，类型检查、目标 lint、Prettier 通过；`ChatPanel` 挂载行未改。      |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-29 产品决定见 FW-011 plan「决策与偏差」：本店全部状态的单，10 条一页"加载更多"，详情一律只读、显示聊天且能发。
- 人工触点由 Claude 在集成复核时按类别补记；本单元停下时照常在这里写三行并打 `g02/blocked/FW-014`。
