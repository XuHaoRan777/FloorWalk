# AI 真模型验收与提示词调优 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无；T01～T06、最终代码审查、机器门及用户人工验收均通过
- 当前结论：AC-01 基线探针、AC-03 对照、AC-04 校准及 AC-02 E2E 已记录；真实模型调用累计 10/30 次。AC-02 清晰 3°C 合成图实际判为 rework（预期 pass），用户已确认整体测试没问题并通过人工验收；该差异保留为验收偏差。
- 下一步：无；本地 `evidence/` 已清理，通用证据准则已 Promote 至 `docs/specs/inspection.md`「巡检规则」，接力线已归档。

API：AC-04 修改 `apps/api/src/ai` 的提示词拼装与对应单测；沿用现有 OpenAI smoke 测试生成三张图片并将图片证据留在本单元 `evidence/`，每次 smoke 上传的存储对象在样本结束后清理。AC-02 使用既有开发演示数据，不重建数据库或种子。

## 任务表

| ID  | 任务                           | 状态          | 交付的 AC 与证据                                                |
| --- | ------------------------------ | ------------- | --------------------------------------------------------------- |
| T01 | 规格修订与配置键预检           | `done`        | AC-01、AC-04；用户确认三个键名存在                              |
| T02 | 三张合成图真实模型烟测         | `done`        | AC-01；基线三次调用及结果写入 `evidence/`，异常转入 AC-04       |
| T03 | 检查基线「AI 定」条目          | `done`        | AC-03；计数口径偏差与 16 条决策核查结论记录于本计划             |
| T04 | 添加系统级证据准则并校准       | `done`        | AC-04；单测断言拼装顺序；第一轮三张样本均符合预期，累计 6/30 次 |
| T05 | 新建 AI 验收模板并完成审核/改判闭环 | `done`        | AC-02；四次审核、截止判定、管理员改判及看板结果已记录；3°C 清晰图有偏差 |
| T06 | 最终代码审查                   | `done`        | AC-01/02/04；完整差异、机器门和证据复核                       |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                             | artifact                                                            | 备注                                                                                                                                                                                                                       |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `python scripts/validate_docs.py --env-keys`; 用户确认                                                                                              | `docs/work/FW-038-ai-real-model-acceptance/spec.md`                 | `--env-keys` 无本地检查组；用户明确回复“都存在啊”，仅确认键名，不含值。                                                                                                                                                    |
| T02  | passed | `node --env-file=.env.development node_modules/vitest/vitest.mjs run src/ai/openai.smoke.test.ts`（工作目录 `apps/api`，`AI_REVIEW_DRIVER=openai`） | `docs/work/FW-038-ai-real-model-acceptance/evidence/model-probe.md` | 3 次真实请求，额度 3/30。3°C 为 pass、12°C 为 fail、模糊 3°C 误判为 pass；用户明确判 AC-01 基线探针已完成，并要求把模糊证据判断交由 AC-04 解决。首个 package wrapper 尝试在 Vitest 启动前因缺 `FW_SLOT` 退出，未产生请求。 |
| T03  | passed | `rg -n 'AI 定' docs/context/product.md`; 只读规格与实现对照                                                                                       | `docs/work/FW-038-ai-real-model-acceptance/plan.md`                 | 共 17 处匹配，其中第 5 行是标签定义，实际 16 条具体决策；对照相关 specs 与实现，16 条均符合预期。                                                                                                                                              |
| T04  | passed | PowerShell 设置 `FW_AI_SMOKE=1`、`FW_AI_PROBE_LABEL='AC-04 第一轮'`、`AI_REVIEW_DRIVER=openai` 后运行同一 Vitest smoke 文件 | `docs/work/FW-038-ai-real-model-acceptance/evidence/model-probe.md` | 第一轮 3 次调用，额度从 3/30 增至 6/30；3°C 清晰 pass、12°C 清晰 fail、3°C 模糊 rework。适配器单测、API 类型检查与 lint 通过。 |
| T05  | passed | 管理员与店长 API 操作；截止后 1 小时由调度器自动判定；管理员 `POST /api/tasks/:taskId/items/:itemId/decision` 改判；读取任务审核与 `/api/dashboard/sites`；用户人工验收：“测试没问题，归档提交推送” | `docs/work/FW-038-ai-real-model-acceptance/evidence/ac02-e2e.md`; `docs/work/FW-038-ai-real-model-acceptance/evidence/model-probe.md`; `docs/work/FW-038-ai-real-model-acceptance/plan.md` | 4 次真实审核，累计 10/30；12°C 与两张模糊图符合预期。清晰 3°C 实际 rework（预期 pass），理由指向合成图无法证明真实冷柜环境；自动判定 0 分/failed，玻璃改判 pass 后为 50 分/failed，看板同步 50。用户于 2026-11-18 确认测试没问题，AC-02 人工验收通过。 |
| T06  | passed | API 全套测试（175 passed / 5 skipped）；定向测试（27 passed / 3 skipped）；API typecheck、lint、build；`pnpm format:check`；`python scripts/validate_docs.py`；`git diff --check`；独立 Subagent 按 `docs/howto/final-review.md` 审查完整差异 | `apps/api/src/ai/prompt.ts`; `apps/api/src/ai/request-budget.ts`; `docs/howto/final-review.md` | 机器门和独立最终审查通过；额度保护器需在 API 进程设置 `FW_AI_CALL_BUDGET_FILE` 才启用，本次真实调用由证据账本人工核计为 10/30。用户于 2026-11-18 确认人工验收通过；本地 evidence 已按归档流程清理。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 交接

