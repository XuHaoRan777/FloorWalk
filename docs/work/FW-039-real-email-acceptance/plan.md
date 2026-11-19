# 真实邮件验收 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：—
- 阻塞：无。
- 下一步：无；归档提交见 Git 历史。

- Preflight（2026-11-18）：起始工作区干净，文档校验 0 个问题；仅补工作流配置与文档，不改业务代码、数据库、邮件模板或 DNS。
- 起始进程状态与 3018/3019/3020 端口检查均无本项目服务；当时尚未启动进程、访问数据库或写测试数据，真实发信 0/5。
- 首次 `--env-keys` 提示没有登记本地配置，未实际检查；通过已有 `env-local` 入口补齐 API 开发配置登记后重取证，不把空检查当作 AC-01 通过。
- 执行进度（2026-11-19）：T01 已通过；API 使用 floorwalk 开发库在 3018 启动，health 返回 ok，Web 3019 返回 HTTP 200。等待邮箱期间已通过起停脚本停止本单元 API/Web，`proc.mjs status` 无输出；未请求验证码、未注册账号或写测试数据，真实发信仍为 0/5。AC-05 的邮件驱动选择尚待用户确认。
- 执行进度（2026-11-19）：用户提供验收邮箱并要求继续、由其本人测试。T01 监听修正后 API 仅绑定 `127.0.0.1:3018`，health 与 Web Origin 预检通过；AC-02 注册验证码 API 返回 HTTP 201，Resend 接受且取得消息 ID，真实发信额度为 2/5。Web 3019 的 `/register`、`/forgot-password` 均返回 HTTP 200。API/Web 由受管脚本启动并保持运行，等待用户完成 AC-03/04；未查看或记录验证码。
- 执行进度（2026-11-19）：用户人工确认注册成功进入控制台；找回密码成功，新密码登录有效、旧会话失效；错误验证码会报错，正确验证码可继续，连续发送限制有效。用户选择收尾时恢复 `MAIL_DRIVER=fake`。`.run/api-local.log` 仅筛出 3 个 Resend 消息 ID；连同独立测试邮件，真实发信为 4/5。最终审查后补强 API 与交互脚本共享额度，mock 单测不访问 Resend。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | API 配置键检查与启动准备 | `done` | AC-01：配置键检查、构建、`api --local` loopback 监听与 health 验证 |
| T02 | 指定邮箱请求一次注册验证码 | `done` | AC-02：注册验证码请求成功并取得 Resend 消息 ID；真实发信 2/5 |
| T03 | 交接真实注册与管理员找回密码 | `done` | AC-03、AC-04：用户确认注册进入控制台、找回密码后新密码登录成功且旧会话失效 |
| T04 | 确认邮件驱动与清理本单元资源 | `done` | AC-05：按用户选择追加 `MAIL_DRIVER=fake` 覆盖并停止本单元 API/Web |
| T05 | 最终代码审查 | `done` | 独立只读审查完整差异；修复并复核两项 finding，完成最终机器门 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | passed | `python scripts/validate_docs.py --env-keys`；`pnpm --filter @libs/shared build`；`pnpm --filter @apps/api build`；`pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api exec vitest run src/tests/api-host.test.ts src/tests/resend.test.ts`；`Get-NetTCPConnection -State Listen -LocalPort 3018`；`GET /health`；`OPTIONS /api/auth/registration-code` | `apps/api/src/config/api-host.ts`、`apps/api/src/tests/api-host.test.ts`、`.run/api-local.log` | AC-01：键检查缺失 0 项，未读取配置值；构建与类型检查通过，相关测试 7 项通过；API 实际只监听 `127.0.0.1:3018`，health HTTP 200，Web Origin 预检 HTTP 204 并返回允许来源。 |
| T01 | passed | `python -m unittest discover -s scripts/tests -p test_env_contract.py` | `scripts/tests/test_env_contract.py` | 既有配置契约检查套件：17 个测试通过。 |
| T01 | passed | `python -m unittest discover -s scripts/tests -p test_dev_proc.py`；`node --check scripts/dev/proc.mjs` | `scripts/tests/test_dev_proc.py`、`scripts/dev/proc.mjs` | 受管入口检查套件：4 个测试通过；local API/Web 端口、原槽位端口与无效启动参数覆盖通过，脚本语法检查通过。 |
| T01 | passed | `python scripts/validate_docs.py`、`git diff --check` | `docs/work/FW-039-real-email-acceptance/plan.md` | 文档校验 0 个问题，差异无空白错误；不代表真实邮件验收通过。 |
| T02 | passed | `python -m unittest discover -s scripts/tests -p test_email_smoke.py`；`pnpm --filter @apps/api exec tsc --noEmit --allowJs --checkJs --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck ../../scripts/test-email.mjs` | `scripts/test-email.mjs`、`scripts/tests/test_email_smoke.py` | 用户要求的交互式测试：7 个 mock 测试通过，覆盖确认后单次发送、取消/EOF、邮箱与配置校验、失败不重试、额度耗尽及并发五次限制；严格类型检查通过。首次类型检查发现配置键检查未收窄可选值，改为配置快照后复验通过。未访问 Resend、未写数据库或真实额度文件；不作为 AC-02 真实注册流程通过的证据。 |
| T02 | passed | `node --env-file=apps/api/.env.development --import=tsx scripts/test-email.mjs`（用户运行；输入邮箱并确认“测试”） | `scripts/test-email.mjs` | 用户于 2026-11-19 确认已收到邮件。该证据只确认独立发信测试可达；未取得终端 HTTP 状态或消息 ID，亦未调用注册验证码 API，故不代表 AC-02 通过。 |
| T01 | failed | `rg -n 'HOST|isLocalDevelopment' apps/api/src/main.ts`；`Get-Content scripts/dev/proc.mjs` | `apps/api/src/main.ts`、`scripts/dev/proc.mjs` | `api --local` 注入 `HOST=127.0.0.1`，但开发模式将其改成 `0.0.0.0`，与受管本地入口的 loopback 设计不符。用户授权修正该行为；尚未启动服务或发送注册验证码。 |
| T02 | passed | `POST http://127.0.0.1:3018/api/auth/registration-code` | `.run/api-local.log` | AC-02：API 返回 HTTP 201 与通用成功提示；Resend 接受，消息 ID `01a1f1fb-22ee-72df-a366-9a260c43b966`。真实发信 2/5；未读取或记录验证码，未重试。 |
| T02 | passed | `POST /api/auth/registration-code`；仅筛选 `.run/api-local.log` 的安全 Resend 消息 ID 行 | `.run/api-local.log` | 用户注册和找回验收期间本地 API 共记录 3 个已接受消息 ID；连同交互脚本确认送达的 1 封，真实发信 4/5。四个额度标记均对应真实发送；不查看验证码、邮箱或其他日志。 |
| T03 | passed | 用户人工验收（2026-11-19） | `docs/work/FW-039-real-email-acceptance/plan.md` | 用户确认注册成功进入控制台；找回密码成功，新密码可登录且旧会话失效；错误验证码报错、正确验证码可继续、连续发送有上限。 |
| T02 | passed | `pnpm --filter @apps/api exec vitest run src/tests/resend.test.ts src/email/resend.test.ts`；`python -m unittest discover -s scripts/tests -p test_email_smoke.py` | `apps/api/src/email/attempt-budget.ts`、`apps/api/src/tests/resend.test.ts` | 独立审查指出 API 请求未共用额度标记；修正为本地开发 Resend API 与交互脚本共用原子五次额度。相关 API 测试 7 项、脚本 mock 测试 7 项通过；额度耗尽时不调用 Resend。 |
| T04 | passed | `Append MAIL_DRIVER=fake override`；`node scripts/dev/proc.mjs stop web --local`；`node scripts/dev/proc.mjs stop api --local`；`node scripts/dev/proc.mjs status`；`python scripts/validate_docs.py --env-keys` | `apps/api/.env.development`、`scripts/dev/proc.mjs` | 按用户选择在本地开发配置末尾追加 `MAIL_DRIVER=fake` 覆盖，未读取配置文件内容；通过受管入口停止 API/Web，服务状态空且 3018/3019/3020 已释放；配置键缺失 0 项。 |
| T05 | passed | `FW_SLOT=1 pnpm --filter @apps/api test`；`pnpm typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm build`；`python -m unittest discover -s scripts/tests -p test_email_smoke.py`；`python -m unittest discover -s scripts/tests -p test_dev_proc.py`；`python -m unittest discover -s scripts/tests -p test_env_contract.py`；独立 Subagent 完整审查及 finding 定向复核；`python scripts/validate_docs.py`；`git diff --check` | `apps/api/src/email/attempt-budget.ts`、`docs/specs/workspace.md`、`docs/howto/local-development.md` | 全量 API 29 文件 183 通过、5 跳过；根级类型、lint、格式、workspace build 通过；脚本测试 7、4、17 项通过；独立审查两项 finding 均已修复并复核。Web build 有既有 chunk size 提示；文档校验 0 问题。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 交接

