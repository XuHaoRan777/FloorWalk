# Web 窄屏适配 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：T05
- 阻塞：AC-05 等待用户逐页确认无遮挡和主操作可见可点
- 下一步：等待 AC-05 人工验收；用户确认后按归档流程 Promote 并收尾

Preflight：改动范围为 `apps/web/src/` 与 `tests/web/`，不动 schema、API、业务数据或共享 token。`local-pg18` 正常运行，3018、3019、3020 空闲；截图与 e2e 使用隔离的 `floorwalk_e2e_1`。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 为 15 个页面状态建立可重复的响应式截图与页面横向溢出检查，采集改动前基线 | `done` | AC-08；`evidence/before/` 截图 |
| T02 | 提高侧栏收起断点并验证抽屉焦点、Esc 与关闭按钮 | `done` | AC-01、AC-06；视口检查及键盘交互证据 |
| T03 | 在六个目标页面状态复核表格或表单的窄屏布局，按证据调整难用的表格 | `done` | AC-02、AC-03；计划记录滚动距离和每页处理方式 |
| T04 | 收敛窄屏顶栏身份显示 | `done` | AC-04；768px 布局与身份文本证据 |
| T05 | 同步 Web 窄屏行为规格，并复核 15 个页面状态在 768、1024、1440 下的页面溢出、遮挡与主操作 | `blocked` | AC-05 等待人工验收；页面尺寸证据、改动后截图 |
| T06 | 运行全量机器门并完成最终代码审查 | `done` | AC-07；验证命令结果与独立审查结论 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | `passed` | `FW_SLOT=1 pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts` | `docs/work/FW-040-web-narrow-viewport/evidence/before/` | 15 个页面状态各生成 768、1440 截图；现有 768 下看板门店横滚 186px，店长榜和日期趋势各 90px，账号表 346px，门店表 250px；模板页无表格。所有页面均无页面级横向溢出。 |
| T02 | `passed` | `pnpm --filter @apps/web typecheck`; `FW_SLOT=1 pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts --grep "FW-040 AC-01/06"` | `tests/web/fw040-responsive.spec.ts` | AC-01：768、1023 使用抽屉，1024 使用桌面侧栏。 |
| T02 | `passed` | `FW_SLOT=1 pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts --grep "FW-040 AC-01/06"` | `tests/web/fw040-responsive.spec.ts` | AC-06：抽屉关闭按钮可点，Radix 负责焦点进入与 Esc；关闭按钮和 Esc 关闭后焦点均回到触发器。 |
| T03 | `passed` | `$env:FW_SLOT='1'; $env:FW040_WIDTHS='768,1024'; pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts --grep "15 个 Web 页面状态"` | `docs/work/FW-040-web-narrow-viewport/evidence/after-breakpoint/` | AC-02：看板门店、店长榜、日期趋势及门店表在 768/1024 均无需横滚；账号表需 82px/90px；模板页无表格。15 个页面状态均无页面级横向溢出。 |
| T03 | `passed` | `$env:FW_SLOT='1'; $env:FW040_WIDTHS='768,1024'; pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts` | `docs/work/FW-040-web-narrow-viewport/evidence/after-table/` | AC-03：账号表采用横向滚动并固定首列，测试将滚动 40px 后确认首列仍贴住容器左缘；其余实际表格在两档均无需横滚。 |
| T04 | `passed` | `pnpm --filter @apps/web typecheck`; `FW_SLOT=1 pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts --grep "FW-040 AC-04"` | `tests/web/fw040-responsive.spec.ts` | 768、1023 下身份保持一行；长名称按省略号截断、完整名称保留在 title，元素未超出顶栏。 |
| T05 | `blocked` | `$env:FW_SLOT='1'; $env:FW040_WIDTHS='768,1024,1440'; pnpm e2e -- --config=playwright.web.config.ts tests/web/fw040-responsive.spec.ts` | `docs/work/FW-040-web-narrow-viewport/evidence/after/` | AC-05 机器部分通过，45 张截图对应页面均无页面级横向溢出；需用户逐页确认内容无遗漏遮挡、主操作可见可点后才可改为 passed。 |
| T06 | `passed` | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `FW_SLOT=1 pnpm --filter @apps/api test`; `FW_SLOT=1 pnpm e2e -- --config=playwright.web.config.ts` | `tests/web/fw040-responsive.spec.ts` | AC-07 全量机器门通过；API 183 项通过、5 项跳过；Web 38 项通过、1 项跳过。构建有 Web chunk 体积提示，命令成功。 |
| T06 | `passed` | `独立 Subagent 最终代码审查` | `docs/howto/final-review.md` | 新会话 / 独立 Subagent；七个失败域均无发现。AC-05 按方式 A 交由用户验收。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 交接

<!-- 方式 A 机器门过后写这两行，方式 B 删掉本节。不写逐条验收脚本。第一行写实现与讨论时说定的不同之处（AC 改动、没做的、做法变了的），没有写"无"；第二行在讨论时的功能点之外，只列机器验不了的（真钱、真机、真回调），没有写"无"。 -->

- 和讨论时不一样的：模板页实际无表格，按页面状态核验，AC-03 不适用；账号表仍需 82px/90px 内部横滚，已按 AC-03 固定首列保留姓名上下文。
- 需要你测的：查看 `evidence/before/` 与 `evidence/after/` 的 15 个页面状态，在 768、1024、1440 下确认无遮挡、主操作可见可点；账号表在 768、1024 下仍需少量表格内横滚。

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->
| 2026-11-19 | 当前 `TemplatesPage` 是模板选择列表和检查项表单，没有 HTML 表格；AC-02 按页面状态复核并记录无表格，AC-03 仅适用于实际存在且被判定难用的表格。 |
| 2026-11-19 | AC-02 在新断点下账号表仍需 82px（768）/90px（1024）横滚，操作列会被部分裁切；AC-03 选择横滚时固定首列以保留姓名上下文，字段集合不变。 |
