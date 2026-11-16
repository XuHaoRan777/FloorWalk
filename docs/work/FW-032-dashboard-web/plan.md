# 今日视图与看板（Web） - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：无
- 阻塞：无
- 已交付：Web 今日视图、周/月看板及对应聚合接口；AC 和最终代码审查均通过。
- 下一步：自动接力 FW-033；线尾统一 Promote 与归档。

- Preflight（2026-11-17）：起点 `b79257e`，FW-031、FW-030 提交均在，工作区干净，文档校验 0 问题；修改 API/Web/shared 与既有测试设施，无 schema 或迁移。
- 只读开发库统计：角色 `floorwalk`，库 `floorwalk`，任务 19、巡检单 19；`local-pg18` 正常发布 5433。测试使用槽位 1；API/Web 槽位无监听，现有 API 登记已失活，执行测试前由起停脚本清理。
- Node 24.19.0 / pnpm 11.21.0 可用；UI 指导读取 `ui-skills-root`、`baseline-ui`（技能服务 fetch 失败后使用本地文件）；不读取环境文件内容、不调用真实 AI。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 今日任务、汇总、警告与待我处理（聚合 API + Web + 测试） | `done` | AC-01；本任务内 API 与 Web e2e 取证 |
| T02 | 周/月看板、三维切换、租户隔离与空态（聚合 API + Web + 测试） | `done` | AC-02、AC-03、AC-04、AC-05；本任务内 API 与 Web e2e 取证 |
| T03 | 最终代码审查 | `done` | 受影响模块完整套件、构建、机器门；独立只读审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/dashboard.spec.ts`；API/Web typecheck | `tests/web/dashboard.spec.ts` | AC-01：1/1；API 汇总 6/4/1、两类警告、两类待审、时间窗、零分、详情入口及不显示 AI 审核中。首轮最后一步标题选择器同时匹配 h2/h3，改为 exact 后通过。独立商家、会话与条目在 finally 事务清理。 |
| T02 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/dashboard.spec.ts` | `tests/web/dashboard.spec.ts` | AC-02：本周 4 项、截止前交齐 2 项（含截止后打回重传）、逾期 1、自检准确率 50%（按样本加权）、已判定平均分 60；切本月 5 项、完成率 40%。 |
| T02 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/dashboard.spec.ts` | `tests/web/dashboard.spec.ts` | AC-03：门店表、两个店长按提交数排序及通过率/首次上传人准确率、日期折线与逐日数值通过。 |
| T02 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/dashboard.spec.ts`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/tests/contract.e2e.test.ts` | `tests/web/dashboard.spec.ts` | AC-04：判定任务的指标和月切换、店长维度通过；店长请求 403、跨商家统计对象 404，聚合不含外商家门店；契约 15/15。测试独立商家与数据在 finally 事务清理。 |
| T02 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/dashboard.spec.ts tests/web/console.spec.ts tests/web/orgs.spec.ts` | `tests/web/dashboard.spec.ts` | AC-05：今日无任务、本周暂无数据、不显示空图；相关页面回归 12/12。 |
| T03 | passed | `FW_SLOT=1 pnpm --filter @apps/api test`；`pnpm lint`；`pnpm --filter @apps/web typecheck`；`pnpm format:check` | `apps/api/src/tests/contract.e2e.test.ts` | API 全量 163 通过、3 项既有 smoke 跳过。lint 首次因 console.tsx 超出 400 行限制失败，移除三个冗余别名后通过；Web 类型和格式检查通过。 |
| T03 | failed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/admin.spec.ts` | 28 通过、1 跳过、2 失败：新版看板漏掉既有最近分数/状态；新增维度按钮与门店导航同名导致测试选择器歧义。拟接回既有接口并限定导航选择器后复验。 |
| T03 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts tests/web/site-supervisors.spec.ts tests/web/dashboard.spec.ts`；`pnpm --filter @apps/web typecheck` | `tests/web/dashboard.spec.ts` | 修复后 11/11：最近分数与判定保留，周期无任务时仍可看历史结果；门店导航选择器限定到导航区。 |
| T03 | passed | `pnpm --filter @libs/shared build`；`pnpm --filter @apps/api build`；`pnpm --filter @apps/web build`；API/Web typecheck；`pnpm lint`；`pnpm format:check`；`python scripts/validate_docs.py`；`git diff --check` | `packages/shared/src/contract/dashboard.ts` | 修复后的受影响模块构建、类型、lint、格式与文档检查均通过；Web 构建提示大于 500 kB 的包体积警告。 |
| T03 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/dashboard.spec.ts` | Web 全量回归 30 项通过、1 项跳过；覆盖此前失败的最近分数及门店导航场景。 |
| T03 | passed | 独立 Subagent 审查规格、计划及完整差异 | `docs/howto/final-review.md` | 无 finding；认证与授权投影、越权与混淆代理、并发与幂等、数据解码与序列化、敏感数据与日志、范围与结构膨胀均通过；迁移与回滚不适用（无 schema 或迁移变更）。店长 403、跨商家 404 均有测试证据。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

- 统计使用组织时区：本周按周一至周日，本月按自然月；应完成数来自所选期间实际生成的任务，不推算尚未生成的未来日程。
- 完成口径使用存在检查项且全部已上传；现有上传路径禁止截止后首次上传，因此可证明曾在截止前交齐，避免最后上传时间被打回重传覆盖而误算。统计逾期为截止已过且未交齐；不修改既有任务状态机。
- 店长提交数与通过率按条目当前有效上传人计算，通过率分母为已判定条目；自检准确率保持 FW-030 首次上传人归属，界面说明两者口径，避免把准确率平均成商家准确率。
- 看板聚合由多次只读查询组成；多人同时上传或改判时，汇总与排行可能短暂不同步。

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->
