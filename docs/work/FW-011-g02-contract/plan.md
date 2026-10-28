# g02 契约：聊天、门店与模板、记录页 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`blocked`
- 归档状态：`active`
- 当前任务：T07 三道开组门与 master 全量门禁
- 并行组：g02，契约单元，槽位 1（并发隔离门使用 1～3）
- 阻塞：T07 恢复后，demo-ui 定位与 file-map 目录问题已修复；但三槽位并发门的 Mobile 冷启动仍有 `page.goto('/')` 120 秒超时，AC-09 未通过，AC-10 本轮未覆盖完。
- 下一步：等待用户决定是否再授权修复门禁启动/执行流程；不进入 T08，不标记 verified 或归档。

Preflight：动 `packages/shared/src/contract/`、`apps/api/src/db/schema.ts`、`apps/api/drizzle/`（均为 hardline）、`apps/api/src`、`apps/web/src`、`apps/mobile`（`app/`、`components/`、`lib/`）、`tests/`、`scripts/demo-chain.mjs`；不动 `package.json`、锁文件。全程用槽位 1，三道门的并发隔离用 1～3。T06 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-router` 与 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。

## 任务表

| ID  | 任务                                             | 状态      | 交付的 AC 与证据                                                                    |
| --- | ------------------------------------------------ | --------- | ----------------------------------------------------------------------------------- |
| T01 | 表、迁移、种子；契约 schema、类型与路由表        | `done` | AC-02；AC-01 的契约代码部分；机器门（迁移在空库与槽位库跑通、类型检查、契约包构建） |
| T02 | 门店、模板、记录页骨架接口与三处现有接口的新字段 | `done` | AC-03；契约 e2e 中这几条路由的放行与拒绝                                            |
| T03 | 聊天接口完整实现（含 `before` 分页）             | `done` | AC-04、AC-11；契约 e2e 中聊天路由                                                   |
| T04 | API 演示链加聊天与记录页两步                     | `done` | AC-07（聊天两步绿）                                                                 |
| T05 | 两端注册行、分区、Tab、空页与简陋 `ChatPanel`    | `done` | AC-05、AC-06；Web e2e、`e2e:mobile`                                                 |
| T06 | 跨端最薄链路（模拟器）                           | `done` | AC-08                                                                               |
| T07 | 三道开组门与 master 全量门禁                     | `blocked` | AC-09、AC-10                                                                        |
| T08 | 最终代码审查（独立 Subagent）                    | `pending` | 审查记录                                                                            |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| 启动 | passed | `git rev-parse HEAD` | `docs/work/FW-011-g02-contract/plan.md` | 开工基线 `6a82f9ee1c259e595c016d3662d806893f20bf1e`；`git status --short` 为空；`python scripts/validate_docs.py` 通过。 |
| T01 / AC-01 | passed | `$env:FW_SLOT='1'; pnpm --filter @libs/shared typecheck; pnpm --filter @libs/shared build; pnpm --filter @apps/api typecheck` | `packages/shared/src/contract/index.ts`, `apps/api/src/db/schema.ts` | 契约路由、schema 和结构声明通过检查；首次类型检查发现路由联合类型缺少 spec 要求的 `PUT`，已修正后通过。 |
| T01 / AC-02 | passed | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/db/seed.test.ts; pnpm e2e -- --grep "slot resources are isolated"` | `apps/api/drizzle/0002_g02_contract.sql`, `apps/api/src/db/seed.test.ts` | 现有槽位迁移/种子 4 项通过；空 schema 重建迁移及种子通过；当前模板恰好 1 个，NB-002 打回单有主管文字与店员 JPEG 消息且文件存在。初始迁移已含 template_items 唯一约束，新迁移不重复添加；旧 Drizzle 快照此前未登记，当前快照已补正。 |
| T01 / 机器门 | passed | `git diff --check` | `apps/api/drizzle/meta/0002_snapshot.json` | 无空白错误；不新增依赖。 |
| T02 / AC-03 | passed | `$env:FW_SLOT='1'; pnpm --filter @libs/shared build; pnpm --filter @apps/api typecheck; pnpm --filter @apps/api test -- src/contract.e2e.test.ts -t "serves the new records"; git diff --check` | `apps/api/src/admin.controller.ts`, `apps/api/src/records.controller.ts`, `apps/api/src/contract.e2e.test.ts` | 门店/模板/记录路由调用、schema 与放行/拒绝角色通过；today、建单、看板补 active/current 契约。首次 e2e 因设当前模板的 POST 默认 201 失败，按契约固定为 200 后通过。 |
| T03 / AC-04 | passed | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/contract.e2e.test.ts` | `apps/api/src/chat.controller.ts`, `apps/api/src/contract.e2e.test.ts` | 聊天文本/图片发读、作者字段、跨店拒绝、总部只读、已结束单可发、签名 URL 读取及数据清理均通过。初次运行失败的是测试对空历史的多余断言，移除后通过。 |
| T03 / AC-11 | passed | `$env:FW_SLOT='1'; pnpm --filter @apps/api test -- src/contract.e2e.test.ts` | `apps/api/src/chat.controller.ts`, `packages/shared/src/contract/index.ts` | 无游标最近 50 条、before 更早页、after 新消息、游标互斥 400 均有断言；`seq` 以十进制字符串承载 bigint。 |
| T03 / 机器门 | passed | `$env:FW_SLOT='1'; pnpm --filter @libs/shared build; pnpm --filter @apps/api typecheck; pnpm --filter @apps/api lint; git diff --check` | `apps/api/src/chat.controller.ts` | 全部通过；完整 API 契约 e2e 共 8 项通过。 |
| T04 / AC-07 | passed | `$env:FW_SLOT='1'; pnpm e2e:demo` | `scripts/demo-chain.mjs` | 槽位 1 完整 API 演示链退出码 0；日志确认 NB-002 主管文字、店员图片往返两条新消息，店员记录第一页含打回单。演示 API 已停止，3110 无监听。首次运行的图片读取指向配置主机导致拒绝连接，脚本改用本地槽位 API 的签名路径后通过。 |
| T05 / Mobile 阅读前置 | passed | `Get-Content expo-overview, expo-router, expo-data-fetching, ui-skills-root, expo-ui, expo-native-ui; Invoke-WebRequest Expo SDK v57 imagepicker docs` | `C:/Users/29019/.agents/skills/expo-overview/SKILL.md`, `C:/Users/29019/.agents/skills/expo-router/SKILL.md`, `C:/Users/29019/.agents/skills/expo-data-fetching/SKILL.md` | 已按总览分流读取 Router 与数据获取；UI 工作规则及 expo-ui/native-ui 已读；核对 Expo SDK `57.0.31`、Router `57.0.29`、ImagePicker `57.0.20` 与 SDK 57 官方 ImagePicker 文档，继续沿用已有 RN 控件/原生 `expo-file-system File` 上传，不加依赖。 |
| T05 / AC-05、AC-06 | passed | `$env:FW_SLOT='1'; pnpm --filter @libs/shared build; pnpm --filter @apps/web typecheck; pnpm --filter @apps/mobile typecheck; pnpm --filter @apps/web lint; pnpm --filter @apps/mobile lint; NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm exec playwright test --config playwright.web.config.ts; $env:FW_SLOT='1'; pnpm e2e:mobile; git diff --check` | `apps/web/src/pages/console.tsx`, `apps/web/src/components/console/chat-panel.tsx`, `apps/mobile/app/(authenticated)/(tabs)/records.tsx`, `apps/mobile/components/mobile/chat-panel.tsx`, `tests/web/console.spec.ts`, `tests/mobile/mobile-inspection.spec.ts` | 类型、lint 与 diff 检查通过；Web 7/7、Mobile 9/9。Mobile 测试曾因既有 Tab 数量断言仍为 2 而失败，断言更新为 3 并验证「记录」标签后全套通过；未放宽行为断言。Web 侧覆盖主管/总部管理入口、店员无入口和主管聊天输入。Web/Mobile e2e 串行使用槽位 1；结束后 3110–3112 无监听进程。不加依赖。 |
| T06 / AC-08 | passed | `Android 17 模拟器 + Expo Go；adb reverse 3110/3112；Android 系统相册选图；Web 审核页查看并回复；重开 Mobile 巡检页；签名图 HTTP 读取；adb logcat` | `docs/work/FW-011-g02-contract/evidence/mobile-chat.png`, `docs/work/FW-011-g02-contract/evidence/mobile-reopened.png` | 模拟器店员登录 NB-001 并打开同一巡检；从系统 Photos 选图，原生 multipart 发送图文；Web 主管重开审核详情看到店员消息和图片，并发送 `FW011-web-reply-20261028`；重开 Mobile 同单后 UI 树显示主管回复。API GET 返回 2 条（店员图文、主管文字），签名图 URL 200、`image/png` 且 PNG magic bytes 正确；原生 `adb logcat -d -s ReactNativeJS:V Expo:V ReactNative:V` 未见 JS Error/Unhandled。`Cannot connect to Expo CLI` 不作为失败判据。结束后关闭本次 API/Web/Metro/AVD；项目 `seedDatabase` 恢复槽位 1 标准种子并清理临时聊天及图片；3110–3112 已释放。不加依赖。 |

| T07 / AC-09、AC-10 | failed | 门一：只读 Subagent 对流程、路由与状态迁移作静态复核；门二：`$env:FW_SLOT='1'; node --env-file=apps/api/.env.development scripts/api-snapshot.mjs docs/work/FW-011-g02-contract/evidence/t07-fresh-api.json`；定位修复：`pnpm --filter @apps/mobile typecheck`; `$env:FW_SLOT='1'; $env:NO_PROXY='127.0.0.1,localhost'; $env:no_proxy='127.0.0.1,localhost'; pnpm e2e:demo-ui`；门三：`node --env-file=apps/api/.env.development scripts/e2e-isolation.mjs`（脚本内部并发使用槽位 1～3） | `docs/work/FW-011-g02-contract/evidence/t07-fresh-api.json`, `logs/e2e-isolation/result.json`, `logs/e2e-isolation/slot-1-mobile.log`, `logs/e2e-isolation/slot-2-mobile.log`, `logs/e2e-isolation/slot-3-mobile.log` | 门一发现 NB-002 演示链漏真实重新提交→start→rework，补齐后由独立只读上下文复核；门二真请求快照覆盖路由三角色、种子不变量、NB-002 打回单及真实 JPEG 签名读取，finally 重建槽位种子并清理上传。此前完整门禁曾通过 API 32/32、e2e 1/1、Web 7/7、Mobile 9/9、CORS 3/3、API 演示链；demo-ui 仅槽位 2 过，另两槽位因宽泛定位失败。2026-10-29 用户授权继续后，将定位改为精确 Tab role，断言仍为可见；初始化槽位 file-map 目录并显式传递 FW_SLOT。Mobile 类型检查通过，槽位 1 demo-ui 1/1 通过，缓存 ENOENT 未再出现。重过门时七条命令缺 FW_SLOT 均按预期拒绝；槽位 API 32/32、e2e 1/1、Web 7/7 均过；Mobile 槽位 1、2 各 4/9，槽位 3 为 6/9，失败均在 `page.goto('/')` 等待 `load` 达到既有 120 秒测试上限（部分记录 `net::ERR_ABORTED`）；未改断言或超时。门禁脚本在一个槽位命令失败时停止该槽后续命令，故本轮 CORS、API demo、demo-ui 未运行。开发库快照 `unchanged: true`。三道门未全绿，AC-09 失败、AC-10 尚未在本轮完整覆盖；master 全量门禁未完成，T08 未启动。 |
| T07 / 停止收尾 | passed | `Get-NetTCPConnection -State Listen`；`Get-CimInstance Win32_Process`；`git diff --check` | `docs/work/FW-011-g02-contract/plan.md` | 核对 3018～3020 与 3110～3132 各槽位端口均无监听，无本轮 API/Web/Metro/模拟器残留进程（Codex 工具 runtime 不属测试进程）；保留失败日志与 trace。本地保存阻塞检查点，T07 不标 done，不推送。文档校验另报既有 `testlog-debt`，见「决策与偏差」。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |
| 2026-10-29 | 用户回复「继续」，授权恢复 T07 | 收紧 demo-ui Tab 定位；确保槽位 file-map 目录存在并显式传递 FW_SLOT | 待提交 |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-28 用户定 g02 产品决定：聊天店员（本店）与主管能发、总部只读，结束后仍可发，文字和图，2 秒轮询（以后做推送），不做已读、通知、编辑、删除；只做门店和模板，用户管理移出；总部、主管可管；直接改原模板（建单时复制检查项，已有单不受影响）；门店停用不删，历史正常显示；记录页本店全部单，10 条一页，可看只读详情。
- 2026-10-28 用户采纳补充默认：全店共用一个当前模板，模板不能删、不做按店分配；停用门店的店员仍能登录、不能新建、已提交的单可审完、看板标已停用、可重新启用；记录页"加载更多"，详情一律只读、显示聊天且能发。
- 2026-10-28 用户采纳默认 A～I 与建议 1（聊天 `before` 分页）。
- 2026-10-28 聊天接口在契约单元做完整实现，不是固定数据骨架：跨端最薄链路要真实往返。聊天并行单元负责 2 秒轮询、可见性暂停、往上翻页、界面与体验，以及 API 上的边角修正。
- 2026-10-28 并行单元写入范围（开并行单元时写进各自 spec）：聊天 = API `chat.controller.ts`，两端 `chat-panel.tsx`、`lib/api/chat.ts`；门店与模板 = API `admin.controller.ts`、`inspection.controller.ts`（today 与建单的停用效果）、`dashboard.controller.ts`，Web 管理页组件、`dashboard-view.tsx`、`lib/api/admin.ts`，Mobile `today-screen.tsx`（停用提示）；记录页 = API `records.controller.ts`，Mobile 记录 Tab 页、列表组件、`records/[id].tsx`、`lib/api/records.ts`。`app.module.ts`、两端 `lib/api.ts`、Web 控制台分区、Mobile Tabs 布局、共用样式与标签文件由本单元建好，并行单元只读。
- 2026-10-28 规模风险：任务表 8 行已满。执行中追加任务超过一半（4 行）就停，按 `howto/parallel.md` 第 1 节拆成第二个契约单元（表、迁移、契约、API 一个；两端注册行、空组件、最薄链路一个）。
- 串行基线与人工触点：本单元人工触点由 Claude 在复核时按类别补记（开对话、批审批、答停下、传话、人工验收、排障），Codex 也在这里随手记，归档时以复核数为准。
- 2026-10-28 上下文压缩后继续 T07；此前并发门失败：槽位 3 demo-ui 报 `Cannot find module ...dist/main`，根因为三个槽位共用 Nest `apps/api/dist` 且构建删除产物。修复实验：测试 API 编译/启动改为 `.e2e/slot-N/dist`，测试启动不再并发清空 shared 产物（与 API 测试一样依赖预先构建 shared），完整重跑三槽位门，不以单套补跑代替。
- 2026-10-28 T07 第一道门（只读 Subagent）发现 AC-07 演示链缺步：本轮打回的是 NB-001，NB-002 仅读取种子 rework 单。补 NB-002 真实重新提交 → start → rework 后再聊天；无新增任务或产品语义。
- 2026-10-28 上下文压缩后继续 T07，沿用 Expo overview/router/data-fetching 阅读结论；并发排障由只读 Subagent 完成，不把资源争用假设写作已证实唯一根因。第二次修复后仍不通过即按 AGENTS.md 第 10 节停止，不做第三次。
- 2026-10-28 卡在哪一步：T07 第三道门未通过；2026-10-29 收紧 demo-ui 定位并创建 file-map 目录后，该用例通过且缓存告警消失，但三槽位 Mobile 首批测试仍在 `page.goto('/')` 等待 load 时触发原有 120 秒超时，导致 AC-09 未过；门禁脚本遇首个失败后跳过该槽后续 CORS/demo 命令，AC-10 本轮覆盖不完整。
- 2026-10-29 要用户定什么：是否再授权诊断并修复 Mobile 并发冷启动/门禁执行流程，再完整重过 T07；本次需要用户动手类别为「答停下」，不要求用户运行 adb、排障或传话。
- 2026-10-29 可选项和倾向：A 继续本单元，保留现有断言与 120 秒超时，调查并解决 Metro 首次 bundle 加载阻塞，同时令隔离脚本在单项失败后仍执行其余槽位套件（倾向 A）；B 保持 blocked，先由用户与 Claude 复核运行资源和隔离门设计。未获答复不做下一轮修复、不进入 T08。
- 2026-10-29 独立文档债务：`python scripts/validate_docs.py` 报 `docs/testlog.md` 最早一行 3 天、上限 2 天（`testlog-debt`）；不属于 FW-011，不自行 Promote，待用户决定是否「收一下」。
