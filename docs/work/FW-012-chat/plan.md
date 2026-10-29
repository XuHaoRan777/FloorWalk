# 巡检单聊天 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`blocked`
- 归档状态：`active`
- 当前任务：T02
- 阻塞：T02 AC-05 图片签名地址重取后，浏览器图片仍未成功解码；两轮修复后仍失败。
- 下一步：等待用户决定图片重试失败后的处理方向。
- 并行组：g02，并行单元，槽位 1（并行 FW-012、FW-013、FW-014；集成 FW-015）

Preflight：只改 spec「批准记录」的写入范围。T03、T04 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。Mobile 首屏在三槽并发时偶发加载超时（FW-011 记录，根因未定），遇到先单独重跑一次，不当成本单元的 bug。

## 任务表

| ID  | 任务                                                         | 状态      | 交付的 AC 与证据                                                            |
| --- | ------------------------------------------------------------ | --------- | --------------------------------------------------------------------------- |
| T01 | API 边角与权限测试                                           | `done` | AC-06（API 部分）；`apps/api/src/chat.test.ts`                              |
| T02 | Web 聊天面板：列表、加载更早、轮询与可见性、发文字与图、错误 | `blocked` | AC-01～AC-05、AC-08 的 Web 部分，AC-06 的总部只读；`tests/web/chat.spec.ts` |
| T03 | Mobile 聊天面板（Expo Web）                                  | `pending` | AC-01～AC-05、AC-08 的 Mobile 部分；`tests/mobile/chat.spec.ts`             |
| T04 | Mobile 原生往返（模拟器）                                    | `pending` | AC-07                                                                       |
| T05 | 最终代码审查（独立 Subagent）                                | `pending` | 派审查前跑本槽位全部测试和全量门禁；审查记录                                |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `pnpm --filter @libs/shared build`; `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 pnpm --filter @apps/api test -- src/chat.test.ts` | `apps/api/src/chat.test.ts` | 首次类型检查因 shared 尚未构建失败；构建后复跑通过。测试结束删除新增消息和会话。 |
| T02 | blocked | `pnpm --filter @apps/web typecheck`; `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts tests/web/chat.spec.ts` | `apps/web/src/components/console/chat-panel.tsx`; `tests/web/chat.spec.ts` | 类型检查通过；e2e 的分页、可见性轮询、跨账号更新、文字发送与签名重取 API 均通过，重取后的图片解码失败。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-29 产品决定见 FW-011 plan「决策与偏差」：店员（本店）与主管能发、总部只读，结束后仍可发，文字和图，2 秒轮询，不做已读、通知、编辑、删除。
- 人工触点由 Claude 在集成复核时按类别补记；本单元停下时照常在这里写三行并打 `g02/blocked/FW-012`。
- 卡在哪一步：T02 AC-05，图片请求失败后客户端成功调用签名重取端点（HTTP 200）并再次请求图片，但浏览器 `naturalWidth` 持续为 0。
- 要我定什么：是否先只交付图片选择与发送，还是要求本单元继续查清图片重取后无法显示的原因再推进 T03。
- 可选项和我的倾向：A 允许先交付其他 Web 聊天行为并把图片解码问题留待后续；B 继续定位并修复 AC-05 后再推进。我倾向 B，因为批准的 AC 明确要求图片可显示及过期签名重试。
