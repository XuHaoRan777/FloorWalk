# FW-046 Mobile 视觉语言 - 执行计划

> 规格：[spec.md](./spec.md)。方向 A 已选，规格已批准，开始实施。

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：已归档
- 当前进展：用户确认后完成 Promote、归档提交和推送。
- 下一步：无

## 技能加载证明

| 技能 | `SKILL.md` 路径与版本 | 本阶段读取的参考 |
| --- | --- | --- |
| oil-ui-pro | `C:/Users/29019/.agents/skills/oil-ui-pro/SKILL.md`，版本 `0.34.6` | `references/light-path.md`、`references/direction-workspace.md`、`references/workspace-mobile.md`、`references/task-explore.md`、`references/style-explorer.md` |
| ui-ux-pro-max | `C:/Users/29019/.agents/skills/ui-ux-pro-max/SKILL.md`，该 `SKILL.md` 未声明版本 | `references/quick-reference.md`、`references/pro-rules.md`。产品与 React Native 约束核实后运行其 `scripts/search.py --design-system`，查询结果附记在方向卡 |
| frontend-design | `C:/Users/29019/.agents/skills/frontend-design/SKILL.md`，该 `SKILL.md` 未声明版本 | 未提供单独参考文件；已读取完整 `SKILL.md` |

三个技能文件均已实际读取并存在。版本未声明的两个技能按其安装文件如实记录，没有从其他缓存副本推定版本。

ui-ux-pro-max 的设计系统检索按其规则做了两次，查询分别为 `mobile retail inspection operations` 和 `mobile operations checklist inspection`。两次都返回「Hero + Features + CTA」落地页结构，第二次虽命中通用 Minimalism / Swiss，但不对应店长执行和管理员审核的原生工作流。没有把这些结果当作有效品类匹配或套用其配色；D/E 沿用对应技能的一般可访问性、触控、导航、状态与减少动态指导。技能来源映射单独留在 evidence/compare-key.md，对比页只标 A–E。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 完成 A–E 比较并记录用户选择，整理两张 A 方向样板预览 | done | 对比页、来源映射、店长今日与管理员审核预览及截图 |
| T02 | 编写 FW-046 规格与实施计划 | done | 用户已批准 spec.md，E2E 入口断言变更范围已确认 |
| T03 | 建立 Mobile token 层并调整管理员导航和今日看板入口 | done | AC-01、AC-02 |
| T04 | 按 A 方向完成店长今日待巡样板页 | done | AC-03、AC-04 |
| T05 | 按 A 方向完成管理员任务审核详情样板页 | done | AC-03、AC-05 |
| T06 | 运行现有 E2E 并走查角色路径与看板返回 | done | AC-01、AC-07，Web 已按用户指示记录五项失败 |
| T07 | 触发状态表并完成模拟器自查和盲评修复 | done | AC-06、AC-08 |
| T08 | 最终代码审查、全部机器门和进程清理 | done | 全部 AC 与用户列出的机器门；方式 A 人工确认见交接 |
## 候选逐项进度

| 候选 | 来源方式 | 已保存方向卡与独立页面 | 390×844 截图核对 |
| --- | --- | --- | --- |
| A | oil-ui-pro 显式探索 | evidence/directions/A.md、evidence/candidates/A.html | 店长今日、空状态、完成帧、管理员审核均已截；无控制台错误、横向溢出或资源加载失败。店长首页无边框分组提示；管理员详情仍有嵌套边界提示，最终对比只展示同一的店长首页 |
| B | oil-ui-pro 显式探索 | evidence/directions/B.md、evidence/candidates/B.html | 店长今日、空状态、完成帧均已截；无控制台错误、横向溢出或资源加载失败 |
| C | oil-ui-pro 显式探索 | evidence/directions/C.md、evidence/candidates/C.html | 店长今日、空状态、完成帧均已截；无控制台错误、横向溢出或资源加载失败 |
| D | ui-ux-pro-max | evidence/directions/D.md、evidence/candidates/D.html | 店长今日、空状态、完成帧均已截；今日与完成页有“多块加框”提示，三种状态无控制台错误、横向溢出或资源加载失败 |
| E | frontend-design | evidence/directions/E.md、evidence/candidates/E.html | 店长今日、空状态、完成帧均已截；无控制台错误、横向溢出或资源加载失败 |