<!-- 方式 A 机器门过后写这两行，方式 B 删掉本节。不写逐条验收脚本。第一行写实现与讨论时说定的不同之处（AC 改动、没做的、做法变了的），没有写"无"；第二行在讨论时的功能点之外，只列机器验不了的（真钱、真机、真回调），没有写"无"。 -->

- 和讨论时不一样的：API 响应仍只返回通用提示；开发日志仅记录格式受限的 Resend 消息 ID，不记录收件邮箱或验证码。`api --local` 固定 loopback；本地开发 API 与交互脚本现共用五次发信额度。
- 需要你测的：无；用户已确认 AC-03/04 的完整注册与找回密码流程通过。

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-11-18：仅修复 API 开发配置缺键检查的既有入口登记，不扩展各端配置契约，不修改环境文件。
- 2026-11-18：规格批准记录中的“本地提交沿用线二授权”为 AI 默认、用户未单独回复，最初不作为提交授权；用户于 2026-11-19 明确授权归档提交并推送。
- 2026-11-18：`scripts/dev/proc.mjs` 仅支持槽位 1～3 的 API/Metro，未覆盖主目录 API/Web；未绕过起停脚本启动常驻服务，也未把真实注册写入测试槽位库。
- 2026-11-18：`apps/api/src/email/resend.ts` 只检查发送响应状态，没有读取或保留返回的消息 ID；注册验证码 API 仅返回提示文案。AC-02 不能靠现有 API 响应取证，建议从 Resend 后台只读核对，待用户确认可用途径；未修改适配器或公共契约。
- 2026-11-18：用户原话“以调整环境变量，继续”，按已完成配置调整继续 T01；仅补主目录 API/Web 受管入口与对应测试，不读取配置值，不扩大业务写入范围。
- 2026-11-19：T01 启动取证后等待指定邮箱，已停止 API/Web 并确认受管进程状态为空；未发送邮件，未修改邮件驱动配置，未提交或推送。
- 2026-11-19：用户要求“写一个测试，然后给我启动测试指令，启动后需要我输入收件邮箱，然后我输入测试”。在 scripts 内复用现有 Resend 发送器，读取服务商响应的消息 ID，不改业务接口、模板或认证语义；测试码不写数据库，不能用于注册或找回密码。按 AC-02 的总预算设置 5 次原子额度标记，失败请求保留额度，不自动重试；本轮只用 mock 验证。
- 2026-11-19：用户确认已收到交互脚本发送的真实邮件，按实际发信 1/5 记录；该邮件是不能用于注册的独立测试码，不替代 AC-02 注册验证码 API 证据。用户在本机终端输入的邮箱及消息 ID 未回传；继续前需用户提供用于注册验收的邮箱。
- 2026-11-19：用户授权先修正并验证 `api --local` 的监听范围，再继续真实注册验证码测试；普通开发 API 保持现有局域网监听行为。
- 2026-11-19：用户提供 AC-02 验收邮箱并明确要求继续实现、由其本人测试；本轮只向该地址请求一次注册验证码，不重试，API/Web 留在受管运行状态供人工验收。
- 2026-11-19：用户确认 AC-03/04 通过，并选择收尾恢复 `fake`。日志安全筛选显示 API 验收发信共 3 封，独立测试邮件 1 封，总计 4/5。
- 2026-11-19：最终审查发现 API 发送路径未占用交互脚本的额度标记；T02 补充 API 共用原子额度，避免本地 Resend 发送绕过 FW-039 上限。
- 2026-11-19：用户人工确认 AC-03/04 通过并选择恢复 `fake`；T04 已完成。最终独立审查与两项 finding 复核通过，单元 verified。用户随后授权归档提交并推送。
