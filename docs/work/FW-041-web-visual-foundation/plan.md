# Web 控制台视觉基础（阶段一）- 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：完成
- 阻塞：无
- 下一步：无

首轮方向稿保存在 `evidence/directions/`。开发与测试使用仓库槽位及现有 Playwright 启停设施，截图对应 Northbean 种子；种子自检准确率和 NB-005 本周平均分分别为 `97.7%` 和 `100`。主要端口与进程归属在交接前复查。

## 任务表

| ID  | 任务                                                                | 状态          | 交付的 AC 与证据                   |
| --- | ------------------------------------------------------------------- | ------------- | ---------------------------------- |
| T01 | 变更前把每条 Web 路由和控制台分区以 1440px 当前状态截图保存         | `done`        | AC-07；截图位于 `evidence/before/` |
| T02 | 实现颜色、字体、尺寸、阴影与动效 token，重新生成 Mobile Native 映射 | `done`        | AC-02、AC-08                       |
| T03 | 实现 Web 公共状态、页面壳、导航、组件状态及规定的动效               | `done`        | AC-01、AC-03、AC-04、AC-08         |
| T04 | 完成总部看板样板页，在三种宽度核验                                  | `done`        | AC-05                              |
| T05 | 完成模板编辑样板页，在三种宽度核验                                  | `done`        | AC-06                              |
| T06 | 验证其它 Web 路由和分区没有回归，写入设计基线并运行全部指定机器门   | `done`        | AC-08、AC-09、AC-10、AC-11         |
| T07 | 最终代码审查                                                        | `done`        | 全部代码类 AC                      |

## 证据

| 任务 | status | command                                                                                                                                                                                                                                                                                                                                                                                      | artifact                                                                                                                      | 备注                                                                                                                                                                                                                                              |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `FW_SLOT=3; FW040_WIDTHS=1440; FW041_EVIDENCE_DIR=docs/work/FW-041-web-visual-foundation/evidence/before; pnpm exec playwright test --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts`                                                                                                                                                                                    | `docs/work/FW-041-web-visual-foundation/evidence/before/`                                                                     | 20 张 1440px 基线截图（路由、控制台十分区及 dashboard 的三个维度）。已复核默认看板包含完整种子数据；响应式观测记录的页面溢出和所有表格横向滚动为 0。并排索引：`docs/work/FW-041-web-visual-foundation/evidence/before/contact-sheet/stitch.png`。 |
| T02  | passed | `pnpm typecheck; pnpm --filter @apps/mobile typecheck; node packages/tokens/generate-native.mjs; node packages/tokens/generate-native.mjs --check; pnpm --filter @apps/web build; pnpm --filter @apps/mobile build; FW_SLOT=1 pnpm e2e:mobile`                                                                                                                                               | `packages/tokens/tokens.css`, `packages/tokens/native.json`                                                                   | Root/Mobile typecheck 通过，Web Vite 生产构建通过（有超过 500 kB chunk 提示），Mobile Android export 通过，Native 映射的 IBM Plex 字体映射仍正确，42 个 Mobile 界面 e2e 通过（2.8m）。                                                            |
| T03  | passed | `pnpm typecheck; pnpm lint; pnpm format:check; pnpm --filter @apps/web build; FW_SLOT=3; FW040_WIDTHS=768,1024,1440; FW041_EVIDENCE_DIR=docs/work/FW-041-web-visual-foundation/evidence/after/framework; pnpm exec playwright test --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts`                                                                                     | `apps/web/src/styles/console.css`, `docs/work/FW-041-web-visual-foundation/evidence/after/framework/contact-sheet/stitch.png` | Desktop、768、1024 三档 20 个状态检查通过；三档页面溢出为 0，账号表首列固定，Dashboard 三维表滚动距离为 0；主题 CSS 和 Web 页面构建通过。                                                                                                         |
| T04  | passed | `$env:FW_SLOT='3'; $env:FW040_WIDTHS='768,1024,1440'; $env:FW040_EVIDENCE_DIR='docs/work/FW-041-web-visual-foundation/evidence/after/final'; pnpm exec playwright test --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts`                                                                                                                                                 | `docs/work/FW-041-web-visual-foundation/evidence/after/final/dashboard-sites-1440.png`                                        | 20 个路由/分区状态在三档宽度通过；三档页面溢出为 0，门店表横向滚动为 0；1440 首屏可见 12 家门店及本周数据。                                                                                                                                       |
| T05  | passed | `$env:FW_SLOT='3'; pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts -g 'FW-026 模板检查项编辑与排序匹配 API'; $env:FW_SLOT='3'; $env:FW040_WIDTHS='768,1024,1440'; $env:FW040_EVIDENCE_DIR='docs/work/FW-041-web-visual-foundation/evidence/after/final'; pnpm exec playwright test --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts` | `docs/work/FW-041-web-visual-foundation/evidence/after/final/templates-1440.png`                                              | 新建、检查项新增/排序/移除、保存与重读通过；三个宽度模板页可操作且无横向溢出。截图已检查 1440 与 768，768 标题输入和操作控件宽度正常。                                                                                                            |
| T06 | passed | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`FW_SLOT=1 pnpm --filter @apps/api test`、Web/Mobile 全量 e2e、Mobile 独立 typecheck/build、Native 生成与检查、颜色字面量 `rg` 扫描、`python scripts/validate_docs.py` | `docs/context/design.md`、`docs/work/FW-041-web-visual-foundation/evidence/after/final/` | API 183 通过、5 条既有跳过；Web 38 通过、1 条按 `FW_UI_INSPECT` 显式开启的历史 inspector 跳过；Mobile 42 通过。20 个状态三宽均无页面横向溢出，看板表均无横向滚动，1440×900 首屏完整可见 12 店；保存操作三宽首屏断言通过。最终 Web 构建 567.59 kB 有 500 kB chunk 提示。颜色扫描无匹配。文档校验 0 问题。测试写库使用槽位及既有 afterAll 清理，走查只读及未保存草稿已取消。 |
| T07 | passed | 独立 Subagent `/root/final_code_review` 按 `docs/howto/final-review.md` 审查 `HEAD^` 起的完整差异及未跟踪文档；定点复核 T05 P2；`pnpm typecheck`；`FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts`；`node scripts/dev/proc.mjs status`；`Get-NetTCPConnection` | `apps/web/src/components/console/template-items-editor.tsx`、`apps/web/src/components/console/templates-page.tsx`、`tests/web/admin.spec.ts` | 七失败域逐项完成，1 条 P2 已修复并由原独立审查者关闭。模板结构更新基于最新状态，VT 更新回调期间同步禁用编辑、保存和切模板入口。回归延迟真实 VT 回调后检查隔离，再验证原增删排序、保存与重读；类型检查通过，admin 全文件 6 通过（28.0s），既有 afterAll 清理测试数据。无新增业务契约或失败路径。项目进程登记为空，3018/3019/3020 及本轮测试端口 3110/3111/3112/3130/3131 的监听数均为 0。 |
| 人工 | passed | 用户确认 | `docs/work/FW-041-web-visual-foundation/evidence/comparison/`、`docs/work/FW-041-web-visual-foundation/evidence/after/final/` | 用户原话：「没问题，归档提交推送」。确认总部看板与模板编辑成品、三种宽度和动效后授权归档、提交及推送。 |