截图报告在对应 evidence/shots/<候选>/report.json。A–E 的主比较屏均为店长今日首页，真实样例字段来自现有 Mobile E2E fixture，空状态和完成帧共用同一布局与任务内容。用户选择 A 后补做了两张 A 方向静态样板预览，位于 evidence/samples/，截图位于 evidence/shots/samples/。

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | oil build_explorer.py 构建 compare.html；oil shoot.mjs 对比页全页截图核对 | `docs/work/FW-046-mobile-visual-language/evidence/compare.html`、`docs/work/FW-046-mobile-visual-language/evidence/shots/compare-final/full/page.png` | 五个候选与十张状态关键帧均显示，无控制台错误、横向溢出或图片加载失败。唯一截图提示来自 oil 外壳的 10px PRO 徽标 |
| T01 | passed | oil shoot.mjs 对两张 A 方向样板预览执行 390×844 截图 | `docs/work/FW-046-mobile-visual-language/evidence/shots/samples/page.png` | 两页使用 review-fixtures.ts 现有字段；无控制台错误、横向溢出或图片加载失败。管理员页有 boxedGroups 启发式提示，人工复核为逐项路线、摘要分隔和底部判定组。 |
| T02 | passed | 编写 spec.md 与执行计划草案 | `docs/work/FW-046-mobile-visual-language/spec.md` | A 方向与两张样板页已选定；工作单元尚未批准，未改产品代码 |
| T03 AC-01 | passed | `FW_SLOT=1 pnpm e2e:mobile tests/mobile/admin-dashboard.spec.ts --reporter=line` | `tests/mobile/admin-dashboard.spec.ts` | 2 项通过。看板入口进入 `/admin/dashboard`，Web 返回回到 `/admin/today`。测试从「管理」页进入「今日」并等待其选中，覆盖实际入口位置。 |
| T03 AC-02 | passed | `node packages/tokens/generate-native.mjs` 与 `node packages/tokens/generate-native.mjs --check` | `packages/tokens/native.json` | Mobile 色彩、间距、圆角、字号和遮罩 token 从 CSS 源生成一致，原有 Web token 未修改。 |
| T03 machine | passed | `pnpm --filter @apps/mobile typecheck` | `apps/mobile/` | Mobile TypeScript 检查通过。Expo Router 58.0.31 将 `href: null` 处理成 `hidden: true`，故使用 `tabBarButton: () => null` 隐藏入口并保留程序导航。 |
| T04 AC-03 | passed | 对照批准规格核对 Mobile 视觉与交互文档 | `docs/context/mobile-design.md` | 覆盖 A 方向 tokens、字体、密度、页面框架、空状态、完成反馈、动效、减少动态、十类组件状态语义和 44 dp 操作目标。 |
| T04 AC-04 | passed | Android 模拟器截图、UI 层级与点击走查；槽位 1 隔离 fixture | `docs/work/FW-046-mobile-visual-language/evidence/after/fixture-home.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-only-not-started-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-overdue-then-pending-top-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-overdue-then-pending-bottom-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-finished-top-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-finished-bottom-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-overdue-detail-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-finished-notifications-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/inspector-pending-360.png` | 进行中排在未开始之后时入口指向第 2 项并实际打开该任务；只剩未开始时指向第 1 项；前三项逾期、末项未开始时指向第 5 项；全部逾期或已提交时显示结束状态与「查看通知」。逾期项仍可打开，通知入口进入收件箱。360 dp 主操作实测 280×48 dp，滚动时标题、通知入口和底栏保持可见。fixture 及其额外任务、判定和通知已清理，复查门店、账号、任务、巡检、通知、模板、日程均为 0。 |
| T04 machine | passed | `pnpm --filter @apps/mobile typecheck` | `apps/mobile/components/mobile/today-screen.tsx` | 店长今日页 TypeScript 检查通过。 |
| T05 AC-05 | passed | Android 模拟器截图、UI 层级与滚动走查 | `docs/work/FW-046-mobile-visual-language/evidence/after/admin-review-colors-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/admin-review-360.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/admin-review-scrolled-390.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/admin-review-history-360.png` | 390/360 dp 展示摘要、分数、检查项、证据与判定区；360 dp 三个判定按钮各实测 110×48 dp，滚动后标题与判定区固定。真实改判截图显示首次通过、当前不合格和「完成后人工改判」。测试 fixture 调用其 cleanup 删除本次数据与照片。曾误加的测试断言与用例已撤除。 |
| T05 machine | passed | `pnpm --filter @apps/mobile typecheck` | `apps/mobile/components/mobile/admin/review-detail-screen.tsx` | Mobile TypeScript 检查通过。Web 不注册 Android BackHandler。 |
| T06 AC-07 | passed | `FW_SLOT=1 pnpm e2e:mobile`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts --reporter=line` | `tests/mobile/admin.spec.ts`、`tests/web-results/mobile-slot-1/`、`tests/web-results/slot-1/` | T08 三项修复后的完整重跑，Mobile 43 项全部通过，用时 3.2 分钟。Web 34 项通过、1 项跳过、5 项失败，用时 9.7 分钟，命令退出码为 1；五项名称与「决策与偏差」逐项一致，四项旧退出按钮定位超时，一项账户菜单焦点轮廓为 1px。按用户批准的 AC-07 例外口径通过。 |
| T06 Android | passed | Android 模拟器点击与系统返回；使用现有 `createReviewFixture` 创建并清理隔离数据 | `evidence/after/admin-dashboard-390.png`、`evidence/after/admin-notification-target-390.png` | 今日入口打开总部看板，Android 返回今日；人工审核通知打开对应有效任务的第一项，Android 返回通知收件箱。fixture 调用其 cleanup 删除本次任务、通知、照片与关联数据。归档清理时删除 `evidence/`。 |
| T06 cleanup | passed | 槽位 1 API 取消 NB-001 的 `FW046-visual` 日程并删除方案；查询 `floorwalk_e2e_1` 本次任务 | `evidence/after/inspector-pending-360.png` | 门店已恢复未选方案，临时方案数与该门店本次任务数均为 0。 |
| T06 machine | passed | `pnpm lint`；`pnpm format:check` | `apps/mobile/components/mobile/today-screen.tsx`、`apps/mobile/components/mobile/today-format.ts`、`apps/mobile/components/mobile/today-progress.tsx` | 初次运行发现格式与 400 行限制问题，格式化并拆出日期格式及进度展示后，T08 最终代码的完整 lint、格式检查均通过。 |
| T07 AC-08 | passed | Android 模拟器实际触发；新盲评 Subagent 限定按钮复评 | `docs/work/FW-046-mobile-visual-language/evidence/blind-buttons-third.md`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-camera-third-default.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-camera-third-pressed.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-camera-third-disabled.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-camera-loading-final.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-submit-enabled-normal-scrolled.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-submit-loading-final.png`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-long-names-mobile-future.png` | 按用户授权的第三次方案，拍照按下改 Mobile 按下底色，图标文字原色。限定复评为挡使用 0、难看 0、小毛病 1，差异较小但不像禁用。提交区用滚动后截图，可用主按钮为蓝底白字，旧图确为禁用。使用滨江门店、开店巡检，长名称保留为铺开待处理用例。 |
| T07 AC-06 | passed | 状态逐项触发与有效过程录像逐帧核对 | `docs/context/mobile-design.md`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-motion-reduced-entry.mp4`、`docs/work/FW-046-mobile-visual-language/evidence/after/t07-score-reduced.mp4` | 十类组件状态表完整，实际路径的适用状态与不适用理由见下表。主按钮和评分环减少动态以相邻帧和直接终值代码分支交叉核对。 |
| T07 machine | passed | `pnpm --filter @apps/mobile typecheck`；`pnpm exec eslint apps/mobile/components/mobile/task-item-card.tsx apps/mobile/components/mobile/primary-button.tsx apps/mobile/components/mobile/today-screen.tsx`；`pnpm exec prettier --check` 对上述三文件检查；`python scripts/validate_docs.py`；`git diff --check` | `apps/mobile/components/mobile/task-item-card.tsx`、`apps/mobile/components/mobile/primary-button.tsx`、`apps/mobile/components/mobile/today-screen.tsx` | 拍照按钮和首页焦点反馈修改后通过类型、ESLint 和格式检查；文档校验 0 个问题，差异空白检查通过。最终完整机器门记录见 T08。 |
| T07 cleanup | passed | 槽位 1 精确 fixture 归属事务清理；独立连接计数与文件存在性复核 | `tests/mobile/review-fixtures.ts` | 原 cleanup 未覆盖刷新生成的第二个任务而外键回滚。先移除门店日程，再删除该门店全部任务的通知、照片、AI jobs、判定、聊天、review、参与人、检查项及巡检，最后删除账号、日程、模板、标准、门店。关联实体复查均为 0，1 张照片经 LocalStorageDriver 删除后不存在。过渡动画设置已恢复 1.0，API/Metro 已由 proc.mjs 暂停，避免最终槽位套件冲突。 |
| T08 API | passed | `FW_SLOT=1 pnpm --filter @apps/api test` | `apps/api/src/tests/` | 三项审查修复落盘后重新运行，29 个文件通过、1 个文件跳过；183 项通过、5 项跳过，用时 96.47 秒。 |
| T08 machine | passed | `python scripts/gate.py`；`pnpm typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm build`；`pnpm --filter @apps/mobile typecheck`；`pnpm --filter @apps/mobile build`；`node packages/tokens/generate-native.mjs`；`node packages/tokens/generate-native.mjs --check` | `.git/workflow/gate.json`、`apps/mobile/dist/`、`packages/tokens/native.json` | 最终代码的全部命令退出码为 0，代码指纹为 `112f48596ce67cb7`，门记录基准 HEAD 为 `2ceda10`。docs、workflow 机器门通过；Mobile Android Hermes bundle 导出成功。 |
| T08 environment | passed | `node scripts/dev/proc.mjs status`；开发端口监听检查；ADB 原生冷启动与登录 | `docs/work/FW-046-mobile-visual-language/plan.md` | E2E 结束时开发端口及槽位端口均空，再经 proc.mjs 启动验收 API 3110 与 Metro 3112。模拟器成功载入最终 bundle 并以种子店长进入今日页；Tools button 已恢复开启，系统过渡动画为 1.0。归档检查曾发现未登记的开发服务 API 3018、Web 3019、Metro 3020 分别由 PID 169268、88616、160648 监听，命令行显示为仓库开发入口，未终止；最终复查时它们已自行退出，`proc.mjs status` 为空，3018–3020 与 3110–3112 均无监听。 |
| T08 人工验收 | passed | 用户指示「直接归档提交推送」 | `docs/work/FW-046-mobile-visual-language/plan.md` | 用户原话「直接归档提交推送」；按明确指示完成方式 A 交接和归档，未另外等待一次模拟器复验。 |
| T08 review | passed | 独立 Subagent 按 `docs/howto/final-review.md` 审查完整差异；修复后三项定点复核 | `apps/mobile/components/mobile/admin/review-detail-screen.tsx`、`apps/mobile/components/mobile/admin/admin-today-screen.tsx`、`apps/mobile/components/mobile/admin/review-item.tsx` | 独立 Subagent。P1 打回草稿随默认 pending 变化错绑，修为草稿固定 itemId、输入按 ID 隔离、明确提交草稿 ID；P2 今日请求失败导致看板入口消失，入口移出数据条件；P2 漏掉 incomplete 标识，恢复可见与无障碍文字。三项复核关闭，无其余确定 finding。八个失败域见下表。 |

