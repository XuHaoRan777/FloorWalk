# 站内通知（Mobile 收件箱与角标） - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：无（T01～T05 已完成）
- 阻塞：无
- 下一步：Mobile 两端通知入口、分组分页、已读导航与原生流程已交付；接力中间单元保持 active，下游为 FW-038，线尾统一 Promote 与归档

Preflight（2026-11-17）：上游 FW-036 已归档，提交 `886f910` 在当前 `master`；依赖 `docs/specs/notifications.md`、`apps/api/src/controllers/notifications.controller.ts`、`packages/shared/src/contract/notifications.ts` 均存在，Mobile 不改后端 API。改动限 `apps/mobile/` 与 `tests/mobile/`；通知已有数据由本人 API 隔离，本次不预统计或改写既有数据。

Preflight（2026-11-17）：工作区干净、文档校验通过；`--env-keys` 报没有已登记配置组，按接力探针由用户手动核对，不读取 `.env*`。开发服务管理器入口为 `scripts/dev/proc.mjs`，原生取证服务按该入口起停；端口 3018/3019/3020/3110/3112 无监听，Docker `local-pg18` 正在 5433 提供服务。ADB 与 AVD `Medium_Phone_API_37.0` 可用但当时无在线设备；随后按项目命令启动并验证原生 AC-04。

