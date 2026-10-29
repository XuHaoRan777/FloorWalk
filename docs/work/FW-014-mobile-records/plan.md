# Mobile 记录页 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：无
- 阻塞：无
- 下一步：打 g02/done/FW-014，按并行组完成标记决定是否开 FW-015 集成对话。
- 并行组：g02，并行单元，槽位 3（并行 FW-012、FW-013、FW-014；集成 FW-015）

Preflight：只改 spec「批准记录」的写入范围。`records.controller.ts` 已由 FW-011 实现游标分页（含毫秒精度修复），本单元核对并补测试，不重写。T02 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-router` 与 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。Mobile 首屏在三槽并发时偶发加载超时（FW-011 记录，根因未定），遇到先单独重跑一次。

## 任务表

| ID  | 任务                                           | 状态   | 交付的 AC 与证据                                         |
| --- | ---------------------------------------------- | ------ | -------------------------------------------------------- |
| T01 | 记录列表 API 的分页完整性与权限测试            | `done` | AC-01、AC-04（API 部分）；`apps/api/src/records.test.ts` |
| T02 | 「记录」Tab 列表：加载更多、下拉刷新、三种状态 | `done` | AC-02、AC-05；`tests/mobile/records.spec.ts`             |
| T03 | 只读详情页                                     | `done` | AC-03、AC-04（界面部分）；`tests/mobile/records.spec.ts` |
| T04 | 最终代码审查（独立 Subagent）                  | `done` | 派审查前跑本槽位全部测试和全量门禁；审查记录             |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务                            | status | command                                                                                                                                                                                                      | artifact                                                                                              | 备注                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 / AC-01                     | passed | `FW_SLOT=3 pnpm --filter @apps/api test -- src/records.test.ts`                                                                                                                                              | `apps/api/src/records.test.ts`                                                                        | API 全页 id 顺序等于数据库本店全集，覆盖同毫秒边界、同店其他店员记录、外店隔离、主管/总部 403、limit=51 和伪造 cursor 400。创建的记录/用户在 afterAll 删除，连接关闭。初跑因 shared dist 未生成而未收集测试，构建 shared 后通过。                                                             |
| T02 前置阅读                    | passed | `read Expo skills and SDK 57 Router reference`                                                                                                                                                               | `apps/mobile/package.json`                                                                            | expo-overview → expo-router、expo-data-fetching；另按 overview 查 expo-ui、expo-native-ui 列表选择规则。SDK 57.0.31 / Router 57.0.29，官方版本文档 `https://docs.expo.dev/versions/v57.0.0/sdk/router.md`。                                                                                   |
| T02 / AC-02、AC-05              | passed | `FW_SLOT=3 pnpm e2e:mobile -- tests/mobile/records.spec.ts --workers=1`                                                                                                                                      | `apps/mobile/components/mobile/records-screen.tsx`; `tests/mobile/records.spec.ts`                    | 最新 5/5：对照实时 API 的首屏/加载更多/刷新；加载/空/失败提示；网络、400/403/404 中文提示、401 回登录。刷新时递增请求代次丢弃在途旧页，并以延迟旧页→刷新→旧页返回→取新第二页复现交错验证。原生 RefreshControl 与 Web 刷新按钮共用首屏函数；原生手势由 FW-015 回归。                           |
| T03 / AC-03、AC-04              | passed | `FW_SLOT=3 pnpm e2e:mobile -- tests/mobile/records.spec.ts --workers=1`                                                                                                                                      | `apps/mobile/app/(authenticated)/records/[id].tsx`; `tests/mobile/records.spec.ts`                    | 对照详情 API 的检查项/结果/备注、状态/分数、审核 ID 时间顺序；照片实际 img.complete 且 naturalWidth>0；聊天在底部且有输入/发送控件，无巡检编辑控件。创建同店其他店员，验证 inspectorId 非当前用户，从列表打开其详情核对专属备注和结果；测试记录/用户在 afterEach 删除。ChatPanel 挂载行未改。 |
| T04 机器门                      | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `FW_SLOT=3 pnpm --filter @apps/api test`; `FW_SLOT=3 pnpm e2e:mobile -- --workers=1`                                                       | `apps/api/src/records.test.ts`; `tests/mobile/records.spec.ts`                                        | 全量类型/lint/格式/API+Web+Mobile Android bundle 构建通过；API 34/34、Mobile Web 全套 13/13。审查修正后 Mobile 类型检查与 records.spec.ts 5/5 通过，包含新增竞态用例。                                                                                                                        |
| T04 槽位其余套件                | passed | `FW_SLOT=3 pnpm e2e`; `FW_SLOT=3 pnpm e2e:demo`; `FW_SLOT=3 pnpm e2e:cors`; `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts --workers=1`; `FW_SLOT=3 pnpm e2e:demo-ui -- --workers=1` | `tests/e2e/slot-facility.spec.ts`; `tests/demo/inspection-chain.spec.ts`; `tests/web/console.spec.ts` | 串行执行，槽位设施 1/1、API 演示链、CORS 3/3、Web 7/7、界面演示链 1/1。Web 首跑与独立重跑均连接拒绝；显式 NO_PROXY/no_proxy=127.0.0.1,localhost 后服务启动且通过，配置文件未修改。                                                                                                            |
| T04 独立最终审查与 finding 复核 | passed | `git diff g02/start..623152f`; `git diff 623152f`                                                                                                                                                            | `docs/howto/final-review.md`                                                                          | 独立 Subagent fw014_final_review；七域逐项见下。3 项 finding：api.ts 越界、同店其他店员详情缺证据、刷新/旧游标页竞态；均修复并由原审查者限项复核关闭。api.ts 净差异为空，详情直接引用批准的 records.ts。                                                                                      |

七个失败域：认证与授权投影通过（服务端按角色和 siteId）；越权与混淆代理通过（详情/照片沿用门店访问检查）；并发与幂等通过（旧页竞态已修）；解码与序列化通过（稳定游标/完整集合测试）；迁移与回滚不适用（契约/schema/迁移均未改）；敏感数据与日志未新增风险；范围与结构膨胀通过（api.ts 已还原，无新增契约字段或配置）。权限与错误路径有测试命令证据。

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-29 产品决定见 FW-011 plan「决策与偏差」：本店全部状态的单，10 条一页"加载更多"，详情一律只读、显示聊天且能发。
- 人工触点由 Claude 在集成复核时按类别补记；本单元停下时照常在这里写三行并打 `g02/blocked/FW-014`。

- 2026-10-29 验收边界：按用户授权仅 Expo Web，原生下拉手势留 FW-015 原生回归；不声称模拟器/真机已验。详情新增测试首轮发现 Pressable 直接放文本，已包 Text 修复；后续定位冲突改精确 Tab/按钮定位后 5/5 通过。