## T08 审查的八个失败域

| 失败域 | 结论与依据 |
| --- | --- |
| 认证与授权投影 | 登录、会话、角色和上传资格继续由原服务端接口判定，差异未增加授权分支。 |
| 越权与混淆代理 | 沿用原 API 调用及路由参数，没有增加代理、导出或跨商家资源访问。 |
| 并发与幂等 | 打回草稿错绑 finding 已关闭。草稿绑定检查项 ID，输入事件按 ID 隔离，提交明确使用草稿 ID；保存期间对应操作与输入禁用。 |
| 数据解码与序列化 | 沿用已有响应类型、日期格式和状态字段；恢复审核条目的 incomplete 可见与无障碍标识。 |
| 迁移与回滚 | 本单元差异仅涉及 Mobile 展示、样式变量、文档和已有 E2E 定位，数据库迁移不适用。 |
| 敏感数据与日志 | 差异未增加凭据读写和日志，取证使用槽位 1 隔离 fixture，测试数据与照片已清理。 |
| 范围与结构膨胀 | Mobile token 命名层对应 AC-02，首页入口选择对应用户补充的 AC-04；公共 API、共享业务类型、数据库、配置键和依赖没有新增差异。 |
| 文件职责与重复 | 通用输入与选择控件迁至 admin-fields.tsx，首页日期与进度迁至 today-format.ts 和 TodayProgress；新增文件分别负责通用表单、日期格式和今日进度展示，独立审查没有其余 finding。 |

