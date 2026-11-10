# 模板与 AI 审核标准 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：全部完成，等待线尾统一 Promote 与归档
- 阻塞：无
- 下一步：已交付多模板与新检查项、AI 标准库及三套快捷配置，相关机器门、Android 原生证据和独立审查/复核通过；本地提交后自动接力 FW-027，不推送

涉及 `packages/shared`、`apps/api`、`apps/web`、`apps/mobile` 与对应测试；AC-01 的过渡期建单选模板落在 Mobile 今日页。
环境：Node `24.19.0`、pnpm `11.21.0`；`local-pg18` 运行且发布 5433，项目进程为空、开发/e2e 端口无监听；未找到 `psql`/`pg_isready`，不能做只读行数统计。
配置检查提示未登记 `env-group`/`env-local`，沿用批准记录中的用户手动核对；开发库和 e2e 槽位重置已获授权，本单元只在槽位 1 串行验证。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 存储结构、前向迁移与共享契约 | `done` | 无，机器门：共享/API 类型检查 |
| T02 | 模板与 AI 标准管理 API | `done` | AC-01、03、04、06：API 测试覆盖数量上限、标准 CRUD/引用保护、默认与权限隔离 |
| T03 | 巡检快照、提交规则与今日选模板 | `done` | AC-01、02：API 测试及 Mobile 今日流程覆盖模板选择、快照和提交校验 |
| T04 | 快捷配置与 Web 模板/标准页面 | `done` | AC-05、07：Web e2e 覆盖快捷生成、编辑最少张数并刷新保留 |
| T05 | 完整机器门与最终代码审查 | `done` | 全量相关测试、构建、最终审查及 finding 定向复核通过 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | failed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/db/migrate.test.ts` | `apps/api/src/db/migrate.test.ts` | 扩展原 g03 用例到全部迁移后，FW-024 清理逻辑删除空库场景组织；恢复原用例范围，新增独立 0007 回填测试。 |
| T01 | passed | `pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/db/migrate.test.ts` | `apps/api/src/db/migrate.test.ts` | 3/3 通过；独立 fixture 验证旧模板项和巡检快照的 0/1 回填、空验收要点和既有模板 AI 关闭。finally 清理并恢复槽位种子。 |
| T01 | passed | `pnpm --filter @libs/shared typecheck` | `packages/shared/src/contract/index.ts`、`packages/shared/src/contract/ai.ts` | 已核对委派差异：新字段、标准与快捷配置路由、今日模板列表、备注/照片校验；消费端在 T02～T04 同步。旧列在调用方迁移后以前向迁移删除。 |
| T02 | failed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/admin-fw026.test.ts` | `apps/api/src/admin-fw026.test.ts` | 首次 6/8：RESTRICT 返回 23001 而非 23503，引用删除误返 500；测试提前实例化 supertest 请求导致临时端口失效。补充错误码并在循环内创建请求，诊断后 7/8。 |
| T02 | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/admin-fw026.test.ts` | `apps/api/src/admin-fw026.test.ts` | 最终 8/8；主 Agent 已检查差异，覆盖 AC-01 上限并发、AC-03 CRUD/引用、AC-04 默认及归属、AC-06 店长 403/跨商家 404。事务创建独立商家，结束清理；无生产写入。 |
| T03 | passed | `GET https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/` | `apps/mobile/components/mobile/inspection-screen.tsx` | 核对 SDK57 的 launchImageLibraryAsync、launchCameraAsync、allowsMultipleSelection、selectionLimit；保留每次选一张并重复上传的既有交互。 |
| T03 | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/admin.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/admin.test.ts` | 8/8 通过（上下文压缩前已完成）；覆盖本商家模板可选、跨商家拒绝、0 张项空白备注/照片不足 422、双照片提交及模板修改不影响快照；finally 清理所建单据、模板和存储文件。 |
| T03 原生取证 | passed | `adb -s emulator-5554`；API 查询；`FW_SLOT=1 pnpm exec tsx -e "import globalSetup from './tests/mobile/global-setup.ts'; globalSetup();"` | `docs/work/FW-026-templates-ai-criteria/evidence/android-template-choice.png`、`docs/work/FW-026-templates-ai-criteria/evidence/android-required.png`、`docs/work/FW-026-templates-ai-criteria/evidence/android-one-photo-blocked.png`、`docs/work/FW-026-templates-ai-criteria/evidence/android-submitted.png` | Android Expo Go 选非默认模板；显示验收要点、0 张项备注必填和最少 2 张。空备注/缺照片被拦；填备注、系统选择器上传 1 张仍拦，2 张后 submitted/100。API 核对模板 ID、0/2 快照、备注和照片 0/2。取证后调用已有 globalSetup 迁移并重置槽位1，已清理临时模板和单据，API/Metro已停止。 |
| T03 环境修复 | passed | `node --check scripts/dev/proc.mjs`；原生重载 | `scripts/dev/proc.mjs` | Metro 启动器漏传已有 FW_SLOT，导致槽位独立缓存未启用；只读诊断发现旧 file-map 的 router junction 指向已删除的57.0.29。补传后脚本重启，原生 bundle 200并完成业务取证；未改入口或依赖。 |
| T04 | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/admin-fw026.test.ts -t 快捷配置` | `apps/api/src/admin-fw026.test.ts`、`apps/api/src/template-presets.ts` | AC-05：委派结果 3 passed/8 skipped，覆盖三类预设、同名序号、容量事务；主 Agent 已核对实际差异。独立测试商家已清理，槽位交还。 |
| T04 实施检查 | passed | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/web typecheck`；受影响文件 `eslint` | `apps/api/src/templates.controller.ts`、`apps/api/src/ai-standards.controller.ts`、`apps/web/src/components/console/templates-page.tsx`、`apps/web/src/components/console/ai-standards-page.tsx` | 模板与标准从门店控制器拆出，保持每文件 400 行限制；新增新字段编辑、AI 选择、标准增改。最新拆分与界面通过类型和 lint 检查，尚待浏览器取证。 |
| T04 浏览器诊断 | failed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts --grep 'FW-026 AC-07'` | `tests/web/admin.spec.ts` | 快捷创建成功且 AI 已开启；精确标签查询找不到标准下拉框。假设为嵌套 label 包含 option 文字，下一步改为显式标签关联再跑本用例；afterAll 已清理所建模板与标准。 |
| T04 | passed | `pnpm --filter @apps/web typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts --grep 'FW-026 AC-07'` | `tests/web/admin.spec.ts`、`docs/work/FW-026-templates-ai-criteria/evidence/web-template-saved.png` | AC-07：1/1。显式 label/for 关联后通过；模板页三个快捷按钮可见，咖啡店生成后 AI 开启并选中标准，首项改 3 保存、整页刷新重选仍为 3；标准页读取生成提示词、新建并编辑提示词成功。截图见控制台模板页、3 张、验收要点及所选标准；afterAll 删除所建检查项、模板和标准。 |
| T05 静态门诊断 | failed | `pnpm lint`；`pnpm format:check` | `apps/api/src/contract.e2e.test.ts`、`apps/api/drizzle/meta/_journal.json`、`apps/api/drizzle/meta/0007_snapshot.json`、`apps/api/drizzle/meta/0008_snapshot.json` | lint 发现迁移调用后遗留未使用的模板变量和动态属性换行；format 发现三份生成 JSON 未格式化。已定位为静态问题，修复后只复验这些文件。 |
| T05 静态门 | passed | `pnpm typecheck`；`pnpm --filter @apps/mobile check`；修复文件 `eslint` 与 `prettier --check` | `apps/api/src/contract.e2e.test.ts`、`apps/api/drizzle/meta/0007_snapshot.json`、`apps/api/drizzle/meta/0008_snapshot.json` | 全工作区类型检查与 Mobile 依赖一致性通过；全量 lint/format 仅上行问题，修复后对应文件复验通过，其余文件已在全量检查中通过。 |
| T05 API 全套 | passed | `FW_SLOT=1 pnpm --filter @apps/api test`；修复后 `FW_SLOT=1 pnpm --filter @apps/api test -- src/contract.e2e.test.ts` | `apps/api/src/**/*.test.ts` | 21 文件、132 通过；静态修正后契约测试 15/15 通过。OpenAI/OSS 真实服务探针 3 项按配置跳过。本单元不执行真实服务；各测试 finally 清理独立数据并恢复槽位种子。 |
| T05 Web 回归 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts` | `tests/web/admin.spec.ts` | 5/5 通过，覆盖门店管理、模板字段排序、AC-07、错误提示和停用门店看板；afterAll 清理测试创建的数据。 |
| T05 Mobile 回归诊断 | failed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/mobile-inspection.spec.ts tests/mobile/records.spec.ts` | `tests/mobile/records.spec.ts` | 巡检 9/9 通过，记录 5 项均停在登录。页面快照显示同登录名的商家选择，旧测试未选择 Northbean；补上已批准的 FW-024 选商家步骤，只复验记录测试。未改产品行为；失败发生在创建测试数据前。 |
| T05 Mobile 回归 | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/records.spec.ts` | `tests/mobile/mobile-inspection.spec.ts`、`tests/mobile/records.spec.ts` | 前次巡检 9/9，本次记录 5/5 通过；已覆盖新字段下的提交校验、上传、打回重提与记录回归。记录测试 afterEach 清理所建单据和同店账号，结束后统一恢复槽位种子。 |
| T05 构建 | passed | `pnpm build` | `packages/shared/dist`、`apps/api/dist`、`apps/web/dist`、`apps/mobile/dist` | 共享包、Nest API、Vite Web 与 Android 单 worker 导出全部通过；Web 提示单块约 515 kB，构建成功。产物均为忽略文件。 |
| T05 清理 | passed | `FW_SLOT=1 pnpm exec tsx -e "import globalSetup from './tests/mobile/global-setup.ts'; globalSetup();"`；`node scripts/dev/proc.mjs status`；槽位端口检查；`git diff --check` | `tests/mobile/global-setup.ts` | 迁移并恢复槽位1种子，清除本轮巡检与上传数据；项目进程为空，3110/3111/3112 无监听，差异空白检查通过。 |
| T05 最终代码审查 | failed | 独立只读 Subagent `/root/fw026_final_review` 按 `docs/howto/final-review.md` 审完整差异与新增文件 | `apps/web/src/lib/api/types.ts`、`apps/web/src/components/console/review-detail.tsx` | 七个失败域审查发现 1 项 P2：Web 详情仍读取已删除的 photoRequired，照片项均显示无需照片。归 T03/T04 修复，修后仅复核本项；其余未发现可行动问题。 |
| T05 审查修复诊断 | failed | `pnpm --filter @apps/web typecheck`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts --grep 'FW-026 AC-02'` | `tests/web/admin.spec.ts` | 类型、受影响文件 lint/format 通过；浏览器停在审核队列入口，同名按钮出现在侧栏及看板。改为限定控制台导航，下一次仅跑本用例；finally 已删除临时巡检和检查项。 |
| T05 审查修复 | passed | `pnpm --filter @apps/web typecheck`；受影响文件 `eslint`/`prettier --check`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/admin.spec.ts --grep 'FW-026 AC-02'` | `apps/web/src/lib/api/types.ts`、`apps/web/src/components/console/review-detail.tsx`、`tests/web/admin.spec.ts` | 1/1 通过。详情类型复用共享契约，真实 review 响应含 2/0 张快照且无旧字段，页面分别显示至少 2 张、备注必填和验收要点；无新增截图。finally 删除本用例审核记录、检查项、巡检。 |
| T05 finding 复核 | passed | 原独立只读 Subagent `/root/fw026_final_review` 仅复核唯一 P2 | `apps/web/src/lib/api/types.ts`、`apps/web/src/components/console/review-detail.tsx`、`tests/web/admin.spec.ts` | 审查者确认旧字段重复契约已移除，真实响应与 2/0 张界面断言可捕获原回归，finding 关闭；主 Agent 已核对实际差异与命令结果。未重做完整审查。 |
| T05 最终清理 | passed | `FW_SLOT=1 pnpm exec tsx -e "import globalSetup from './tests/mobile/global-setup.ts'; globalSetup();"`；`node scripts/dev/proc.mjs status`；槽位端口检查；`git diff --check`；`python scripts/validate_docs.py` | `tests/mobile/global-setup.ts` | 审查修复测试后再次恢复槽位1种子，清除巡检、上传和测试会话；项目进程为空、3110/3111/3112 无监听，差异空白与普通文档校验通过（0 问题）。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 旧模板迁移为 AI 关闭、标准引用为空；此前没有 AI 配置可供迁移，避免生成未批准的提示词；新模板按 AC 默认启用 AI。
- 旧检查项的 `photo_required` 映射为 `min_photo_count` 的 1/0，既有巡检快照同步映射并将无历史值的验收要点置空。
- 既有 `tests/e2e/g03.integration.spec.ts` 仍由默认与专用 Playwright 配置收集，但 HEAD 已残留旧邮箱登录、旧角色等契约，本轮模板变化亦使其模板段过期。本单元的相关套件通过不代表默认 `pnpm e2e` 可用；该入口尚未迁移，不纳入本单元的通过结论，不扩成本单元的认证回归重写。
