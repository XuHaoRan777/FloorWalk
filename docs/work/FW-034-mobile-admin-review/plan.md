# Mobile 管理端（二）：审核与看板 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无（T05 已完成）
- 阻塞：无
- 下一步：无；已随 FW-030～FW-038 接力线按序归档。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

Preflight（2026-11-17）：起点 `c373535`，FW-032 `c7921a6`、FW-033 `c373535` 均在当前 `master`，工作区干净，文档校验 0 问题。本单元修改 Mobile 管理页面、客户端与仓库内 Mobile 测试，不改 API、shared、schema 或迁移。

Preflight：`local-pg18` 正常发布 5433，开发及槽位 1 端口无监听，`proc.mjs status` 为空，无已连接模拟器；仅用 `floorwalk` 角色只读统计开发库，现有任务 19、巡检 19。测试使用槽位 1，原生使用既有 Android API 37 AVD、Expo Go；服务起停使用 `scripts/dev/proc.mjs`。

Preflight：Expo `58.0.24`；已读 `ui-skills-root`、`expo-overview`、`expo-ui`、`expo-native-ui`、`expo-router`、`expo-data-fetching`，SDK 58 UI 官方页返回 200，沿用 FW-016 token 和 FW-033 管理组件。FW-033 尚未在线尾 Promote，`specs/mobile-admin.md` 缺失，先按已交付配置行为补齐事实入口，不改变已批准行为。

## 任务表

| ID  | 任务                       | 状态          | 交付的 AC 与证据                                                                    |
| --- | -------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| T01 | 审核队列、逐条判与改判     | `done`        | AC-01、AC-02：队列分组、详情、照片、AI 理由、上传人时间、手机控件、时间窗与分数刷新 |
| T02 | 今日任务与汇总             | `done`        | AC-03：门店任务、汇总、警告、待我处理和分数                                         |
| T03 | 周月看板与三维切换         | `done`        | AC-04：完成率、逾期、自检准确率、分数、门店/店长/日期趋势                           |
| T04 | Android 原生审核与分数取证 | `done`        | AC-05：AI 失败条目在原生判通过，看板分数更新，截图与数据清理                        |
| T05 | 最终代码审查               | `done`        | AC-01～AC-05：受影响模块套件、构建、独立只读审查                                    |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                              | artifact                                                               | 备注                                                                                                                                                                                                                                           |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-review.spec.ts` | `tests/mobile/admin-review.spec.ts`、`tests/mobile/review-fixtures.ts` | AC-01、AC-02：1/1 通过（49.6s），照片 naturalWidth=1、上传人时间和 AI 理由、打回理由与刷新持久化、重传、100→50→100 改判、宽限后禁打回。首轮夹具把历史 AI job 计入，按当前上传版本过滤后通过。finally 按精确任务/实体 ID 清理槽位库与本地照片。 |
| T02  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-today.spec.ts` | `tests/mobile/admin-today.spec.ts`、`tests/mobile/dashboard-fixtures.ts` | AC-03：1/1 通过（30.7s），覆盖各店任务、时间窗、汇总、严重项与逾期警告、人工待处理及入口，AI 审核中不显示；finally 按测试组织 ID 清理，关联 job 和 session 由外键级联删除。 |
| T03  | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-dashboard.spec.ts` | `tests/mobile/admin-dashboard.spec.ts`、`tests/mobile/dashboard-fixtures.ts` | AC-04：1/1 通过（31.7s），覆盖空状态与最近判定、周月四项指标、门店/店长/日期切换、无自检样本、每日折线与数据；finally 按测试组织 ID 清理。 |
| T04  | passed | Android 17 / API 37 模拟器，`node scripts/dev/proc.mjs start api --slot 1`、`start metro --slot 1`，原生逐条审核与看板核验；`pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-review.spec.ts` | `docs/work/FW-034-mobile-admin-review/evidence/dashboard-before.png`、`docs/work/FW-034-mobile-admin-review/evidence/review-queue.png`、`docs/work/FW-034-mobile-admin-review/evidence/review-detail.png`、`docs/work/FW-034-mobile-admin-review/evidence/review-approved.png`、`docs/work/FW-034-mobile-admin-review/evidence/dashboard-after.png` | AC-05：两条 AI 失败项转人工并在原生逐条判通过；判定时间后详情显示「通过 · 100 分」，测试门店平均分 `— → 100 分`、最近分数 `暂无 → 100 分`、最近判定 `暂无记录 → 已通过`。测试门店、任务、上传及调度器生成的额外未开始任务已清理，登录会话、服务、端口转发和模拟器已关闭。Windows 下首次 `NODE_OPTIONS` 绝对路径被 Node 当作 URL 协议，改为 file URL 后成功。夹具清理修复后审核测试 1/1 通过（49.8s）。 |
| T05  | passed | `FW_SLOT=1 pnpm e2e:mobile`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/chat.spec.ts`；同配置下运行 `tests/mobile/admin-dashboard.spec.ts`；`pnpm --filter @apps/mobile typecheck`；`pnpm lint`；`pnpm format:check`；`python scripts/validate_docs.py`；`pnpm --filter @apps/mobile build`；独立 Subagent 审查 `git diff --cached c373535` | `tests/mobile/chat.spec.ts`、`tests/mobile/admin-dashboard.spec.ts`、`apps/mobile/components/mobile/admin/use-admin-focus.ts`、`apps/mobile/components/mobile/admin/dashboard-trend.tsx` | 首次全量 29/30：既有聊天测试依赖种子返工状态，调度器判定后列表为空；改为从店长可访问的记录取聊天对象，单项复测 1/1 通过（52.9s）；全量未在修复后重跑。lint 因 JSX 全角空格报错，改为等价 Unicode 转义后通过；类型、格式、文档检查和 Android Hermes 导出通过。独立 Subagent 完成一次最终审查：认证与授权投影、越权与混淆代理未发现问题，本单元未改认证及权限语义；并发与幂等发现 P2 慢请求被 10 秒轮询持续淘汰，改为请求完成后再安排下一轮，失焦取消计时器；数据解码与序列化未发现问题；迁移与回滚不适用（无 schema、迁移变更）；敏感数据与日志未发现问题；范围与结构膨胀未发现问题。第 14 节认证、支付、权限及外部回调语义未变更。修复后类型检查通过，格式化受改文件，看板测试 2/2 通过（44.9s，含 11 秒慢请求）；同一独立审查者只复核该 finding，确认已解决、未发现新问题，审查者未运行测试。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->