## T07 实际状态核对

| 实际组件 | 触发与结果 | 证据或不适用依据 |
| --- | --- | --- |
| 底部 Tab | 默认、当前、按下及键盘焦点均实际触发，焦点有品牌内环 | `evidence/after/t07-tab-focus-final.png`；没有独立禁用分支，加载表达在目标页面 |
| 首页通知、刷新与总部看板入口 | 通知与刷新实际聚焦，新增入口蓝色边框；默认与点击路径已在 AC-01/04 取证 | `evidence/after/t07-home-refresh-focus-final.png`（通知）、`evidence/after/t07-home-focus-confirmed-2.png`（刷新）、`evidence/after/t07-dashboard-entry-focus.png`；入口没有禁用/局部加载分支，最终审查后入口在页面数据加载或失败时也保持可达 |
| 首页路线行与继续按钮 | 默认、按下、当前与焦点实际触发 | `evidence/after/t07-focus-fixed-5.png`、`evidence/after/t07-focus-fixed-6.png`；无可继续项时以结束状态替换按钮 |
| 审核标题栏与检查项 | 返回、刷新、行选择与当前项已触发品牌焦点，刷新中及当前结论不可重判均实际触发 | `evidence/after/t07-review-back-focus.png`、`evidence/after/t07-review-refresh-focus.png`、`evidence/after/t07-review-focus-fixed.png`、`evidence/after/t07-review-selected-390.png`、`evidence/after/t07-review-loading-390.png` |
| 通过、不合格、打回 | 可用、禁用、焦点及保存加载均实际触发，保存中主色保持并显示 Spinner 与保存中，其他判定禁用 | `evidence/after/t07-review-pass-focus.png`、`evidence/after/t07-review-fail-focus.png`、`evidence/after/t07-review-rework-focus.png`、`evidence/after/t07-review-pass-saving.png`、`evidence/after/t07-review-fail-saving.png`；打回按钮打开表单，保存发生在确认打回 |
| 打回理由、确认打回、取消 | 默认、输入、聚焦、空值禁用与保存加载已触发；保存中理由保留且只读，取消禁用 | `evidence/after/t07-input-default-revised.png`、`evidence/after/t07-input-focus-revised.png`、`evidence/after/t07-input-filled.png`、`evidence/after/t07-confirm-rework-focus.png`、`evidence/after/t07-cancel-rework-focus.png`、`evidence/after/t07-rework-saving-input-disabled.png`；真实请求被槽位 1 事务锁延缓，尝试输入后理由仍为原值，随后回滚锁事务 |
| 拍照、自评、备注与提交 | 默认、按下、聚焦、不能操作、打开相机及提交加载均实际触发；提交时自评禁用，拍摄或提交时备注只读 | `evidence/after/t07-camera-third-default.png`、`evidence/after/t07-camera-third-pressed.png`、`evidence/after/t07-camera-third-disabled.png`、`evidence/after/t07-camera-focus-fixed.png`、`evidence/after/t07-camera-loading-final.png`、`evidence/after/t07-assessment-focus-new.png`、`evidence/after/t07-note-focus-visible.png`、`evidence/after/t07-submit-focus-visible.png`、`evidence/after/t07-submit-loading-final.png` |
| 状态徽标与开关 | 徽标是非交互文本，样板页及本轮任务路径没有开关 | 相应按下/聚焦/加载状态不适用，通用状态规则保留在 mobile-design.md |

