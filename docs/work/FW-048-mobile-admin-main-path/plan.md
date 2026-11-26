# Mobile 管理员主路径页面还原 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：完成
- 阻塞：无。
- 下一步：无。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

每项任务开始和结束时记录 Asia/Shanghai 的 `YYYY-MM-DD HH:mm`。各页截图放在本单元 `evidence/` 下，6 页差异逐条汇总到 `evidence/mobile-admin-page-comparison.md`；每页只留一张与对应设计稿并排的对照图。

## 任务表

| ID | 任务 | 状态 | 开始时间 | 结束时间 | 交付的 AC 与证据 |
| --- | --- | --- | --- | --- | --- |
| T01 | 今日页还原与对照取证 | `done` | 2026-11-26 13:17 | 2026-11-26 16:10 | AC-01、AC-07、AC-08；390×844 对照图与逐项差异已记录；六条构造任务、警告、人工待处理均核验；mobile-types、mobile-lint 通过 |
| T02 | 审核队列页还原与对照取证 | `done` | 2026-11-26 13:37 | 2026-11-26 16:10 | AC-02、AC-07、AC-08；390×844 对照图与逐项差异已记录；mobile-types、mobile-lint 通过 |
| T03 | 审核详情页还原与对照取证 | `done` | 2026-11-26 13:41 | 2026-11-26 16:10 | AC-03、AC-07、AC-08、AC-10；390×844 对照图与逐项差异已记录；mobile-types、mobile-lint 通过 |
| T04 | 看板页还原与对照取证 | `done` | 2026-11-26 13:47 | 2026-11-26 16:10 | AC-04、AC-07、AC-08；390×844 对照图与逐项差异已记录；mobile-types、mobile-lint 通过 |
| T05 | 通知页还原与对照取证 | `done` | 2026-11-26 13:54 | 2026-11-26 16:10 | AC-05、AC-07、AC-08；390×844 对照图与逐项差异已记录；mobile-types、mobile-lint 通过 |
| T06 | 我的页还原与对照取证 | `done` | 2026-11-26 13:57 | 2026-11-26 16:10 | AC-06、AC-07、AC-08、AC-10；390×844 对照图与逐项差异已记录；mobile-types、mobile-lint 通过 |
| T07 | 全量 Mobile E2E | `done` | 2026-11-26 14:01 | 2026-11-26 16:10 | AC-08；全量 43 项中 35 项通过、8 项失败；7 项定向重跑通过并按用户要求标记为全量运行时不稳定；FW-034 AC-03 单独重跑通过 |
| T08 | 最终代码审查（含全量机器门） | `done` | 2026-11-26 16:17 | 2026-11-26 16:29 | AC-09；全量门 6/6 通过，web-baseline 通过；逐项完成最终审查，结论见最后一条证据 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量机器门（`python scripts/gate.py`）在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；认证、支付、权限的失败路径 AC，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01–T06 | passed | `python scripts/gate.py mobile-types mobile-lint`; `pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-visual-evidence.spec.ts --reporter=line` | `docs/work/FW-048-mobile-admin-main-path/evidence/AC-01-admin-today.png`、`AC-02-admin-review-queue.png`、`AC-03-admin-review-detail.png`、`AC-04-admin-dashboard.png`、`AC-05-admin-notifications.png`、`AC-06-admin-profile.png`、`docs/work/FW-048-mobile-admin-main-path/evidence/mobile-admin-page-comparison.md` | Mobile types 与 lint 通过；六页截图测试 1 passed，fixture 在 `finally` 中清理；每页并排比较及差异处理见对照记录 |
| T07 | passed | `python scripts/gate.py mobile-e2e`; `$env:FW_SLOT='1'; pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-today.spec.ts --grep 'FW-034 AC-03' --reporter=line` | `.git/workflow/mobile-e2e.log` | 全量 43 项中 35 passed、8 failed。7 项失败用例定向重跑通过，FW-034 AC-03 单独重跑 1 passed。AC-03 原因是待处理卡片的 `testID` 置于链接节点，使链接角色断言在其内部继续查找链接；将 `testID` 放到外层容器并直接断言链接角色后通过。7 项不稳定用例清单见「决策与偏差」 |
| T07 | passed | `$env:FW_SLOT='1'; pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/admin-visual-evidence.spec.ts --reporter=line` | `docs/work/FW-048-mobile-admin-main-path/evidence/AC-01-admin-today.png` | 首次截图就绪条件未等数据加载；更新为核验六条构造任务、两项警告及两条目标人工任务后截图用例通过。注册 fixture 自动产生的其他任务不计入六条目标任务断言，最终截图含该 fixture 数据 |
| T08 | passed | `python scripts/gate.py`; `python scripts/validate_docs.py --sync-backlog`; `python scripts/gate.py docs` | `.git/workflow/gate.log` | 六个门全部通过：docs、workflow、mobile-types、mobile-lint、mobile-e2e、web-baseline；HEAD `13d8c07`，代码指纹 `6039989770eefb28`。最终文档同步后 docs gate 再次通过。全量 Mobile E2E 与 web-baseline 均通过，因此未触发不稳定用例的兜底重跑 |
| T08 | passed | `同会话最终代码审查；依据 docs/howto/final-review.md` | `docs/work/FW-048-mobile-admin-main-path/spec.md`、`plan.md`、完整 `git diff` | 新会话或独立 Subagent 会违反用户明确要求的单会话审查。认证与授权投影：不适用，本单元只调整 Mobile 客户端展示与导航，权限服务未改。越权与混淆代理：不适用，未增加请求、代理身份或导出。并发与幂等：不适用，未改服务端写操作。数据解码与序列化：未改 API、SQL、分页或共享类型。迁移与回滚：不适用，未改迁移。敏感数据与日志：未新增凭据、Token、日志或含敏感内容的 artifact，截图使用合成 fixture。范围与结构膨胀：未改 schema、迁移、DTO、共享类型、配置或 `.env.example`。文件职责与重复：未发现超出 AC 的新增模块或重复业务逻辑。AC-01 至 AC-06 六页实现并各有 390×844 对照证据，差异逐条记录；AC-07 仅使用现有字段且图库照片以合成图替代；AC-08 页面级 types/lint、全量 Mobile E2E 和按需定向重跑均按记录完成，调整均为页面布局选择器/断言；AC-09 全量门通过且 web-baseline 通过；AC-10 原生路径留在交接待用户模拟器验证。未发现需修复 finding；权限、资金及外部回调失败路径不在本单元 AC 中 |
| T08 | passed | `用户确认：「直接归档提交推送」` | `AC-10` | 用户授权直接归档，按整单通过处理；提交前仍建议在模拟器核验 Android 硬件返回、安全区、固定判定栏宽度和键盘可达性 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。机器门的行照 `scripts/gate.py` 的输出写（门的名字、结果、HEAD），不自己判通过；artifact 只写代码格式的路径。 -->

