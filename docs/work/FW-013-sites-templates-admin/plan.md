# 门店与模板管理 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：T01～T05 已完成
- 阻塞：无
- 下一步：打 `g02/done/FW-013`，按并行组规则等待或开启 FW-015 集成；归档状态保持 active。
- 并行组：g02，并行单元，槽位 2（并行 FW-012、FW-013、FW-014；集成 FW-015）

Preflight：只改 spec「批准记录」的写入范围。`inspection.controller.ts` 里建单的停用 409 已由 FW-011 实现，本单元核对并补测试，不重写。T04 动 Mobile 前先读 `~/.agents/skills/expo-overview`，在证据里记一行。Mobile 首屏在三槽并发时偶发加载超时（FW-011 记录，根因未定），遇到先单独重跑一次。

## 任务表

| ID  | 任务                                        | 状态          | 交付的 AC 与证据                                                          |
| --- | ------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| T01 | 门店管理 API 落库与权限测试                 | `done`        | AC-01、AC-03（门店部分）；`apps/api/src/admin.test.ts`                    |
| T02 | 模板管理 API 落库、事务与"不影响已有单"测试 | `done`        | AC-02、AC-03（模板部分）；`apps/api/src/admin.test.ts`                    |
| T03 | Web 门店页与模板页                          | `done`        | AC-04、AC-05、AC-07；`tests/web/admin.spec.ts`                            |
| T04 | 停用效果：Mobile 今日页、看板、主管审完     | `done`        | AC-06；`tests/mobile/site-deactivated.spec.ts`、`tests/web/admin.spec.ts` |
| T05 | 最终代码审查（独立 Subagent）               | `done` | 本槽位全部测试和全量门禁通过；独立审查三条 P2 已修复并定向复核关闭 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | artifact                                                                                         | 备注                                                                                                                                                                                                          |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed | `FW_SLOT=2 pnpm --filter @apps/api test -- src/admin.test.ts`; `pnpm --filter @apps/api typecheck`; `pnpm exec eslint apps/api/src/admin.controller.ts apps/api/src/admin.test.ts`; `pnpm exec prettier --check apps/api/src/admin.controller.ts apps/api/src/admin.test.ts docs/work/FW-013-sites-templates-admin/plan.md docs/backlog.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `apps/api/src/admin.controller.ts`, `apps/api/src/admin.test.ts`                                 | 3 项 API 测试通过；先构建 shared 后类型检查通过。                                                                                                                                                             |
| T02  | passed | `FW_SLOT=2 pnpm --filter @apps/api test -- src/admin.test.ts`; `pnpm --filter @apps/api typecheck`; `pnpm exec eslint apps/api/src/admin.controller.ts apps/api/src/admin.test.ts`; `pnpm exec prettier --check apps/api/src/admin.controller.ts apps/api/src/admin.test.ts docs/work/FW-013-sites-templates-admin/plan.md docs/backlog.md`; `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `apps/api/src/admin.controller.ts`, `apps/api/src/admin.test.ts`                                 | 6 项 API 测试通过；旧巡检快照保持不变，重复名称更新回滚。                                                                                                                                                     |
| T03  | passed | `FW_SLOT=2 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts`; `pnpm --filter @apps/web typecheck`; `pnpm --filter @apps/web build`; `pnpm exec eslint apps/web/src/lib/api/admin.ts apps/web/src/components/console/sites-page.tsx apps/web/src/components/console/templates-page.tsx`; `pnpm exec prettier --check apps/web/src/lib/api/admin.ts apps/web/src/components/console/sites-page.tsx apps/web/src/components/console/templates-page.tsx tests/web/admin.spec.ts`; `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `tests/web/admin.spec.ts`                                                                        | 3 个 Web e2e 通过；首轮发现新建草稿被列表重载覆盖，修复后第二轮仅剩文本定位歧义，第三轮通过。                                                                                                                 |
| T04  | passed | 读取 `C:\Users\29019\.agents\skills\expo-overview\SKILL.md`，按路由读取 `expo-data-fetching/SKILL.md`; `FW_SLOT=2 pnpm --filter @apps/api test -- src/admin.test.ts`; `FW_SLOT=2 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts`; `FW_SLOT=2 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/site-deactivated.spec.ts`; `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/web typecheck`; `pnpm --filter @apps/mobile typecheck`; `pnpm exec eslint apps/api/src/admin.test.ts apps/mobile/components/mobile/today-screen.tsx apps/web/src/components/console/dashboard-view.tsx apps/web/src/components/console/sites-page.tsx apps/web/src/components/console/templates-page.tsx apps/web/src/lib/api/admin.ts`; `pnpm exec prettier --check apps/api/src/admin.test.ts apps/mobile/components/mobile/today-screen.tsx apps/web/src/components/console/dashboard-view.tsx tests/web/admin.spec.ts tests/mobile/site-deactivated.spec.ts`; `git diff --check` | `apps/api/src/admin.test.ts`, `tests/web/admin.spec.ts`, `tests/mobile/site-deactivated.spec.ts` | API 7/7、Web 4/4、Expo Web 1/1 通过；停用时记录列表与详情 API 可用，主管仍可审核。记录页 UI 仍由 FW-014 实现，本单未修改其文件。先前一次 API 测试使用含必拍项的种子模板导致 422，改用无必拍项临时模板后通过。 |

| T05 | passed | `pnpm lint`; `pnpm format:check`; `pnpm typecheck`; `pnpm build`; `FW_SLOT=2 pnpm --filter @apps/api test`; `FW_SLOT=2 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts --workers=1`; `FW_SLOT=2 pnpm exec playwright test --config=playwright.mobile.config.ts --workers=1`; 修复后 `pnpm --filter @apps/api typecheck`、受影响文件 ESLint/Prettier、Web admin 定向套件、`git diff --check`；`python scripts/validate_docs.py`；独立 Subagent 按 `docs/howto/final-review.md` 审查与三条 finding 定向复核 | `apps/api/src/admin.test.ts`, `apps/api/src/contract.e2e.test.ts`, `tests/web/admin.spec.ts`, `tests/mobile/site-deactivated.spec.ts` | 根门禁通过；API 最终 41/41，Web 全套 11/11（审查修复后 admin 4/4），Mobile 最终 10/10。初次全量 API 39/40 的种子污染已按预授权修复，未放宽断言。独立 Subagent 三条 P2 均关闭，七失败域见下。测试清理临时巡检、模板、门店、会话并事务恢复初始 current；按端口检查 3120/3121/3122 均无监听，本次服务已退出。 |

独立 Subagent `/root/fw013_final_review` 七失败域结论：认证与授权投影：实时会话/角色校验，未知绑定拒绝；越权与混淆代理：管理接口角色与巡检门店归属检查有效，无代理/导出；并发与幂等：建单事务锁门店消除停用竞态，模板事务与固定锁顺序、唯一冲突回滚有效；解码与序列化：共享 schema 与 iso 转换，无新分页；迁移与回滚：未改 schema/迁移历史，复合写入事务与测试 current 恢复有效；敏感数据与日志：无新增凭据落盘/输出；范围与结构：均对应 AC-01～07，无契约/依赖变更。权限失败路径有实际 API 测试逐条覆盖店员管理 GET/POST/PATCH/PUT/设当前 403；Web 另验中文错误与 401 回登录。

边界：Expo Web 已验证停用后记录页/历史详情路由可进入、历史接口可读，以及重新启用恢复新建入口；完整记录列表与详情内容由 FW-014/集成 FW-015 的对应 AC 验收，本单未改其文件。无本单待人工验收项。

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-29 产品决定见 FW-011 plan「决策与偏差」：总部和主管可管；直接改原模板（建单时复制检查项，已有单不受影响）；全店共用一个当前模板，不能删、不按店分配；门店停用不删，店员仍能登录、不能新建、已提交的单可审完、看板标已停用、可重新启用；后保存覆盖。
- 2026-10-29 新建的门店暂时没有店员（用户管理不在 g02），新门店只能在看板和门店页上看到。
- 人工触点由 Claude 在集成复核时按类别补记；本单元停下时照常在这里写三行并打 `g02/blocked/FW-013`。
- T05 独立审查发现建单停用 TOCTOU、测试未恢复当前模板、AC-06 重新启用与历史详情 UI 证据缺项；在原范围修复。全量 API 原为 39/40：FW-011 管理接口测试修改种子门店/模板后未恢复；按 spec 预授权补临时数据与清理步骤，保留原断言。Web 套件默认并发会互相重置/修改同槽数据，使用 `--workers=1` 串行；Mobile 既有一次文本定位歧义已改为 tab 定位。
