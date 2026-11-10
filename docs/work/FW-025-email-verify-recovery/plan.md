# 注册邮箱验证与管理员找回密码 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：无（T01～T04 已完成）
- 阻塞：无
- 已交付：Resend / 假邮件驱动、注册邮箱验证、管理员多商家密码找回，以及 Web / Mobile 入口与流程。
- 下游：FW-026 模板与 AI 审核标准。
- 下一步：本地提交后按接力开启 FW-026；本单元保持 active，线尾统一 Promote 与归档。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

接力开工核对：涉及 API、数据库迁移、shared、Web、Mobile 和相关测试；开发库 `floorwalk` 有 2 家商家、16 个账号、0 个活动会话；容器 `local-pg18` 正常，宿主端口 5433 可连，API/Web/Metro 与测试槽位端口空闲。文档及 FW-024 上游提交核对通过；`--env-keys` 因未登记 `env-group` 无法检查本地配置，按批准记录由用户手动核对。

## 任务表

| ID  | 任务                                                          | 状态          | 交付的 AC 与证据    |
| --- | ------------------------------------------------------------- | ------------- | ------------------- |
| T01 | 验证码发信与注册 API（Resend / 假驱动、邮箱验证码、组织注册） | `done`        | AC-01、AC-02        |
| T02 | 管理员找回密码 API 与验证码失败路径                           | `done`        | AC-03、AC-04、AC-05 |
| T03 | Web 注册/找回与 Mobile 找回界面及端到端流程                   | `done`        | AC-06               |
| T04 | 最终代码审查                                                  | `done`        | 全部 AC             |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务                 | status | command                                                                                                                                                                                                                                   | artifact                                                                                                                    | 备注                                                                                                                                                                                                                                              |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 AC-01            | passed | `pnpm --filter @libs/shared build`; `pnpm --filter @apps/api test src/email/resend.test.ts`                                                                                                                                               | `apps/api/src/email/resend.test.ts`                                                                                         | Resend 模板变量与发件信息单测 3/3；假驱动在 API e2e 环境可读取。                                                                                                                                                                                  |
| T01 AC-02            | passed | `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 pnpm --filter @apps/api test src/email-verification.test.ts src/orgs.test.ts src/contract.e2e.test.ts`                                                                                    | `apps/api/src/email-verification.test.ts`                                                                                   | 定向 API 测试 24/24；注册须提交有效验证码，同邮箱可注册多个商家。                                                                                                                                                                                 |
| T02 AC-03            | passed | `FW_SLOT=1 MAIL_DRIVER=fake pnpm --filter @apps/api test src/email-verification.test.ts`                                                                                                                                                  | `apps/api/src/email-verification.test.ts`                                                                                   | 注册和找回均覆盖 60 秒限频、过期、五次输错后正确码仍失败；审查修复后 API 定向测试 6/6。                                                                                                                                                           |
| T02 AC-04            | passed | `FW_SLOT=1 MAIL_DRIVER=fake pnpm --filter @apps/api test src/email-verification.test.ts`                                                                                                                                                  | `apps/api/src/email-verification.test.ts`                                                                                   | 未知邮箱与仅店长邮箱不发信且无法验证；邮件发送保持 pending 时已知/未知邮箱均返回相同 201，随后注入拒绝，两者仍限频 429。多商家 admin 返回组织选项；短密码 400，旧密码与会话不变，合法改密后所选组织全部会话吊销、其他组织会话保留。审查修复后 6/6。                            |
| T02 AC-05            | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/email-verification.test.ts src/contract.e2e.test.ts`                                                                                                                                          | `apps/api/src/email-verification.test.ts`                                                                                   | 验证码与 recovery token 只保存 HMAC 哈希；token 一次性消费，不能复用。                                                                                                                                                                            |
| T03 AC-06            | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/orgs.spec.ts`; `FW_SLOT=3 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/password-recovery.spec.ts`; Web/Mobile `typecheck` | `tests/web/orgs.spec.ts`; `tests/mobile/password-recovery.spec.ts`                                                          | Web 3/3、Mobile 1/1；注册发送、倒计时、验证码错误提示和找回后登录通过；Mobile 带入登录名，手机号提示联系管理员，多商家选择后仅所选商家密码改变。测试在事务中清理本任务商家、账号、会话及验证码；未新增持久化 reset token。                        |
| T03 技能与版本       | passed | 读取 Expo/UI 技能；查阅 `https://docs.expo.dev/versions/v57.0.0/sdk/router/`                                                                                                                                                              | `apps/mobile/components/mobile/password-recovery-screen.tsx`                                                                | 已读 ui-skills-root、expo-overview、expo-native-ui、expo-router、expo-ui；SDK 57 Router 官方文档 HTTP 200，核对 Link、useLocalSearchParams、Protected；沿用仓库 Framed sheet 与现有表单组件。UI 技能 CLI 在线目录获取失败，未新增依赖。           |
| T04 静态机器门       | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `git diff --check`; `python scripts/validate_docs.py`                                                                                                                                 | `apps/`; `packages/`                                                                                                        | 全量类型、lint、格式与差异空白检查通过；文档校验 0 问题。首次格式检查发现 10 个文件格式不符，按 Prettier 修正后复查通过，未改变行为。                                                                                                             |
| T04 API 全量         | passed | `FW_SLOT=1 MAIL_DRIVER=fake pnpm --filter @apps/api test`                                                                                                                                                                                 | `apps/api/src/`                                                                                                             | 20 个文件、118 项通过；真实模型与 OSS 烟测 3 项按既有开关跳过。仅使用槽位 1 与假邮件驱动；既有测试负责清理本任务数据，不发送真实邮件。                                                                                                            |
| T04 构建与资源       | passed | `pnpm build`; `node scripts/dev/proc.mjs status`; 检查槽位端口监听与本任务数据计数                                                                                                                                                        | `apps/api/dist/`; `apps/mobile/dist/`; `apps/web/dist/`                                                                     | API、Mobile Android Hermes bundle 与 Web 构建通过；Web 提示单个 chunk 超过 500 kB，属于构建建议。进程登记为空，3110、3111、3130、3132 均无监听；以 floorwalk 角色只读查询槽位 1、3，`fw025-%` 账号及验证码均为 0。                                |
| T04 最终代码审查     | failed | 独立 Subagent 按 `docs/howto/final-review.md` 审查完整非 env 差异                                                                                                                                                                         | `apps/api/src/email-verification.ts`; `apps/api/drizzle/meta/0006_snapshot.json`; `apps/api/src/email-verification.test.ts` | 独立 Subagent，七失败域已查；初审发现 3 项 P2：找回发信失败可暴露邮箱存在性（T02）；新增快照未反映当前 schema（T01）；仅店长邮箱与短密码拒绝缺 API 证据（T02）。修复及原审查者定向复核见下行；环境模板按内核禁读未核实内容。                  |
| T04 finding 修复验证 | passed | `pnpm --filter @apps/api typecheck`; `FW_SLOT=1 MAIL_DRIVER=fake pnpm --filter @apps/api test src/email-verification.test.ts`; Drizzle `generateMigration(0006 snapshot, current schema)`                                                 | `apps/api/src/email-verification.test.ts`; `apps/api/drizzle/meta/0006_snapshot.json`                                       | 两轮修复后类型检查与定向测试均通过，最终 6/6；0006 快照由当前 schema 重新生成、保留 id/prevId，与当前 schema 差异为 0。首次 ESM 导入 Drizzle API 因其动态 require 不兼容失败，改用 createRequire 后成功；未改历史迁移。测试 afterAll 事务清理本任务数据并关闭连接；最终以 floorwalk 角色只读核对槽位 1，任务账号、验证码及店长专用测试验证码均为 0，任务端口无监听。 |

| T04 finding 定向复核 | passed | 原独立 Subagent 按 `docs/howto/final-review.md` 仅复核 3 项 finding；第 1 项仅复核邮件等待耗时修复增量 | `apps/api/src/email-verification.ts`; `apps/api/drizzle/meta/0006_snapshot.json`; `apps/api/src/email-verification.test.ts` | 原审查者确认 3 项均关闭、无阻塞。找回先提交验证码与限频记录，再启动邮件发送并处理拒绝；发送保持 pending 时请求仍返回相同 201。注册继续等待发送，失败回滚。仅核对这些修复，未重跑整轮审查。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 用户决策：2026-11-10 选择 Resend 取代阿里云邮件推送；使用 Resend 模板 `verification-code`、发件地址 `FloorWalk <no-reply@mail.codexu-studio.com>`。AC-01 已列配置键 `MAIL_DRIVER`、`MAIL_FROM_ADDRESS`、`RESEND_API_KEY`、`RESEND_TEMPLATE_ID` 与两份 API 环境模板路径。
- 注意：FW-025 的验证码有效期为 5 分钟，Resend 模板变量 `EXPIRES_IN` 实际发送时须传 `5 分钟`。
