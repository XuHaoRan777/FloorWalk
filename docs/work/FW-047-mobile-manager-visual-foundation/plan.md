# Mobile 店长端页面与视觉基础 - 执行计划

> 规格：`[./spec.md](./spec.md)`

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：等待用户确认 AC-14 原生模拟器走查
- 阻塞：等待用户确认 Android 模拟器返回键、安全区、相机调起和键盘遮挡路径
- 下一步：用户确认后 Promote、归档并通过 `--archive-gate`

开单前工作树干净。设计 HTML/CSS 与图库照片仅在本机 `.visual/`。字体在实现时作为应用资源加入。

## 任务表

| ID | 任务 | 状态 | 开始（Asia/Shanghai） | 结束（Asia/Shanghai） | 交付的 AC 与证据 |
| --- | --- | --- | --- | --- | --- |
| T01 | Mobile tokens、公共组件与字体资源 | `done` | 2026-11-25 22:47 | 2026-11-25 23:16 | AC-01、AC-02、AC-03 |
| T02 | 今日待巡与任务详情拍照页 | `done` | 2026-11-25 23:18 | 2026-11-26 00:20 | AC-04、AC-05 |
| T03 | 记录与记录详情页 | `done` | 2026-11-26 00:20 | 2026-11-26 00:45 | AC-06、AC-07 |
| T04 | 聊天、通知与我的页面 | `done` | 2026-11-26 00:45 | 2026-11-26 01:20 | AC-08、AC-09、AC-10 |
| T05 | 重写 Mobile 视觉基线并对账当前事实 | `done` | 2026-11-26 01:20 | 2026-11-26 01:42 | AC-11 |
| T06 | 单命令检查、7 页 Expo Web 对照与最后一轮原生模拟器走查 | `done` | 2026-11-26 01:42 | 2026-11-26 02:48 | AC-12、AC-13、AC-14 |
| T07 | 最终代码审查 | `done` | 2026-11-26 02:48 | 2026-11-26 02:57 | 全部 AC 与完整差异 |

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| 开单前 Web E2E 基线（AC-13） | `failed` | `$env:FW_SLOT = '3'; pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web-results/slot-3/` | 40 项：34 passed、5 failed、1 skipped，退出码 1。失败清单见 `spec.md` AC-13，作为后续逐项对比基线。 |
| T01 AC-01 | `passed` | `node packages/tokens/generate-native.mjs`; `node packages/tokens/generate-native.mjs --check` | `packages/tokens/native.json` | Mobile Native token 生成并通过一致性检查。通用 `native.json.colors` 和 `native.json.space/radius` 保持原值。 |
| T01 AC-02 | `passed` | `python scripts/gate.py mobile-types mobile-lint` | `apps/mobile/components/mobile/manager-ui.tsx`, `apps/mobile/components/mobile/manager-task-ui.tsx`, `apps/mobile/components/mobile/manager-data-ui.tsx` | Mobile 类型检查及 ESLint 通过。公共组件涵盖底栏、顶部区、按钮五态、状态标记、任务行、照片四态、输入框、列表行、卡片与空状态。 |
| T01 AC-03 | `passed` | `python scripts/gate.py mobile-types mobile-lint`; PowerShell 中以 fontTools 4.68.0 重跑 `python -m fontTools.subset`，命令见 `docs/context/mobile-design.md` 字体节 | `apps/mobile/assets/fonts/LXGWWenKaiGB-Regular.ttf`, `apps/mobile/assets/fonts/LXGWWenKaiGB-OFL.txt` | 从 v1.530 上游 Regular TTF 截取，字符频率数据取 Jun Da 现代汉字频率表前 3500 字，再加 ASCII 与常用中英文标点。重跑输出与应用 TTF 的 SHA-256 一致，为 `7ad6137ee65afbae8d705e4ac5331b18fe26b8021ac4ee39112acfb6257aea11`，体积 1,735,448 字节。 |
| T02 AC-04、AC-05 | `passed` | `Expo Web 390×844，对照 .visual/samples/r2/B/01-manager-today.html 与 02-manager-capture.html` | `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-today-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-capture-comparison.png` | 今日页的冷柜大图和叠加任务卡未实现，因为 Today API 没有照片字段，不能使用设计稿图库图。主卡以当前任务的状态、时间窗和继续操作承接首屏。页面固定顶部品牌/门店/店长/刷新与通知区，设计稿将品牌信息放进正文，固定结构沿用现有店长首页导航。今日任务行比静态稿多显示状态和完整时间窗，直接消费 API 状态与时间字段。Expo Web 不绘制设计稿模拟的 Android 状态栏和底部手势条，留给 AC-14 原生检查。静态日期为 11 月 24 日，slot 1 取证日期为 11 月 26 日。详情页保留接口定义的逐检查项照片、自评、备注和提交，不实现设计稿整单固定提交栏。详情项按序号组织，未重复展示一个额外的检查项总数标题。设计稿照片位与上传照片用合成图。 |
| T03 AC-06、AC-07 | `passed` | `Expo Web 390×844，对照 .visual/design/pages/manager-records.html 与 manager-record-detail.html` | `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-records-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-record-detail-comparison.png` | 记录列表的设计稿样例是 1 项，当前页面按 API 分页显示现有记录，并保留规格要求的创建时间和提交时间。API 只返回分页游标，没有总记录数，因此不展示会被误认为总数的项目计数。实际门店、巡检名、状态、分数与日期来自 slot 1 数据，与静态稿示例不同。详情显示门店、状态、分数、检查项、备注、照片、审核历史和聊天，标题固定在顶部栏而设计稿标题随正文滚动，沿用移动详情栈页面导航框架。API 不含巡检人姓名，详情接口也不含模板名，模板名由列表导航参数提供，直达时显示「巡检记录」。静态详情稿为 4 项，当前记录为 8 项。空验收要点不显示。示例记录的审核历史为空。静态图库照片与测试存储照片请求均用合成 SVG 替换。已读取 Expo 工作流、设计系统、原生 UI 和 Router 技能，并对照 Expo 58.0.24 配套的 v58 `expo-font`、`expo-image-picker` 文档。 |
| T05 AC-11 | `passed` | `按 .visual/design/b.css 与 components.html 重写 Mobile 基线` | `docs/context/mobile-design.md` | 文档注明设计源只存在本机 `.visual/design/` 且不入库，记录 Mobile token、组件状态、字体来源/许可证/子集命令及接口边界。Web token 与 Logo 的规则未改。 |
| T04 AC-08、AC-09、AC-10 | `passed` | `Expo Web 390×844，对照 .visual/design/pages/manager-chat.html、manager-notifications.html 与 manager-profile.html` | `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-chat-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-notifications-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-profile-comparison.png` | 聊天标题用「巡检沟通」。聊天 API 只提供巡检 ID 和消息，没有模板名字段，未显示样稿里的「午间运营巡检」。聊天页现处 Tabs 外的栈路由，保留来源感知返回，不显示静态稿中的店长底栏。输入区保留当前图片选择、计数和发送操作。三页空状态图标、文案与卡片边界和设计稿一致。通知空状态使用「暂无未读通知」。资料页使用当前 API 的门店、姓名、登录名和日期，静态示例内容与真实种子不同。实际页面继续显示头像、账号资料、角色、所属门店、刷新资料、改密和退出入口，保持既有资料功能。三页的 Expo Web 均不绘制设计 HTML 的 Android 状态栏，原生安全区留待 AC-14。 |
| T06 AC-12 | `passed` | `Expo Web 390×844 并排对照唯一设计稿` | `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-today-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-capture-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-records-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-record-detail-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-chat-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-notifications-comparison.png`, `docs/work/FW-047-mobile-manager-visual-foundation/evidence/manager-profile-comparison.png` | 每页一张 390×844 并排图。数据内容变化、接口缺字段、页面导航框架与 Expo Web 不绘制系统栏造成的差异逐页记录在对应 T02–T04 证据行。设计稿照片及记录详情接口照片请求均用合成图，不复制图库素材。 |
| T06 AC-13 | `passed` | `python scripts/gate.py` | `tests/web-results/slot-3/fw047-web-baseline.json`, `.git/workflow/history.jsonl` | 当前代码指纹 `66b177c961400c35` 下六道门全部通过。Mobile 类型检查、ESLint、全量 E2E 43/43 通过；Web E2E 40 项与开单前一致，为 34 passed、5 failed、1 skipped，5 个失败项身份及错误特征完全相同。 |
| T06 AC-14 | `blocked` | `node scripts/dev/proc.mjs start api --slot 1`; `node scripts/dev/proc.mjs start metro --slot 1`; `adb reverse tcp:3110 tcp:3110`; `adb reverse tcp:3112 tcp:3112`; Android AVD `Medium_Phone_API_37.0` | `docs/work/FW-047-mobile-manager-visual-foundation/plan.md` | Agent 在模拟器观察：系统返回从详情回到今日页；页面在状态栏及底部手势区内；调起系统相机预览后取消，未拍照或上传；零照片项备注输入显示键盘时「提交第 1 项」仍在键盘上方可见，返回键先收键盘。按 spec 的验收方式 A，仍待用户现场确认这条原生路径。临时日程已撤销和删除，今日任务清理后为 0。 |
| T07 全部 AC 与完整差异 | `passed` | `同会话最终代码审查。用户要求不另开独立复核会话` | `docs/work/FW-047-mobile-manager-visual-foundation/spec.md`, `docs/work/FW-047-mobile-manager-visual-foundation/plan.md` | 同会话原因是用户明确要求不另开独立复核会话。逐 AC 对照完整差异无未实现项。认证与授权投影、越权、并发幂等、序列化、迁移、敏感日志、结构契约、文件职责均无本单元引入的错误，未发现阻断性 finding。方式 A 的 AC-14 用户确认仍待完成。 |