## 交接

- 和讨论时不一样的地方包括核对种子后的自检准确率 `97.7%` 和 `NB-005` 周内平均分 `100`。看板沿用互斥的门店、店长、日期维度。实现中将模板保存栏吸底，VT 截图与更新回调执行期间短暂禁用模板编辑入口，Web 字体补齐系统无衬线回退。
- 需要你测的是总部看板与模板编辑在 `768px`、`1024px`、`1440px` 下的视觉层级、状态辨识、首屏信息与保存动作，以及按下、展开、切页、数字和列表动效的手感，含减少动态偏好。前后对比位于 `evidence/comparison/dashboard/stitch.png` 和 `evidence/comparison/templates/stitch.png`；三宽视口图位于 `evidence/after/final/`，文件为 `dashboard-sites-{768,1024,1440}-viewport.png` 与 `templates-{768,1024,1440}-viewport.png`。

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

| 日期       | 决策或偏差                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | 用户确认总部看板和模板编辑为两张样板页，选定方向 01「钴蓝运营台」。具体选择偏好未注明，方向理由由方案内容说明且不归因为用户原话。                                                                                                                                           |
| 2026-11-19 | 排期继续为活动的 FW-041、待开的 Web 逐页样式，以及 Mobile 样式。用户反馈由 1440 下重新选方向，再按 design.md 逐页收拾 Web，完成后再做 Mobile。                                                                                                                              |
| 2026-11-20 | Web 首轮全量 35 通过、3 失败、1 条既有条件跳过。恢复被压缩的统计说明文案；旧视觉用例宽度改为本单元支持的 768/1024/1440；审核用例午夜后 due_at=now()-2h 产生昨天的判定时间，改为先在宽限内判定，再单独设置宽限后条件验证打回禁用，全部原有断言保留。                         |
| 2026-11-20 | 文档校验报既有 testlog-debt（3 天 / 2 天上限），已按协议询问用户是否「收一下」，FW-041 验证继续。                                                                                                                                                                           |
| 2026-11-20 | 用户授权「收一下」。以 `ccf77ca` 对账，后续代码提交均归属工作单元，修正记录没有待审查行；Mobile 显示问题同步现状并继续排在 Mobile 样式队列。清空 testlog，文档校验 0 问题，提交 `9c738d6`。                                                                                 |
| 2026-11-20 | oil-ui-pro 独立视觉评审 `/root/visual_review` 初轮指出保存动作难找，现有保存区改为吸底，三宽首屏断言通过。复核 9/10，无客观视觉阻断。字体疑点经浏览器实际绘制字体确认 Noto Sans SC Medium 与 Segoe UI Semibold，评审撤回字体违规判断。已显式补齐 Windows/macOS 无衬线回退。 |
| 2026-11-20 | 独立 UX 走查 `/root/ux_review` 自主追查异常门店，确认现有看板缺少历史任务明细入口，最近结果时间范围需要猜测；该建议涉及业务导航和数据呈现，保留供后续讨论。证据在 `evidence/ux-review/`，没有写入数据。                                                                     |
| 2026-11-20 | 独立最终审查发现模板结构动效延迟提交旧数组的 P2 竞态。改为函数式更新和按 key 排序，在截图与更新回调完成前同步禁用模板页编辑入口。原审查者定点复核关闭，主 Agent 验证类型检查及现有 admin e2e 全文件 6 通过。用户完成人工验收并授权归档提交推送。 |
