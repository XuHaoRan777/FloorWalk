# 巡检单聊天 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：全部完成
- 阻塞：无
- 下一步：打完成标记，按并行组规则开 FW-015 集成对话；本分支不归档、不推送。
- 并行组：g02，并行单元，槽位 1（并行 FW-012、FW-013、FW-014；集成 FW-015）

Preflight：只改 spec「批准记录」的写入范围。T03、T04 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。Mobile 首屏在三槽并发时偶发加载超时（FW-011 记录，根因未定），遇到先单独重跑一次，不当成本单元的 bug。

## 任务表

| ID  | 任务                                                         | 状态      | 交付的 AC 与证据                                                            |
| --- | ------------------------------------------------------------ | --------- | --------------------------------------------------------------------------- |
| T01 | API 边角与权限测试                                           | `done` | AC-06（API 部分）；`apps/api/src/chat.test.ts`                              |
| T02 | Web 聊天面板：列表、加载更早、轮询与可见性、发文字与图、错误 | `done` | AC-01～AC-05、AC-08 的 Web 部分，AC-06 的总部只读；`tests/web/chat.spec.ts` |
| T03 | Mobile 聊天面板（Expo Web）                                  | `done` | AC-01～AC-05、AC-08 的 Mobile 部分；`tests/mobile/chat.spec.ts`             |
| T04 | Mobile 原生往返（模拟器）                                    | `done` | AC-07                                                                       |
| T05 | 最终代码审查（独立 Subagent）                                | `done` | 派审查前跑本槽位全部测试和全量门禁；审查记录                                |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `pnpm --filter @libs/shared build`; `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 pnpm --filter @apps/api test -- src/chat.test.ts` | `apps/api/src/chat.test.ts` | 首次类型检查因 shared 尚未构建失败；构建后复跑通过。测试结束删除新增消息和会话。 |
| T02 | passed | `pnpm --filter @apps/web typecheck`; `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts tests/web/chat.spec.ts --workers=1` | `apps/web/src/components/console/chat-panel.tsx`; `tests/web/chat.spec.ts` | 最终修复后通过：保留原分页、权限、图片 naturalWidth 强断言；补交错发送不漏消息、空轮询/新消息不改历史按钮、发送中禁用、403/409/422 失败保留与重试、断网稳定单提示/恢复补拉、非法类型/超 10MB 无发送、401 中文提示后照常回登录。错误定位限定聊天 region，避免混入审核错误。HQ 步骤限定 #main；存储临时映射 API 3110，待 FW-015 修配置后移除。测试删除消息及文件。 |
| T03 | passed | `pnpm --filter @apps/mobile typecheck`; `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e:mobile tests/mobile/chat.spec.ts --workers=1` | `apps/mobile/components/mobile/chat-panel.tsx`; `tests/mobile/chat.spec.ts` | 最终修复后通过：真实 API 最近 50 条、before 分页且消息相对容器锚点不跳、轮询历史按钮保持、交错发送、hidden/blur 请求计数停止和恢复立即补拉、1001 字禁用、busy/401/403/409/422/断网保留重试及自动补拉、类型/大小拦截、图文上传。403 后签名接口恰好重取一次，图片 naturalWidth>0；RN Web ImageLoader/隐藏 img/CSS 会产生多个图片请求，按签名次数验证而非内部请求次数。清理消息 RETURNING storage_key 并删对应文件。预读 expo-overview、expo-data-fetching；SDK57 文档 TLS EOF，核对锁定包57.0.20/57.0.7 类型定义。 |
| T02 | failed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts tests/web/chat.spec.ts` | `tests/web/chat.spec.ts` | 实验 1：首次图片请求 HTTP 403 后，签名重取接口 200、重试图片请求发生，但 `naturalWidth` 仍为 0；`route.abort()` 并非唯一原因。 |
| T02 | passed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts tests/web/chat.spec.ts` | `tests/web/chat.spec.ts` | 实验 2：消息图的 `src` 仅变更 2 次（初始和一次重取），无轮询反复覆盖；重取后属性为新 URL，采样时 `currentSrc` 仍为旧 URL。 |
| T02 | failed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts tests/web/chat.spec.ts` | `tests/web/chat.spec.ts` | 实验 3：独立 `Image` 加载同样失败；Playwright 报 `ECONNREFUSED 192.168.110.17:3018`，无 HTTP 响应头可读。签名 URL 指向开发地址，槽位 API 实际在 3110；配置未覆盖 `API_PUBLIC_BASE_URL`。 |
| T02 | blocked | `pnpm --filter @apps/web typecheck`; `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts tests/web/chat.spec.ts` | `tests/web/chat.spec.ts` | 一次修复将图片请求映射至槽位 API 后，重签名 200、存储响应 200、`naturalWidth > 0` 均通过；随后 HQ 只读测试因按钮严格定位命中侧栏与内容区两个元素失败。按用户要求不做第二次修复。 |
| T04 | passed | `FW_SLOT=1 expo start --lan --android --port 3112`; `adb -s emulator-5554 reverse / push / uiautomator dump / input tap / logcat` | `apps/mobile/components/mobile/chat-panel.tsx` | Expo Go 巡检页独立文字、相册图片到 Web 主管分别 931ms、1956ms（naturalWidth=1），Web 回复在原生同页 3254ms 出现；afac02d 最终代码原生回归文字 2957ms、相册图 1944ms、Web 回复 2115ms，均在 5 秒内且未重开页面；两次 logcat 均无 JS/AndroidRuntime 错误。真实 API 准备 submitted 巡检进入审核队列，结束按 ID 删除聊天、照片、审核、检查项、巡检和 4 个存储文件，最终回归另清理巡检 16f26ef6-aef1-4f58-bdb6-36f4c5d54af0 及其 3 个文件，删除模拟器图片；按端口核对并停 API、Web、Metro、AVD，移除 reverse。 |
| T05 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `FW_SLOT=1 pnpm --filter @apps/api test`; `FW_SLOT=1 pnpm e2e`; `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e --config=playwright.web.config.ts --workers=1`; 同环境 `pnpm e2e:mobile --workers=1`、`pnpm e2e:cors`、`pnpm e2e:demo`、`pnpm e2e:demo-ui --workers=1`、槽位 VITE_API_BASE_URL 构建后 `pnpm e2e --config=playwright.csp.config.ts --workers=1` | `tests/web/chat.spec.ts`; `tests/mobile/chat.spec.ts` | 类型、lint、格式、三端构建通过；API 35、隔离 1、Web 8、Mobile 10、CORS 3、界面演示链 1、CSP 1 通过，API 演示链通过。Web 首次默认双 worker 与审核测试抢同单，改单 worker 后通过；CSP 首次默认产物指向 3018，按槽位重建后通过。Expo 在线依赖检查 TLS 失败，EXPO_OFFLINE=1 检查依赖匹配（工具提示离线可靠性有限）。套件同槽串行，种子及各测试清理本槽数据。 |

| T05 | passed | `git diff g02/start`; 仅复核修复提交 `afac02d` | `apps/web/src/components/console/chat-panel.tsx`; `apps/mobile/components/mobile/chat-panel.tsx`; `tests/web/chat.spec.ts`; `tests/mobile/chat.spec.ts` | 独立 Subagent 最终审查逐项走七个失败域；首轮 5 项 finding 修复后原审查者仅复核这些项，全部关闭，无剩余 finding。未改契约、schema、迁移或 package.json。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->


## 回修

T05 审查记录：独立 Subagent 首轮指出 5 项，均在批准文件中修复：接收游标只由 GET 推进，历史分页只由首次/before 维护，Mobile 高度差恢复滚动锚点，补 AC-03/04/05/08 客观测试，清理 Mobile 上传文件。Web 401 全局处理会卸载面板，聊天客户端在继续抛错回登录前用中文提示框展示错误；认证处理未变。针对两面板和客户端的类型、lint/格式检查及两个聊天测试文件通过；原审查者对 afac02d 仅复核这 5 项，全部关闭，无剩余 finding。


<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-29 产品决定见 FW-011 plan「决策与偏差」：店员（本店）与主管能发、总部只读，结束后仍可发，文字和图，2 秒轮询，不做已读、通知、编辑、删除。
- 人工触点由 Claude 在集成复核时按类别补记；本单元停下时照常在这里写三行并打 `g02/blocked/FW-012`。
- 用户 2026-10-29 选 B：继续定位并修复 AC-05，不降低 AC，不放宽断言；完成三个区分实验后只做一次修复。
- 根因判断：`playwright.web.config.ts` 的槽位 API 环境未设置 `API_PUBLIC_BASE_URL`（mobile、demo、csp 配置均已设置），签名图片地址指向开发地址。本单元 `tests/web/chat.spec.ts` 的 `/storage` 请求改写是临时绕过，待 FW-015 在 master 修好配置后删除。
- 用户 2026-10-29 授权 A：HQ 只读步骤的「审核队列」定位限定到内容区，只改定位、不放宽断言，并把改动写进证据。
- T04 开始核对发现 T03 曾在范围外 `apps/mobile/lib/api.ts` 增加签名函数导出；已收回该差异，面板直接引用批准范围内的 `lib/api/chat.ts`。
- T05 独立 Subagent 首轮审查发现 5 项：发送响应推进游标漏消息、增量轮询覆盖历史分页状态、Mobile 前插滚动跳动、AC-03/04/05/08 部分证据缺口、Mobile 测试存储文件残留。当前修复这些 finding 并仅复核这些项，尚未 verified。
