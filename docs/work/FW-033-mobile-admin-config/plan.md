# Mobile 管理端（一）：配置 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无（T01～T06 全部完成）
- 阻塞：无
- 下一步：无；已随 FW-030～FW-038 接力线按序归档。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

Preflight：当前 `master` 工作区干净（`ahead 5`）；FW-029 交付提交 `2e39518` 在历史中。AC-02～AC-06 所需 API 与 shared 契约已存在，本单元仅改 Mobile，不改数据库、API 或共享类型。

Preflight：`apps/mobile` 为主要改动模块，覆盖认证分流、管理路由、管理 API 客户端、账号/门店/模板/标准/日程页面与测试；开发进程状态为空，3018～3020 未监听，`local-pg18` 在 5433 运行。

Preflight：Expo SDK 58；已读 `expo-overview`、`expo-ui`、`expo-native-ui`、`expo-data-fetching`、`expo-router`，SDK 58 Expo UI 官方文档可访问。Android AVD `Medium_Phone_API_37.0` 存在，当前无已连接模拟器；批准记录中的本地配置核对由用户手动完成，Agent 未读取 `.env*` 内容。

## 任务表

| ID  | 任务                 | 状态   | 交付的 AC 与证据                                        |
| --- | -------------------- | ------ | ------------------------------------------------------- |
| T01 | 管理员角色分流与主页 | `done` | AC-01：管理员看到管理入口，店长不显示并不能访问管理路由 |
| T02 | 账号与门店管理       | `done` | AC-02、AC-03：账号操作、门店操作与店长列表              |
| T03 | 模板与 AI 标准管理   | `done` | AC-04、AC-05：模板编辑、快捷配置、AI 标准 CRUD          |
| T04 | 日程与门店安排       | `done` | AC-06：七天任务编辑、批量选方案、跳过日期区间           |
| T05 | Android 模拟器验收   | `done` | AC-07：完整配置链路及刷新后保留的原生模拟器证据         |
| T06 | 最终代码审查         | `done` | AC-01～AC-07：机器门、原生证据复核、独立代码审查        |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                                                                                                                                                       | artifact                                                                                                                                                                                                                               | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin.spec.ts`                                                                                                                                 | `tests/mobile/admin.spec.ts`                                                                                                                                                                                                           | AC-01：2/2 通过。管理员六入口、无店长 Tabs、刷新和退出；店长不显示入口、受限管理路由回今日页。两轮修复分别解决 Stack Fragment/组织选择及重复 `/` 退出循环。                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T02  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-people.spec.ts`                                                                                                                          | `tests/mobile/admin-people.spec.ts`                                                                                                                                                                                                    | AC-02、AC-03：1/1 通过。覆盖门店新建、改名、停启、店长名单，以及店长新建、改名、调店、停启、重置密码和刷新保留；返回主页改为优先回退既有路由，避免命中隐藏的主页实例。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T03  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-templates.spec.ts`                                                                                                                       | `tests/mobile/admin-templates.spec.ts`                                                                                                                                                                                                 | AC-04、AC-05：1/1 通过。覆盖模板检查项增删改排序、照片张数/验收要点/严重项、AI 开关与标准、三套一键生成、标准增改删及引用时 409 拦截；finally 删除本任务模板、检查项与标准。                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T04  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-schedules.spec.ts`                                                                                                                       | `tests/mobile/admin-schedules.spec.ts`                                                                                                                                                                                                 | AC-06：1/1 通过。七天任务与按天停启、任务增删、跨夜 23:30～01:15、两店批量方案/跳过区间及刷新保留；finally 清理本任务跳过区间、方案绑定、方案与门店。日期时间控件原生分支另在 T05 取证。                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T05  | passed | Android `uiautomator dump`、原生交互及重启；`pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-people.spec.ts`                                                                              | `docs/work/FW-033-mobile-admin-config/evidence/android-account.png`、`android-quick-setup.png`、`android-template.png`、`android-time-picker.png`、`android-date-picker.png`、`android-overnight.png`、`android-refreshed-binding.png` | AC-07：Android 17 / API 37、Expo Go 58.0.5 上完成建店长、快捷配置、建含 AI 标准的模板、建跨夜方案、NB-001 应用方案和跳过区间；原生时间选择器设 23:30～01:15，显示「次日结束」，原生日期选择器设 2026-11-20 至 2026-11-22。强制关闭重开后刷新，方案、时间、跳过日期与备注仍保留，AndroidRuntime/ReactNativeJS 错误为空。两轮原生输入修复：Host 只匹配高度以保留整行宽；移除滞后 React 值回写原生共享状态以避免丢字符，第一轮对应测试 1/1 通过。验收数据通过既有 cleanupPeople/cleanupTemplates/cleanupSchedules 与精确 ID 删除绑定、跳过区间；复查用户/模板/标准/方案/绑定/跳过区间残留均为 0，NB-001 保留。 |
| T06  | passed | `pnpm --filter @apps/mobile typecheck`；`pnpm lint`；`pnpm --filter @apps/mobile build`；`FW_SLOT=1 pnpm e2e:mobile`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts tests/mobile/site-deactivated.spec.ts` | `tests/web-results/mobile-slot-1`                                                                                                                                                                                                      | 类型、lint、Android bundle 通过；Mobile 全套首次 25/27，全部管理端测试通过。两处失败根因为 Router 默认回退携带动态参数，以及停用门店测试遗留 FW-028 文案；根布局显式回退 `/`，测试对齐既有空任务行为并断言响应的 active 与 tasks。修复后类型检查及对应两文件 12/12 通过，保留历史可读验证，无店长产品行为变化。                                                                                                                                                                                                                                                                                             |
| T06  | passed | 独立 Subagent `fw033_final_review`；`git diff HEAD` 完整审查；`git diff` 定向复核；`pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-people.spec.ts`                                       | `apps/mobile/components/mobile/admin/use-admin-data.ts`、`tests/mobile/admin-people.spec.ts`                                                                                                                                           | 最终独立代码审查已核对七个失败域及 AC-01～AC-07 证据；初次发现 1 项 P2：旧刷新 GET 可覆盖刚保存的数据。已用请求代次使保存前发出的刷新失效，并在卸载时失效；既有门店配置用例延迟旧 GET 至改名成功后返回，列表及再次编辑保持新值。类型检查和对应测试 1/1 通过，finally 清理本任务账号和门店；原独立审查者仅复核该 finding，确认已关闭，无遗留问题。                                                                                                                                                                                                                                                           |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- `pnpm --filter @apps/mobile check` 发现既有 Expo `58.0.24` 低于当前工具建议的 `~58.0.25`；HEAD 已为该版本，本单元不扩为 SDK 升级。已核对锁定 Expo `58.0.24` 的 bundledNativeModules：`@expo/ui` 要求 `~58.0.28`，本次声明与安装的 `58.0.28` 匹配。

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->
