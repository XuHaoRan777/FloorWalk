# Mobile 视觉语言与两张样板页

> ID：FW-046
>
> 状态：`approved`

## 目标

为 Mobile 选定视觉语言 A「检查路线」，补齐独立于 Web 取值的 Mobile 样式变量层与交互状态规范，完成店长今日待巡和管理员任务审核详情两张样板页。管理员导航将看板从底部 Tab 移到「今日」首屏入口，保留看板现有路径与返回行为。

## 非目标

- 除 AC-04 的首页继续入口选择与结束状态外，不调整店长或管理员现有能力，不改数据获取、API、共享业务类型、数据库和权限。
- 不为其他 Mobile 页面做视觉改版，只保证既有页面可打开和操作。
- 不改变 Web 使用中的 token 值和页面样式。
- 不增加依赖，不安装或修改系统级 Android 环境。

## 选定方向与设计约束

用户于 2026-11-23 选择「FW-046：选 01 A」。A「检查路线」由 oil-ui-pro 显式探索产生，视觉来源是今日任务顺序与检查项节点。方向卡为 evidence/directions/A.md。

唯一锁定的品牌资产为 --fw-primary #365DE8 与 FW-044 L1「F 字动线」Logo。Logo 继续使用原有路径与 #058D84 检查点。其余取值进入 Mobile 专用变量层，Web 现有 token 名和值不调整。

| Mobile 用途 | 变量名 | 值 |
| --- | --- | --- |
| 画布 | --fw-mobile-background | #F5F8FF |
| 卡片与固定导航表面 | --fw-mobile-surface | #FFFFFF |
| 主文字 | --fw-mobile-foreground | #1C2942 |
| 次级文字 | --fw-mobile-muted-foreground | #52627E |
| 分隔线 | --fw-mobile-border | #DFE7F2 |
| 路线辅助色 | --fw-mobile-route | #007F92 |
| 路线小字与节点 | --fw-mobile-route-strong | #006B79 |
| 品牌主操作与焦点 | --fw-primary、--fw-ring | #365DE8 |
| 成功 | --fw-mobile-success、--fw-mobile-success-background | #137A55、#E5F5ED |
| 警告 | --fw-mobile-warning、--fw-mobile-warning-background | #8A4A00、#FFF3DD |
| 危险 | --fw-mobile-danger、--fw-mobile-danger-background | #A52D3F、#FFF0F2 |
| 按下与禁用表面 | --fw-mobile-pressed-background、--fw-mobile-disabled-background | #EAF1FE、#F2F4F7 |
| 禁用文字 | --fw-mobile-disabled-foreground | #8A95A5 |
| 遮罩 | --fw-mobile-overlay | #1C2942，使用时 46% 不透明度 |

中文正文使用已有 IBM Plex Sans，计时与计数使用 IBM Plex Mono，不增加字体依赖。字号层级为 12、14、16、18、23 dp。间距按 4 dp 基准取 4、8、12、16、24、32 dp。控制件和列表圆角为 8 dp，主操作与底部弹层圆角为 12 dp。任务行保持平面，不叠阴影；系统对话层使用单层柔和阴影。按下反馈不移动布局，普通反馈 120 ms，路线绘制 220 ms，曲线为 cubic-bezier(0.2, 0, 0, 1)。减少动态偏好下直接呈现终态。

### 现有审核数据的边界

审核详情只展示 API 已提供的 firstResult、result、manuallyDecidedAfterCompletion、lastReworkReason、evidence 等字段。首次结论与当前结论相邻呈现，manuallyDecidedAfterCompletion 为真时显示「完成后人工改判」。现有响应没有提供改判人、改判时间或逐次改判理由，本单元不补造这些信息，也不修改接口。

## 验收标准

- AC-01（用户要求）：店长底部 Tab 继续为「今日待巡、记录、通知、我的」。管理员底部 Tab 为「今日、审核、管理、我的」，不显示「看板」Tab。管理员「今日」首屏提供清楚可见的「总部看板」入口，点击后仍打开现有 /admin/dashboard 路径。Android 返回键从看板回到打开它的「今日」页。通知到任务审核的目标和返回通知收件箱的行为保持原样。两种角色已有能力不变。
- AC-02（用户要求）：在 packages/tokens/tokens.css 中增加独立的 Mobile token 命名层，Web 现有 token 名称和值逐项保持不变。Mobile Native 生成结果包含该层，执行生成命令及 --check 后文件一致。样板页新增颜色均来自该层或锁定的 --fw-primary，不在样板组件内写颜色字面值。
- AC-03（用户要求）：docs/context/mobile-design.md 完整记录选定方向 A 的颜色和用途、字体、圆角与阴影、图形语法、页面框架、空状态、完成反馈、动效与减少动态规则，以及交互状态表。当前项、主操作和成功状态能通过不同语义表达区分，状态文案或图形不只依赖颜色。可操作目标至少为 44×44 dp。
- AC-04（用户要求）：店长今日样板页在 390 dp 宽显示门店、日期、今日进度、按任务顺序的路线节点、任务时间窗和可继续任务的主操作。继续入口优先指向第一项 `in_progress`，否则指向第一项 `not_started`，不指向 `overdue` 或 `submitted`；只使用 Today API 现有 `status`，不在客户端重算截止时间。无可继续任务时显示今日结束或无任务状态及通知次级操作，逾期任务保留在列表中供查看，上传资格仍由服务端和详情页判定。页面滚动区、固定标题栏、通知入口、底部 Tab 与安全区按方案 A 呈现。360 dp 下不出现页面级横向滚动，文字和主要操作不互相遮挡。
- AC-05（用户要求）：管理员审核详情样板页在 390 dp 宽显示任务摘要、分数、逐项审核、现有证据、当前结论和固定判定区。改判条目同时展示 firstResult、result 和 manuallyDecidedAfterCompletion 所能表达的首次结论、当前结论及「完成后人工改判」标记。接口没有提供的改判人、改判时间或独立改判理由不绘制。360 dp 下不出现页面级横向滚动，判定操作仍可见且触控区至少为 44×44 dp。
- AC-06（用户要求）：状态表覆盖底部 Tab、首页入口或卡片、主按钮、次级按钮、文字链接、列表项、状态徽标、开关、输入框和拍照按钮。每个组件记录默认、按下、当前或选中、聚焦、禁用和加载表达。原生界面不增加 hover 状态；减少动态偏好下直接显示稳定终态。
- AC-07（用户要求）：原有 Mobile E2E 在测试槽位通过，Web E2E 除「决策与偏差」列出的 5 项 FW-044 既有失败外全部通过。Android 模拟器 Medium_Phone_API_37.0 与 Expo Go 58.0.5 上走查方案 A 任务路径中涉及两张样板页的步骤，证明看板入口、Android 返回、通知目标和返回收件箱仍可达。
- AC-08（用户要求）：交接前按视觉状态表触发样板页和任务路径中实际使用组件的状态。派新的盲评 Subagent，仅提供截图与任务路径，按挡使用、难看、小毛病分级；修正前两档后复评至没有挡使用或难看问题。

