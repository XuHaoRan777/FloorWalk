# 按功能拆模块 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：T03
- 阻塞：无
- 下一步：拆 Web 控制台与按功能 API 客户端。

Preflight：动 `apps/api/src`、`apps/web/src`、`apps/mobile`（`app/`、`components/`、`lib/`）、`eslint.config.mjs`，新增 `scripts/api-snapshot.mjs`；不动契约、`auth.ts`、`schema.ts`、迁移、`package.json`、锁文件。全程用槽位 1（`floorwalk_e2e_1`，端口 3110/3111/3112），不占开发端口 3018～3020。开工前记下 `git rev-parse HEAD` 作为 AC-08 的对比起点。

## 任务表

| ID  | 任务                                                                 | 状态      | 交付的 AC 与证据                                                                      |
| --- | -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| T01 | 写 `scripts/api-snapshot.mjs`；拆前跑一次快照和 AC-06 全套，记下基线 | `done` | 无，基线：快照文件路径、各套件通过数                                                  |
| T02 | 拆 API 控制器和共用文件                                              | `done` | AC-01；AC-05（拆后快照与 T01 逐字节相同）；API 测试、契约 e2e、`e2e:cors`、`e2e:demo` |
| T03 | 拆 Web 控制台页和 Web API 客户端                                     | `in_progress` | AC-02 Web 部分；Web e2e、`e2e:demo-ui`                                                |
| T04 | 拆 Mobile 屏幕、共用组件和 Mobile API 客户端，导航先不动             | `pending` | AC-02 Mobile 部分；`e2e:mobile`                                                       |
| T05 | Mobile 底部切换改为 Expo Router Tabs                                 | `pending` | AC-03；AC-07（模拟器原生链）；`e2e:mobile`                                            |
| T06 | ESLint 加 400 行上限                                                 | `pending` | AC-04                                                                                 |
| T07 | 最终代码审查（独立 Subagent）                                        | `pending` | 派审查前跑 AC-06 全套、AC-08 全量门禁与零改动核对；审查记录                           |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `git rev-parse HEAD`；`git status --short`；`python scripts/validate_docs.py` | `docs/work/FW-008-module-split/plan.md` | AC-08 零改动起点：`2c933a3a4f24c90127a2b744f488935abbb34db8`；工作区干净；文档校验 0 问题。起进程前检查 3110/3111/3112 均无监听；环境文件仅检查存在，不读取内容。 |
| T01 | passed | `FW_SLOT=1 node --env-file=apps/api/.env.development scripts/api-snapshot.mjs docs/work/FW-008-module-split/evidence/api-before.json` | `docs/work/FW-008-module-split/evidence/api-before.json` | 拆前快照：12 路由 × 3 角色、共 63 请求；去除 id/时间/token/签名；finally 重置槽位数据与照片，按端口清理 API。初版加载根目录 TS 遇到模块冲突，改为加载 API 包内迁移/种子；根未声明 shared 依赖，使用 API 包上下文解析。 |
| T01 | passed | `FW_SLOT=1 pnpm --filter @apps/api test`；`FW_SLOT=1 pnpm e2e`；`FW_SLOT=1 pnpm e2e:mobile` | `docs/work/FW-008-module-split/evidence/t01-suite-1.log`、`docs/work/FW-008-module-split/evidence/t01-suite-2.log`、`docs/work/FW-008-module-split/evidence/t01-suite-3.log` | 拆前 API 8/8（含契约 e2e 4/4）、槽位设施 1/1、Mobile 7/7。逐套按 3110～3112 监听 PID 清理。 |
| T01 | failed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts` | `docs/work/FW-008-module-split/evidence/t01-suite-4.log` | 6/6 连接拒绝；配置设 reuseExistingServer，日志没有启动服务。假设 localhost 被代理误判可复用；下一次实验只在命令注入 NO_PROXY/no_proxy 并打开 pw:webserver 调试，不改测试断言或业务代码。 |
| T01 | passed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost DEBUG=pw:webserver pnpm exec playwright test --config=playwright.web.config.ts` | `docs/work/FW-008-module-split/evidence/t01-web-recheck.log` | Web 6/6；证实注入代理绕过后服务正确启动；后续验证命令沿用本机代理绕过，不修改仓库配置与断言。 |
| T01 | passed | `FW_SLOT=1 pnpm e2e:cors`；`FW_SLOT=1 pnpm e2e:demo`；`FW_SLOT=1 pnpm e2e:demo-ui`（命令级 NO_PROXY/no_proxy） | `docs/work/FW-008-module-split/evidence/t01-e2e-cors.log`、`docs/work/FW-008-module-split/evidence/t01-e2e-demo.log`、`docs/work/FW-008-module-split/evidence/t01-e2e-demo-ui.log` | CORS 2/2；API 演示链 1/1；跨端 UI 演示链 1/1。槽位 1 全套基线完成；逐套按端口杀监听 PID；最后通过现有 seedDatabase 恢复槽位种子并清空上传。 |
| T02 | passed | `pnpm --filter @apps/api typecheck`；`pnpm exec eslint apps/api/src`；`git diff` | `apps/api/src/app.module.ts`、`apps/api/src/inspection-queries.ts` | AC-01：五个功能控制器各一行注册，巡检控制器仅店员巡检；SQL、权限检查、事务与返回校验原样搬移；共享上海日界、ISO 时间、照片签名、权限与详情查询。最长控制器 336 行。 |
| T02 | passed | `FW_SLOT=1 node --env-file=apps/api/.env.development scripts/api-snapshot.mjs docs/work/FW-008-module-split/evidence/api-after.json`；`Get-FileHash` | `docs/work/FW-008-module-split/evidence/api-before.json`、`docs/work/FW-008-module-split/evidence/api-after.json` | AC-05：拆前后逐字节一致；SHA256 `18BF886A5F589A20B1577D83BEC6B20EE6C148ACCE99E814CCE0AD76B9B8907A`。 |
| T02 | passed | `FW_SLOT=1 pnpm --filter @apps/api test`；`FW_SLOT=1 pnpm e2e:cors`；`FW_SLOT=1 pnpm e2e:demo`（NO_PROXY/no_proxy） | `docs/work/FW-008-module-split/evidence/t02-suite-1.log`、`docs/work/FW-008-module-split/evidence/t02-suite-2.log`、`docs/work/FW-008-module-split/evidence/t02-suite-3.log` | API 8/8（含契约 4/4）、CORS 2/2、演示链 1/1；按监听 PID 清理 3110～3112，恢复槽位种子并清空上传。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-26 用户采纳三条建议（AC-03、04、05），其中 AC-03 是本单元唯一允许的行为变化。契约不拆，理由见 spec 非目标。
- 串行基线：本单元按 [试行记录](../../parallel-trial.md)「值不值」的口径记人工触点（开对话、批审批、答停下、传话、人工验收、排障各几次），每次在这里加一行；归档时汇总进试行记录表的「串行基线」行。
- 2026-10-26 人工触点：开对话 1 次（本次启动）；批审批 0、答停下 0、传话 0、人工验收 0、排障 0。用户授权本地按任务提交，不推送；所有槽位命令固定 `FW_SLOT=1`。
- 2026-10-26 拆前环境偏差：Web e2e 的 reuseExistingServer 在代理下误判服务可复用，6 项连接拒绝；命令级设置 NO_PROXY/no_proxy 后 6/6 通过，不改配置、不计产品 bug。无须用户排障。