减少动态采用 Android `transition_animation_scale=0` 并重新加载 Expo 后录制，结束恢复 `1.0`。只读 Subagent 用 Chrome 解码逐帧 seek 与区域像素比较。主按钮 `evidence/after/t07-motion-reduced-entry.mp4` 有效 7.716856 秒，3.970 秒为默认、3.975 秒首次按下，首次按下与 4.500 秒稳定帧的 6875 像素完全一致，4.820 秒按下、4.825 秒恢复默认。评分环 `evidence/after/t07-score-reduced.mp4` 有效 4.0204 秒，1.56 秒为 0 分，1.57 秒首次 50 分时已为完整半环，1.61 秒稳定帧边界相同。结果与 PrimaryButton、ReviewScoreRing 的 reduceMotion 直接赋终值分支一致。时间精度受帧率和编码限制，静态截图仅展示外观。旧 `t07-motion-reduced-actual.mp4` 时长为 0，未作为证据。

## 交接

- 和讨论时不一样的：首页继续入口按用户补充决定优先进行中、其次未开始，无可继续项时显示结束状态和通知入口；Web 五项 FW-044 既有失败按批准的 AC-07 例外记录。拍照按下反馈复评保留一项小毛病，默认与按下底色差异较小。任务详情整页与超长文本问题交给 Mobile 铺开。
- 需要你测的：在 Android 模拟器查看店长今日和管理员审核详情两张样板的阅读、触控与状态表达，走一次拍照上传、审核判定，以及总部看板和通知目标的返回路径，确认实际操作感受。