Mobile 技能与文档：读取 `expo-overview`、`expo-data-fetching`、`expo-router`、`expo-ui`、`expo-native-ui`；项目 Expo SDK 为 58.0.24。原生取证按开发环境说明使用 Medium Phone AVD；通知流采用 FlatList，因为 `@expo/ui` 的 List 不虚拟化。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | Mobile 通知 API、前台刷新与店长角标 | `done` | AC-01：店长端未读数、99+、前台恢复只刷新一次且切页不轮询；通知 API 客户端与可见状态 |
| T02 | 店长与管理端收件箱、已读导航 | `done` | AC-02：已读/未读分组、下拉刷新、游标分页、标记已读及任务/审核/聊天路由 |
| T03 | Mobile 权限隔离与停用账号重登 | `done` | AC-03：跨商家账号只见本人数据；账号停用后重启回登录页 |
| T04 | 原生模拟器打回通知验收 | `done` | AC-04：模拟器中验证通知角标、点开任务条目、已读数清零并留截图 |
| T05 | 最终代码审查 | `done` | 全量机器门及独立只读审查；复核 AC-01～04、规格边界与差异 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01～T03 | passed | `FW_SLOT=1 pnpm e2e --config=playwright.mobile.config.ts tests/mobile/notifications.spec.ts`; `pnpm --filter @apps/mobile typecheck`; changed-file ESLint and Prettier；`adb shell input swipe 540 520 540 1500 650` | `tests/mobile/notifications.spec.ts`, `docs/work/FW-037-notifications-mobile/evidence/notification-refreshed.png` | 通知完整文件 7/7（55.1s），覆盖恢复前台只新增 1 次计数请求、切 Tab 不新增请求、99+、分组分页、已读导航、两端入口、跨商家和停用重登。AC-02 下拉刷新另在 Android 实测：停留空收件箱时向隔离槽位 1 写入一条通知，列表仍为空且无角标；原生下拉后显示「未读」「巡检任务逾期」，角标同步为 1；该条测试通知已按 ID 删除。Web 测试不声称覆盖原生手势。 |
| T04 | passed | `Invoke-WebRequest POST /api/tasks/{taskId}/items/{itemId}/decision`; `adb shell uiautomator dump`; 查询槽位 1 的通知已读状态与未读总数 | `docs/work/FW-037-notifications-mobile/evidence` | Android 模拟器店长端角标显示 1；真实 `item_rework` 在未读分组显示「检查项被打回」及原因；点开进入第 1 项「门头灯箱」，显示「当前结论：打回」；返回后通知位于「已读」分组，数据库未读数为 0。截图：`notification-badge.png`、`notification-inbox.png`、`notification-target.png`、`notification-cleared.png`。 |
| T05 | passed | `pnpm build`; `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm exec eslint tests/mobile/notifications.spec.ts tests/mobile/review-fixtures.ts`; `pnpm exec prettier --check tests/mobile/notifications.spec.ts tests/mobile/review-fixtures.ts`; `git diff --check`; `python scripts/validate_docs.py` | `apps/mobile`, `apps/api`, `apps/web`, `packages/shared` | 根构建、类型、lint、格式、测试文件检查和文档校验均通过；`validate_docs.py` 为 0 个问题。 |
| T05 | failed | `pnpm --filter @apps/mobile check` | `apps/mobile/package.json` | Expo 兼容表建议 `@expo/ui` 58.0.29、`expo` 58.0.26、`expo-file-system` 58.0.14、`expo-router` 58.0.32；仓库锁定的 patch 版本未改。当前 pinned 依赖的根 Android bundle、类型检查和 AC-04 原生流程均通过；不在本单元升级依赖，后续 SDK 依赖维护时再重跑此检查。 |
| T05 | failed | `FW_SLOT=2 pnpm e2e --config=playwright.mobile.config.ts` | `tests/web-results/mobile-slot-2` | 首轮全套 39/42。根因：旧 Tab 测试精确预期 3 项，新增通知后应为 4；聊天测试产生的 57 条通知未清理，污染后续精确 1/0 断言；审核夹具回拨 2h 使上海午夜判定落在昨天，被今日队列正确过滤。已修夹具清理与时间数据，不改生产查询和通知断言，后续完整复跑通过。 |
| T05 | failed | 独立 Subagent 审查完整差异及 `docs/howto/final-review.md` | `apps/mobile/components/mobile/notification-provider.tsx`, `apps/mobile/components/mobile/notification-inbox-screen.tsx` | 首轮发现旧分页污染刷新、旧计数覆盖已读，以及原生下拉刷新证据缺失；已用请求代次丢弃旧响应并补实测，后续定点复核全部关闭。 |
| T05 | passed | `FW_SLOT=2 pnpm e2e --config=playwright.mobile.config.ts`; `pnpm --filter @apps/mobile typecheck`; changed-file ESLint / Prettier；`git diff --check` | `tests/web-results/mobile-slot-2`, `tests/mobile/notifications.spec.ts` | 完整 Mobile 套件 42/42（2.8m），其中通知文件 7/7，原精确切 Tab 请求次数断言保留；另验证后台计数响应延迟到已读成功之后返回，角标仍为 0。聊天与审核夹具回归通过。原生与回归完成后经仓库 `seedDatabase()` 恢复隔离槽位 1、2 的种子数据；本任务 API / Metro、ADB reverse 和模拟器均已清理。 |
| T05 | passed | 独立 Subagent 定点复核首轮 3 条 findings（不重跑整轮审查） | `apps/mobile/components/mobile/notification-provider.tsx`, `apps/mobile/components/mobile/notification-inbox-screen.tsx`, `docs/work/FW-037-notifications-mobile/evidence/notification-refreshed.png` | 旧分页与计数响应均已失效处理，原生下拉证据已亲自看图确认；三条关闭，无阻塞。首轮七域：认证授权实时校验；越权按商家/本人限定；并发问题已修；数据解码与游标契约一致；无迁移；无新增敏感日志或凭据存储；结构对应 AC，无新增公共契约。分页刷新竞态由定点代码审查确认，未声称有对应自动化回归。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-11-17：AC-01 额外请求根因为店长「我的」页聚焦时通过 `onProfileChange` 写入新 Session 对象，触发 NotificationProvider 对 Session 对象的 effect；Provider 移到 authenticated layout 并改用用户 ID 作依赖后，切 Tab 断言与完整通知用例通过。
- 2026-11-18：最终全套回归补齐聊天派生通知清理，审核夹具不再人为把判定时间提前一小时；不改后端或放宽通知精确断言。Expo 配套版本检查失败为现有 patch 版本与当前兼容表不一致，本单元不升级依赖。
