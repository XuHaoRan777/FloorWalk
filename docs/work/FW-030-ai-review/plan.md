# AI 逐条审核 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：无，T01～T06 已完成
- 阻塞：无
- 下一步：已交付逐条 AI 审核、重试转人工、上传替换隔离及自检统计；本地提交后自动接力 FW-031「管理员审核与改判（Web）」，在线尾统一归档

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

Preflight：目标涉及 `packages/shared`、`apps/api` AI/上传/审核/统计/数据库模块及 API 测试；FW-028/FW-029 提交均已在当前历史中，依赖路径无需额外文件；`local-pg18` 发布 5433，槽位 3110 未监听，已有进程占用 3018–3020，保留不动。首次模型冒烟因未设置 `FW_SLOT` 在测试引导阶段退出，设置 `FW_SLOT=1` 后真实视觉模型探针通过；配置缺键检查提示未登记 `env-group`/`env-local`，按批准记录由用户手动核对。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 模型探针（本地存储签名链接、图片与 JSON schema） | `done` | AC-01：`evidence/model-probe.md` |
| T02 | AI 输入/输出契约、驱动配置与队列迁移 | `done` | AC-02；AC-04 三种结论 schema |
| T03 | 上传入队、后台重试、替换取消及关闭 AI 转人工 | `done` | AC-03、AC-05 |
| T04 | 保存逐条 AI 结论与理由，接入现有判定时间规则 | `done` | AC-04 |
| T05 | 自检统计接口及管理权限/跨商家失败路径 | `done` | AC-06、AC-07 |
| T06 | 最终代码审查 | `done` | 全量机器门、全量套件、构建、独立审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `$env:FW_SLOT=1; $env:FW_AI_SMOKE=1; pnpm --filter @apps/api test -- src/ai/openai.smoke.test.ts` | `apps/api/src/ai/openai.smoke.test.ts`; `docs/work/FW-030-ai-review/evidence/model-probe.md` | 首次因未设 `FW_SLOT` 在测试引导退出；补齐后探针通过，最终三种结论 schema 下重跑也通过：本地签名链接读取 1 次、合成红色方块图返回 `pass`、JSON schema 校验通过，约 6.1 秒，测试对象已清理。 |
| T02 | passed | `pnpm typecheck`; `$env:FW_SLOT=1; pnpm --filter @apps/api test -- src/ai/fake.test.ts src/ai/openai.test.ts` | `packages/shared/src/contract/ai.ts`; `apps/api/src/ai/`; `apps/api/drizzle/0013_fw030_ai_review_queue.sql`; `apps/api/drizzle/0014_fw030_ai_review_upload_version.sql` | 首次类型检查发现重试日志作用域错误，修正后全 workspace 类型检查通过；AI 测试 23/23。新迁移在 T03 任务上传测试运行时应用于 e2e 槽位。 |
| T03 | passed | `pnpm typecheck`; `$env:FW_SLOT=1; pnpm --filter @apps/api test -- src/tests/tasks.test.ts` | `apps/api/src/tests/tasks.test.ts`; `apps/api/src/services/ai-review-queue.ts` | 初次 10/11，退避 SQL 时间参数的类型推断冲突导致更新失败；显式转换 timestamptz 后 11/11。覆盖 1/2/4 秒退避、共 4 次调用转人工、关闭 AI 零入队、同毫秒重传取消和执行中旧结果隔离；afterAll 清理测试组织和照片。 |
| T04 | passed | `pnpm --filter @apps/api typecheck`; `$env:FW_SLOT=1; pnpm --filter @apps/api test -- src/tests/tasks.test.ts` | `apps/api/src/tests/tasks.test.ts`; `apps/api/drizzle/0015_fw030_ai_review_conclusion.sql` | 13/13，通过/打回/属实不合格与理由、连续四次打回、首次自评/结论/上传者不变、普通截止与打回宽限判定均通过；首次通过后再打回仍按最终结论时间判定，超时未补传标未完成。测试组织、照片在 afterAll 清理。 |
| T05 | passed | `pnpm --filter @apps/api typecheck`; `$env:FW_SLOT=1; pnpm --filter @apps/api test -- src/tests/tasks.test.ts`; `$env:FW_SLOT=1; pnpm --filter @apps/api test -- src/tests/contract.e2e.test.ts` | `apps/api/src/tests/tasks.test.ts`; `apps/api/src/tests/contract.e2e.test.ts`; `packages/shared/src/contract/stats.ts` | tasks 15/15、contract 15/15；覆盖首传样本不随重传/改判变化、旧记录首传者未知时重传不误归属、日期/门店/店长筛选、空样本，以及匿名 401、店长 403、跨商家与不存在资源 404、参数 400、统一服务端错误。契约初次仅旧路由数量断言失败，更新 45→46 后通过；afterAll 清理测试组织与照片。 |
| T06 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `python scripts/validate_docs.py`; `$env:FW_SLOT=1; pnpm --filter @apps/api test`; `pnpm build` | `apps/api/src/controllers/evidence.controller.ts`; `apps/api/src/services/ai-review-queue.ts`; `apps/api/src/ai/openai.smoke.test.ts` | 全 workspace 类型、lint、格式、文档与构建通过；API 完整套件 24 文件、162 测试通过，外部冒烟 2 文件、3 测试按默认开关跳过，最终模型探针另见 T01。初次 lint 的 407 行文件上限与三处无效初始化已用等价整理修复，随后 API 类型和 tasks 15/15 复验通过。Web 既有大 chunk 警告不阻断构建。 |
| T06 | passed | 独立 Subagent 按 `docs/howto/final-review.md` 审查完整差异及新增文件；`python scripts/validate_docs.py` | `apps/api/src/services/ai-review-queue.ts`; `apps/api/src/controllers/dashboard.controller.ts`; `apps/api/drizzle/`; `packages/shared/src/contract/` | 独立 Subagent：七个失败域已逐项审查，无阻断 finding；结构逐项对应 AC-02～07，权限失败路径有 API 测试证据。遵守禁读规则未读取 `.env*`，配置仍按批准记录由用户手动核对；多 worker 租约竞态未专项验证，当前交付不宣称支持多 worker。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- AC-06 按经理统计以条目首传者归属，按任务日期筛选；FW-028 的 `uploaded_by_id` 会被重传覆盖，因此保存首传者。AC-03 以单调递增上传版本号绑定审核任务，避免同毫秒重传时旧结果覆盖新版本。
- 关闭 AI 时不创建队列行，由管理员读取接口推导待人工；审核任务的结论保留用于 AC-04 既有打回时间规则。遗留数据首传者未知时不从最后上传者推断，后续已知种子写入首传者。