<!-- 方式 A 机器门过后写这两行，方式 B 删掉本节。不写逐条验收脚本。第一行写实现与讨论时说定的不同之处（AC 改动、没做的、做法变了的），没有写"无"；第二行在讨论时的功能点之外，只列机器验不了的（真钱、真机、真回调），没有写"无"。 -->

- 和讨论时不一样的：AC-04 在适配器系统提示中增加通用证据评估准则；AC-02 新建模板“FW-038 AC-02 冷柜与陈列 2026-11-18”，选用“通用”AI 标准并建两项，种子模板与种子 AI 标准未改。清晰 3°C 合成图实际判 rework（预期 pass）；因无截止时间改写 API，用 `floorwalk` 角色将本次任务截止时间回拨后由常驻调度器执行自动判定。
- 需要你测的：真人走一遍 Mobile 店长端的上传体验，确认 AI 结论文字对店员理解是否够用。用户于 2026-11-18 确认：“测试没问题，归档提交推送”；人工验收通过。

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-11-18：用户原话“选 A。用户原话：‘按你建议的’”，并明确授权单元内最多 30 次真实请求及 AC-01/AC-04 的样本、证据和额度停止条件；据此修订批准规格。此前 AC-01 与“Agent 不发真请求”的阻塞已解除。
- T02 首次启动尝试 `pnpm --filter @apps/api test -- src/ai/openai.smoke.test.ts` 在 Vitest 启动前失败：API 通用测试入口预加载 `tests/e2e/api-test-env.ts`，要求 `FW_SLOT`。测试体未执行、未产生模型请求；下一次实验改为直接调用同一 Vitest 文件，不加载 e2e 槽位引导。
- 2026-11-18 用户更正：“AC-01 判为已完成：三样本结论是‘判得不够准’……这就是 AC-04 要解决的事，不是停下的理由。”此前因模糊图结果停止的安排由此更正，继续 AC-04；当前累计 3/30 次。
- AC-01 暴露系统兜底缺口：提示词未要求先评估证据可读性；模糊图理由仍称读数清晰。按用户要求记录，归档时评估升入 `docs/pitfalls.md` 或 `docs/specs/inspection.md` 的 AI 审核小节。
- AC-03：16 条具体“AI 定”决策均符合预期；`product.md` 的 17 处文本匹配中有 1 处是标签定义，不是产品决策。该结论为文档与实现只读对照，不代表重新执行了这 16 条行为。
- 2026-11-18：最初在关闭 AI 的种子模板上试跑时未产生 AI 结论；该次上传不作为最终 AC-02 证据。用户澄清允许新建专用验收模板后，按下述步骤完成四次真模型审核。
- 2026-11-18：独立 Subagent 按 docs/howto/final-review.md 审查完整差异。七个失败域中认证授权、越权代理、数据解码、迁移回滚、结构膨胀均不适用；敏感数据与日志未发现凭据落盘；第 14 节认证、支付、权限和回调失败路径不适用。并发与幂等域发现真实请求额度占用竞态，已改为原子持久编号并由并发单测覆盖，定向复核关闭。另发现 AC-02 只提交一个检查项且种子模板 AI 关闭，不能证明多条检查项上传或提供 AI 结论；在“不改任何模板”的用户约束下无法补齐，T05/T06 保持 blocked，待用户确认 AC-02 范围。
- 2026-11-18：用户更正 AC-02 范围：“不改任何模板”只约束 FW-026 种子 AI 标准与种子模板，AC-02 的新建 AI 模板步骤允许执行。此前审查提出的覆盖范围 finding 因该澄清解除，T05 恢复 `in_progress`；T06 待 AC-02 完成后复审。
- 2026-11-18：AC-02 首次上传得到“模拟审核通过”，确认开发 API 使用 fake 驱动而非真模型；请求未计为真实调用，预算号 7、8 保留防止复用。按本地开发说明从原终端停止并重启 `pnpm dev`，显式设置 `AI_REVIEW_DRIVER=openai`，继续前重传。
- 本地演示服务仍运行时，店长巡检详情页日志重复出现 React Native Web `Unexpected text node` 错误，堆栈位于 apps/mobile/components/mobile/task-item-card.tsx；三张图片上传记录已成功保存。该 Mobile 问题未纳入本单改动，人工验收时观察是否影响页面复核。
- 2026-11-18：AC-02 使用 Northbean 管理员、绑定 NB-001 的店长和现有“通用”AI 标准创建两项 AI 模板；清晰 3°C 判 rework（预期 pass，模型认为合成图不能证明真实冷柜环境），清晰 12°C 判 fail，模糊 3°C 与将同一模糊温度图用于玻璃项均判 rework。四次真实调用后累计 10/30；预算序号 7、8 是 fake/MIME 失败尝试，没有模型请求。任务 dueAt 回拨至当前时间之前，在 dueAt 后一小时由调度器自动判定为 0 分/failed；管理员将非严重玻璃项由 fail 改判 pass 后得 50 分，整单仍 failed（严重冷柜项仍 fail），NB-001 看板同步 50/failed。种子模板和标准未更改，详情见 `evidence/ac02-e2e.md`。