## 实施与验收约束

### 改代码前

为改动涉及的店长今日页、管理员今日页和管理员审核详情各截一张现状图，保存到本单元 evidence/before/。实现交接时提供与两张成品样板页的前后对比。

开发 API 与 Metro 使用 scripts/dev/proc.mjs 的测试槽位 1，不连接开发库。模拟器使用 Medium_Phone_API_37.0 与已安装的 Expo Go 58.0.5，不安装或改动系统 Android 环境。

### 最终代码审查任务中的机器门

T08 按以下命令取证并写入 plan.md 证据表。python scripts/gate.py 执行 scripts/workflow.conf 登记的 docs 和 workflow 两项。

- python scripts/gate.py
- pnpm typecheck
- pnpm lint
- pnpm format:check
- pnpm build
- FW_SLOT=1 pnpm --filter @apps/api test
- FW_SLOT=1 pnpm e2e:mobile
- FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts
- pnpm --filter @apps/mobile typecheck
- pnpm --filter @apps/mobile build
- node packages/tokens/generate-native.mjs
- node packages/tokens/generate-native.mjs --check

### 交接前自查

1. 在 Android 模拟器按方案 A 走样板页覆盖的店长与管理员路径，包括看板入口、系统返回和通知目标返回。测试使用槽位 1。
2. 对照交互状态表，触发样板页和相关任务路径中实际出现组件的默认、按下、当前、聚焦、禁用和加载状态，截图核对语义表达与触控尺寸。
3. 按 oil-ui-pro references/visual-review.md 派一个没看过代码与讨论的新 Subagent，只给它任务路径和截图，修正「挡使用」与「难看」后复评，直到没有这两档。

收尾用 scripts/dev/proc.mjs 停掉本单元启动的进程，检查开发端口 3018、3019、3020 没有残留监听，并把模拟器恢复到启动前状态。

## 验收方式

A 人工验收

用户在 Android 模拟器检查样板页和关键任务路径。Agent 运行 AC 对应的测试、机器门和代码审查，交接后由用户确认。

## 结构与契约

- packages/tokens/tokens.css 增加 Mobile 专用变量，packages/tokens/generate-native.mjs 与 packages/tokens/native.json 增加生成的 Mobile token 命名空间。只服务样式表达，不新增业务字段。（AC-02）
- apps/mobile 管理员 Tab 配置隐藏看板 Tab 并保留 /admin/dashboard 路径，管理员今日页增加该路径的入口。（AC-01）
- 不新增或修改 API 字段、共享业务类型、数据库对象、配置键和依赖。（AC-01、AC-02）

## 涉及的当前事实

- [Mobile 管理端](../../specs/mobile-admin.md)「入口与配置」：记录管理员四项底栏和今日页看板入口。
- [Mobile 管理端](../../specs/mobile-admin.md)「审核与看板」：确认看板路径与审核数据呈现。
- [Mobile 店长巡检](../../specs/mobile-inspector.md)「登录与今日巡检」：保留店长既有入口、任务详情和通知返回行为。
- [Mobile 视觉与交互规范](../../context/mobile-design.md)：重写为 FW-046 选定方向的唯一 Mobile 视觉基线。

## 依赖

- 无

## 批准记录

- 批准依据：用户原话「批准」
- 批准时间：2026-11-23
- 2026-11-24 用户原话：「AC-07 改成：『Web E2E 除『决策与偏差』列出的 5 项 FW-044 既有失败外全部通过』。这 5 项在 FW-046 归档后用修正模式单独修，不进本单元。spec.md 的 AC-07 照此改，批准记录加一行我的原话。」
- 特殊授权：按本规格修改 apps/mobile、packages/tokens、docs/context/mobile-design.md、docs/specs/mobile-admin.md 和 tests/mobile/admin-dashboard.spec.ts 中看板新入口的现有断言，不改业务逻辑、数据获取或接口。2026-11-24 用户另行授权 AC-04 的继续入口选择与结束状态，并授权将 tests/mobile/admin.spec.ts 的管理员 Tab 数量断言由五项改为四项。
- 接力探针：不在接力线上
