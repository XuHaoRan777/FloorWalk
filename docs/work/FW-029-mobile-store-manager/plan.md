# Mobile 店长端 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：全部任务完成
- 阻塞：无
- 下一步：已于 2026-11-12 Promote 并归档接力线 FW-024～FW-029。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

Preflight：涉及 `apps/mobile`、`packages/shared`、`apps/api`；SDK 57 已有 `expo-image-picker`，用户动作可调起系统相机。FW-028 提交 `6ed277e` 存在且 `packages/shared/src/contract/` 可读；`proc.mjs status` 为空，3018–3020 未监听，`local-pg18` 发布 5433。

Preflight：`python scripts/validate_docs.py --env-keys` 报 workflow.conf 没有可检查的配置分组；按接力批准记录由用户手动核对配置，Agent 未读取 `.env*` 内容。

T02：已读取 Expo `expo-overview`、`expo-router`、`expo-native-ui`、`expo-ui`、`expo-data-fetching` 技能；Mobile 固定 Expo SDK 57.0.32，已核对 [ImagePicker SDK 57 文档](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/) 中 `launchCameraAsync`。详情接口新增选择由用户于 2026-11-11 确认，见 spec 批准记录。

## 任务表

| ID  | 任务                     | 状态          | 交付的 AC 与证据                                                                 |
| --- | ------------------------ | ------------- | -------------------------------------------------------------------------------- |
| T01 | 今日任务 API 与列表      | `done`        | AC-01：本店任务、模板名、时间窗、四种状态和跨零点显示；API 契约测试与 Mobile e2e |
| T02 | 任务详情读取与时间状态   | `done`        | AC-02、AC-04、AC-07：检查项、结论、提交人、上传时间、操作窗口及聊天              |
| T03 | 相机拍摄、逐项上传与刷新 | `done`        | AC-03、AC-05、AC-08：相机限定、张数/备注门槛、同店最新提交人、模拟器主流程       |
| T04 | 按任务显示记录           | `done`        | AC-06：任务状态与分数、调店后仅可见参与过的历史                                  |
| T05 | 最终代码审查             | `done`        | AC-01～AC-08：受影响套件、类型检查、lint、构建、原生模拟器证据及独立审查         |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                                                                                                                                                                                       | artifact                                                                                                                                                                | 备注                                                                                                                                                     |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `pnpm --filter @apps/api test -- tasks.test.ts`; `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts --grep "今日任务显示模板、四种状态"`                                                                                                        | `apps/api/src/tasks.test.ts`; `tests/mobile/mobile-inspection.spec.ts`                                                                                                  | 同店、同商家时区日期过滤通过；页面显示四种状态和 `22:00～次日 00:30`。                                                                                   |
| T02  | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- tasks.test.ts`; `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/mobile typecheck`; `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts --grep "任务详情显示检查项结论、操作时间和巡检聊天"` | `apps/api/src/tasks.test.ts`; `apps/api/src/inspection.controller.ts`; `tests/mobile/mobile-inspection.spec.ts`; `apps/mobile/components/mobile/task-detail-screen.tsx` | API 7/7、API 与 Mobile 类型检查通过；详情页 1/1 通过，覆盖失败重试、跨午夜、四类结论、提交信息、隐藏理由及聊天。首轮因同文案定位重复，限定详情页后通过。 |
| T03  | passed | `pnpm --filter @apps/mobile typecheck`; `pnpm exec prettier --check ...`; `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts --grep "逐项拍照上传"`; `FW_SLOT=1 pnpm --filter @apps/api test -- tasks.test.ts`; Android `Medium_Phone_API_37.0` 原生拍照、上传、API 打回与重传 | `apps/mobile/components/mobile/task-item-card.tsx`; `apps/mobile/components/mobile/task-detail-screen.tsx`; `apps/mobile/lib/api/inspection.ts`; `tests/mobile/mobile-inspection.spec.ts`; `docs/work/FW-029-mobile-store-manager/evidence/fw029-camera-preview.png`; `docs/work/FW-029-mobile-store-manager/evidence/fw029-first-upload-pending.png`; `docs/work/FW-029-mobile-store-manager/evidence/fw029-item-rework.png`; `docs/work/FW-029-mobile-store-manager/evidence/fw029-resubmitted.png` | Mobile 类型与格式检查通过；Mobile e2e 1/1、API 7/7 通过。模拟器相机拍到虚拟场景；首传待审，管理员 API 打回后店长重传，详情显示待审、最新提交人/时间，任务状态已提交。 |
| T04  | passed | `pnpm --filter @libs/shared build`; `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/mobile typecheck`; `pnpm exec prettier --check apps/api/src/records.controller.ts apps/api/src/records.test.ts apps/mobile/components/mobile/records-screen.tsx packages/shared/src/contract/index.ts tests/mobile/records.spec.ts`; `FW_SLOT=1 pnpm --filter @apps/api test -- records.test.ts`; `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/records.spec.ts`; `pnpm --filter @apps/api build` | `apps/api/src/records.controller.ts`; `apps/api/src/records.test.ts`; `apps/mobile/components/mobile/records-screen.tsx`; `tests/mobile/records.spec.ts` | API 与 Mobile 类型检查、格式检查和 API 构建通过；API 2/2、Mobile e2e 5/5。验证任务与旧记录字段、状态和分数展示，以及调店后的原门店参与记录投影。 |
| T05  | failed | 独立 Subagent 按 `docs/howto/final-review.md` 审查 FW-029 完整差异 | `docs/howto/final-review.md`; `tests/mobile/mobile-inspection.spec.ts` | P2：AC-04 未有 Mobile 证据覆盖截止后禁用、重传宽限边界及 API 拒绝提示；已增加定向 e2e，待复核。 |
| T05  | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts --grep "截止后禁用未上传项"`; 独立 Subagent 定向复核 | `tests/mobile/mobile-inspection.spec.ts`; `docs/howto/final-review.md` | 1/1；P2 finding 复核通过，覆盖截止后未上传项禁用、宽限内重传、409 中文提示及宽限到期后禁用。 |
| T05  | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm --filter @apps/mobile check`; `pnpm build`; `FW_SLOT=1 pnpm --filter @apps/api test -- tasks.test.ts records.test.ts contract.e2e.test.ts`; `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts tests/mobile/records.spec.ts` | `apps/api/src/tasks.test.ts`; `apps/api/src/records.test.ts`; `apps/api/src/contract.e2e.test.ts`; `tests/mobile/mobile-inspection.spec.ts`; `tests/mobile/records.spec.ts`; `apps/mobile/dist/metadata.json` | 类型、lint、格式、Expo 依赖检查、根构建通过；API 24/24、Mobile e2e 16/16。Vite 报告未修改 Web bundle 533.59 kB 超过 500 kB 提示。原生模拟器 AC-08 证据见 T03。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-11-11：用户选择 A；AC-02 改为只显示打回结论，理由留给后续 AI 审核单元，不扩展 FW-028 判定写契约。
- 2026-11-11：用户选择新增 `GET /api/inspector/tasks/:taskId` 按需读取任务详情，按 AC-02、AC-04 所需最小字段返回；详情按当前门店授权并隐藏打回理由、自评、备注与存储信息。