## 交接

- 和讨论时不一样的：今日页不展示设计稿中的门店照片、店长姓名，看板不新增取数实现设计稿中的今日概况；具体理由见「决策与偏差」及六页对照记录。
- 需要你测的：Android 硬件返回应回到进入详情页的来源页；顶部与底部安全区、底部手势区和固定判定栏不重叠；判定按钮沿用 67f4c26 的宽度规则；打开打回理由键盘后输入框、确认和取消可达；我的页编辑昵称时键盘与保存/取消操作可达。用户指示「直接归档提交推送」，按整单通过处理。

## 回修

| 日期 | 用户原话 | 状态 | 改动或去向 | 提交 |
| --- | --- | --- | --- | --- |

## 决策与偏差

- 页面图片只使用合成图；设计稿图库照片不复制到应用、测试数据或证据。
- 今日稿的门店照片与店长姓名在 `AdminTodayResponse` 中没有对应字段，页面不展示这些内容；现有任务字段可用于组织门店进度和逾期统计。
- 看板稿的趋势区域是静态空状态；页面保留现有周/月、门店/店长/日期维度、指标和趋势数据，不用静态空状态覆盖现有数据能力。
- 通知稿展示空状态，实际有通知时保留现有通知列表和打开/已读行为；我的稿未展示头像、昵称编辑和退出登录，仍保留现有账户能力。
- `AdminPage` 页头增加日期元信息，并在今日页沿用管理员视觉变体；`homeHeader` 当前只有今日页使用。
- 审核详情重用 `ReviewItem`，改用 FW-047 状态标签与文字组件；分数环改为设计稿中的紧凑分数徽章，原逐项判定与只读聊天保留。
- 看板稿的「今日概况」当前没有被看板页既有取数覆盖，不新增取数调用；保留现有周期统计、筛选维度、门店/店长/日期数据。
- 看板趋势子组件采用 Mobile 文本、卡片与 token，维持现有折线和每日明细。
- 通知页改用 Mobile 页头、空状态和列表行组件，维持现有通知读取、已读、打开、刷新与分页行为。
- 我的页仅重排管理员分支，保留头像上传、昵称修改、只读登录名、改密、退出与错误反馈；店长资料页分支保持原样。
- 按页面稿更新 E2E 中因页面标题、分数布局和待处理卡片链接角色失效的选择器与断言，修改 `tests/mobile/admin-dashboard.spec.ts`、`admin-review.spec.ts`、`admin-today.spec.ts`、`admin.spec.ts`、`notifications.spec.ts`、`profile.spec.ts`；未新增行为测试。
- Mobile E2E gate wrapper 不支持按失败用例过滤；按用户效率要求，失败项重跑使用同一 Playwright 配置和 `--grep` 定向到失败标题。今日页 AC-03 的原始失败由链接内的角色定位方式导致，修正选择器后单独运行通过。
- 因为用户明确要求不使用子 Agent 或另开复核会话，最终代码审查在本会话执行，并在证据备注记录同会话审查原因。
- 按用户要求将全量 Mobile E2E 中定向重跑才通过的 7 项记为「全量运行时不稳定」，后续不循环重跑；T08 全量门再次失败时只单独重跑失败项一次，仍失败即停止并报告：`FW-034 AC-04 周月指标与门店、店长和日期趋势`、`FW-034 AC-01、AC-02 审核队列、失败转人工、打回重传与改判`、`管理员登录进入今日，管理页显示六个配置入口`、`管理员通知入口标记逾期通知已读并进入审核队列`、`管理员从待人工审核通知进入详情后返回通知收件箱`、`FW-035 AC-04/05 Mobile Web 个人资料：hq@northbean.example`、`FW-035 AC-03/05 Mobile Web 主动改密与其他会话登出：hq@northbean.example`。
- 归档时起停脚本未登记的监听进程保留未处理：API 端口 3018（PID 238516）、Metro 端口 3020（PID 189520），另有非项目服务占用 3113（WebStorm embeddings-server，PID 97332）。按协议未终止这些进程。