## 交接

- 和讨论时不一样的：无
- 需要你测的：Android 模拟器系统返回键、安全区、相机调起和键盘遮挡，见 AC-14。

## 回修

| 日期 | 用户原话 | 状态 | 改动或去向 | 提交 |
| --- | --- | --- | --- | --- |
| 2026-11-26 | 店长自评按钮需宽度需要缩减，腺癌超长了 | 做了 | 移除自评选项按钮的 `flex: 1`，按钮按标签内容和内边距收缩。类型检查和对应 Mobile E2E 通过。 | `67f4c26` |

## 决策与偏差

| 日期 | 决策或偏差 | 依据与影响 |
| --- | --- | --- |
| 2026-11-25 | 开单前 Web E2E 基线为 34/40 通过、5 失败、1 跳过 | 三项账户菜单退出按钮定位超时；FW-041 焦点轮廓断言宽度失败（1px，期望至少 2px）；FW-024 建店长流程超时。单元不改 Web，结束时要求失败用例身份与结果和基线一致。 |
| 2026-11-25 | 字体改用上游 Regular TTF 子集 | 用户批准 v1.530 上游字体截取 3500 个常用汉字及 ASCII、常用中英文标点；实测 1,735,448 字节。字符集来自 Jun Da 现代汉字频率表 CSV 前 3500 字。 |
| 2026-11-25 | E2E gate 需要 runner 固定槽位和比较基线 | `gate.py` 能登记和运行各门，但以退出码作为门结果，不能区分 Web E2E 基线中的预期失败；`scripts/e2e-gates.mjs` 固定 Mobile 槽位 1、运行 Web 槽位 3 并核验报告。类型检查和 ESLint 由 `gate.py` 直接执行。 |
| 2026-11-25 | 测试和取证照片只使用合成图 | 不复制本机 `.visual/` 图库照片到 Mobile 资源或测试数据。 |
| 2026-11-25 | 按用户要求不另开独立最终复核会话 | 最终代码审查由本会话完成，在证据备注说明原因。 |
| 2026-11-25 | 今日页不显示 B 稿的大幅现场照片 | Today API 无照片字段，图库原图不得进入 Mobile，且图片生成工具当前不可用。使用 API 既有任务名、时窗、状态构成继续巡检主卡，不伪装成实际现场图；逐屏对照记录照片主视觉差异。 |
| 2026-11-25 | 详情页保留按检查项提交 | B 稿示意固定在页底的提交区，现有接口按检查项分别上传照片、自评和备注。保留逐项提交动作和滚动内容，不引入整单草稿或整单提交。详情接口没有门店名，也不显示虚构门店数据。 |
| 2026-11-25 | 修复空验收要点导致的 RN Web 文本节点 | acceptanceCriteria 契约允许空字符串。直接将空串作为 View 子节点会触发 Unexpected text node，现按 trim 后非空才渲染说明。 |
| 2026-11-25 | 更新布局变化影响的现有 Mobile E2E 定位 | 今日标题定位改为列表内「今日待巡」，继续按钮断言改为容器边界内且触控高度不小于 44dp；通知跳转的选中行断言改查焦点边框宽度。未新增行为测试。 |
| 2026-11-26 | T02 对照中的接口约束差异 | Today API 没有设计稿大幅照片字段，详情接口沿用按检查项提交，按 AC-04、AC-05 不伪造照片数据，也不新增整单提交行为。两张 390×844 对照图记录实际页面与静态设计稿差异。 |
| 2026-11-26 | T03 记录页数据选择与路由展示 | 记录行按设计稿突出模板名、状态、任务日期和分数，并保留既有创建与提交时间。列表接口提供模板名和任务日期，导航时随记录 ID 传到详情；详情 API 没有巡检人姓名，未用当前登录人的姓名代替。 |
| 2026-11-26 | 更新记录页布局定位 | 记录列表断言从带「任务：」前缀的描述切换为设计稿的标题文本，详情结果断言改为检查状态标记。保留分页、刷新、状态、分数、日期、备注、照片和聊天行为断言。 |
| 2026-11-26 | 记录详情标题与聊天页视觉差异 | 详情标题按导航参数显示模板名，直达时显示「巡检记录」，不再固定为「巡检记录详情」；`chat.spec.ts` 与 `site-deactivated.spec.ts` 的就绪定位改为稳定摘要 testID。聊天通知页标题改为设计稿的「巡检沟通」。这些仅更新布局与标题定位，不新增行为断言。 |
| 2026-11-26 | T04 页面保留的数据与路由边界 | 通知空状态采用 `.visual` 文案。聊天 API 不含模板名，且 `/chat/:id` 位于 Tabs 外的栈路由中；显示通用标题并保留路由来源返回，不虚构标题字段或伪造底栏。聊天图片选择、计数、发送状态按已有 Mobile 聊天功能保留。管理员通知和聊天视图继续走原有样式分支。 |
| 2026-11-26 | T04 更新布局定位 | 店长我的页标题按静态稿改为「我的」，对应 `profile.spec.ts` 只调整标题定位；通知空状态标题改为「暂无未读通知」，对应测试文案定位同步。没有增加行为测试。 |
| 2026-11-26 | Metro bundle 首轮失败及修复 | Expo Web 首次加载 500，Metro 报 `notification-inbox-admin.tsx` 解构并重复声明 `renderRow`。移除无类型声明和调用方的重复 prop 后，Expo Web 页面恢复；下一次实验继续并排取证。 |
| 2026-11-26 | T03 首轮门检查失败及修复 | 首轮 `python scripts/gate.py mobile-types mobile-lint` 发现详情路由 token 相对路径少一级、空页脚返回 `null`、一个未使用导入。修正路径和页脚值、移除导入后，同一组合门通过。 |
| 2026-11-26 | T06 首轮全量 Mobile E2E 结果与选择器修复 | 42 项中 37 通过、6 失败（含一个 profile 超时）。均为本次布局与文案变化影响的既有标题、按钮、日期和详情项定位，已按设计呈现调整相应选择器；详情照片和验收字段不改变。 |
| 2026-11-26 | T06 类型和 lint 首轮 | Mobile 类型检查通过；lint 发现聊天路由中未使用的 `MobileText` 导入，已移除。之后重跑组合门并继续全量 E2E。 |
| 2026-11-26 | T06 第二次全量 Mobile E2E 结果及详情结论定位 | 43 项中 42 通过，记录详情旧断言仍带「结果：」前缀而新 UI 使用状态标签。更新为选择精确「合格」状态，随后受影响的 `records.spec.ts` 5/5 通过。 |
| 2026-11-26 | T06 原生模拟器测试数据清理 | 为相机路径经现有管理员日程 API 创建了仅供 E2E 槽位 1 的临时日程，指定 NB-001 门店和现有「开店检查」模板；模拟器只打开相机并取消。随后移除日程分配并删除该日程，店长今日 API 返回 0 个任务，未生成巡检、照片或上传记录。 |
| 2026-11-26 | T05 字体截取命令复现 | Windows 的临时 `pyftsubset.exe` launcher 未找到本机 target 安装路径。改用 `PYTHONPATH=.visual/design/.fonttools` 下的 `python -m fontTools.subset`，加 `--layout-features=* --name-IDs=* --name-languages=*` 后，重建 TTF 与应用资源字节完全一致。复现命令写入 `mobile-design.md` 字体节，输出仅写入忽略的 `.visual/` 临时目录。 |