### 验收环境

- 人工验收时模拟器停留在 Northbean Coffee 2 的店长今日页，使用已有种子任务，可从路线行查看详情。槽位为 1，API 为 `http://127.0.0.1:3110`，Expo 为 `exp://127.0.0.1:3112`。用户直接要求归档后，受管槽位服务已停止。
- 店长种子账号为 `inspector+nb-002@northbean.example`，管理员为 `hq@northbean.example`，均使用仓库公开演示密码 `northbean-demo`。
- 验收分辨率为 780×1688 px、density 320，对应 390×844 dp，与改前截图像素尺寸相同。Expo Go Tools button 已开启，`transition_animation_scale` 已恢复 `1.0`。受管 API/Metro 已在归档时停止。
- 店长样板改前 `evidence/before/manager-today.png`，改后 `evidence/after/t07-normal-names-home.png`；管理员审核改前 `evidence/before/admin-review.png`，改后 `evidence/after/admin-review-colors-390.png`。

## 回修

| 日期 | 用户原话 | 状态 | 改动或去向 | 提交 |
| --- | --- | --- | --- | --- |

## 决策与偏差

| 日期 | 决策或偏差 | 依据与影响 |
| --- | --- | --- |
| 2026-11-23 | 选择 A 骨架；底栏与标题栏结构锁定 | 用户已在 `.visual/step1.md` 最后一节选定方案 A，步骤二只改变视觉语法 |
| 2026-11-23 | 两张样板页按用户偏好取店长今日待巡和管理员审核详情 | 今日待巡覆盖最高频入口；审核详情用现有 `firstResult`、`result` 与 `manuallyDecidedAfterCompletion` 展示原结论、当前结论和改判状态，不增加接口或取数 |
| 2026-11-23 | 对比共用现有 Mobile E2E 的审核任务 fixture | 以 `tests/mobile/review-fixtures.ts` 的门店、日程、两条检查项和测试证据为内容基线；测试图像只有 1×1 像素，预览保留真实的照片位置和数量，用中性证据占位表达，不伪造门店照片 |
| 2026-11-23 | 讨论阶段先交付候选，不提前写 `spec.md` | 用户要求方向选定后再写规格；本计划保持 `draft` |
| 2026-11-23 | 五候选共用店长今日待巡作为比较页主屏；管理员审核详情留到选择后制作 | style-explorer 要求所有方向使用同一张样板页与同一份数据；先锁视觉方向，再以同一语言完成第二张差异页，避免以 A 的管理员页面影响 A–E 的同页比较 |
| 2026-11-23 | 用户选择视觉方向 A「检查路线」 | 用户原话「FW-046：选 01 A」；A 来源为 oil-ui-pro 显式探索，视觉来源是任务顺序和检查项节点 |
| 2026-11-23 | 审核改判仅呈现已有字段 | API 返回首次结论、当前结论和完成后人工改判标记；不新增改判人、时间或理由字段 |
| 2026-11-23 | E2E 看板路径断言需要适配 | 现有 tests/mobile/admin-dashboard.spec.ts 通过已移除的「总部看板」Tab进入。更新该测试入口可验证新路径，但测试文件在 apps/mobile 与 packages/tokens 目录之外，已向用户确认该范围 |
| 2026-11-23 | 按用户指令将 FW-046 登记为当前 draft，并保留待开单元第一行直到归档 | 当前工作表新增 FW-046；待开单元第一行按用户要求保留，归档时只删本单元对应行 |
| 2026-11-23 | 用户批准 FW-046 规格 | 用户原话「批准」；工作单元进入 approved，按任务表开始实现 |
| 2026-11-24 | 撤除超出授权的测试新增内容 | 用户只批准看板入口断言和审核按钮定位适配；本会话误加的店长测试断言及审核状态测试已撤除，原生验收证据重新取得。 |
| 2026-11-24 | 管理员 Tab 数量断言由五项改为四项 | 用户授权只改 `tests/mobile/admin.spec.ts` 中受 AC-01 影响的现有数量断言，不增加用例。 |
| 2026-11-24 | Web E2E 五项失败记录为 FW-044 账户菜单引入的既有问题，本单元不修复 | 用户明确指示。失败用例为「管理员进入审核队列，店长 Web 端只显示手机端提示」「会话 ID 不暴露给脚本，刷新保持登录，退出后失效」「FW-025 AC-06 Web 注册与管理员密码找回」「FW-024 AC-08 管理员创建店长并完成首次改密」「FW-041 AC-07 登录后五屏三宽截图」。前四项的退出按钮已移入账户菜单，第五项的菜单焦点轮廓为 1px。用户将这五项列为 AC-07 例外，并要求 FW-046 归档后用修正模式单独修。 |
| 2026-11-24 | 发现原首页入口会指向无法继续的逾期任务 | 四任务截图中前三项逾期，原主操作指向第一项，而详情页在截止后禁止未上传项操作。用户随后明确了下列入口选择规则。 |
| 2026-11-24 | 用户确定首页继续入口的选择与结束状态 | 优先第一项 `in_progress`，否则第一项 `not_started`，不选择 `overdue` 和 `submitted`，仅消费 Today API 的现有 `status`，不在客户端重算截止时间。没有可继续项时显示「今日无可继续的任务」或无任务空状态，并提供「查看通知」；保留路线列表以查看已提交或逾期项。通知入口使店长仍可进入打回事项，避免将逾期理解为所有事项均已处理。打回后截止后一小时宽限期内的任务在 Today 中仍为 `overdue`，首页入口不会指向它；通知路径和接口保持原有行为。 |
| 2026-11-24 | 补充拍照按钮的按下反馈 | 状态表走查发现任务路径中的拍照按钮按下时没有可见反馈；补充不改变布局的透明度反馈，并在模拟器复测。 |
| 2026-11-24 | 拍照路径盲评仍未通过，等待范围决定 | 独立盲评 `evidence/blind-camera.md` 将按住态发灰、拍照后提交区需滚动列为「挡使用」，将长 UUID 标题与控件层级列为「难看」。长 UUID 来自隔离 fixture，模拟器照片为系统合成图，截图本身不能证明提交不可达。第一次按下态修改导致按钮尺寸异常，第二次恢复尺寸并以透明度反馈，但复评仍认为像禁用态。审核要求修复前两档，而规格非目标排除其他 Mobile 页面视觉改版，故暂停并等待用户决定范围。 |
| 2026-11-24 | 修正首页任务行与主按钮焦点 | 实测系统默认灰色高亮不符合状态表的品牌焦点环；修改后 `evidence/after/t07-focus-fixed-5.png` 和 `evidence/after/t07-focus-fixed-6.png` 分别显示任务行蓝色边框和主按钮焦点环。 |
| 2026-11-24 | 拍照按钮第三次按用户指定方式调整 | 按下时使用 `--fw-mobile-pressed-background`，图标和文字保持原色；第三次复评若仍认为像禁用，停止并报告，不做第四次。 |
| 2026-11-24 | 限定范围复评拍照与提交按钮 | `evidence/blind-buttons-third.md` 评为挡使用 0、难看 0、小毛病 1，拍照按下态不像禁用，但与默认态差异很小；提交按钮在必填条件满足后的蓝底白字可用态不像禁用。旧截图中的提交按钮实际处于禁用状态。复评使用正常长度门店名和模板名；`evidence/after/t07-long-names-mobile-future.png` 标为「超长文本用例，铺开时处理」。 |
| 2026-11-24 | 任务详情页整体问题交给 Mobile 铺开 | 原盲评原文「首屏标题区与检查项卡片：长 UUID 占据最大视觉权重，拍摄入口被压到内容下方」「卡片纵向堆叠：加入照片后备注与提交区被推到当前视口外」「整体控件：浅蓝按钮、白卡片、圆角边框构成通用表单模板」「拍照后状态：缩略图辨识度低，删除图标直接压在图片上」「控件层级过于发灰」。用户要求标记「交给 Mobile 铺开」；提交按钮若可用却看着像禁用，则在本单元修复。 |
| 2026-11-24 | 补齐状态走查发现的焦点与保存进度遗漏 | 底栏、首页通知/刷新、管理员返回/刷新与总部看板入口补品牌焦点；审核保存保留主色并显示保存中。TodayScreen 超过 400 行，将进度展示迁至 TodayProgress，统计与文案沿用原实现。未增加业务契约或测试用例。 |
