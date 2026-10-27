# 会话改为 HttpOnly cookie 与服务端会话表 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：T02
- 阻塞：无
- 下一步：T02 API 会话认证与契约测试。

Preflight：动 `packages/shared/src/contract/`、`apps/api/src/auth.ts`、`apps/api/src/db/schema.ts`、`apps/api/drizzle/`（均为 hardline）、`apps/api/src`、`apps/web/src`、`apps/web/vite.config.ts`、`apps/mobile`（`components/`、`lib/`）、`tests/`、`playwright.*.config.ts`、`scripts/demo-chain.mjs`、`scripts/api-snapshot.mjs`；不动 `package.json`、锁文件。全程用槽位 1，不占 3018～3020。T05、T06 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。

## 任务表

| ID  | 任务                                                     | 状态      | 交付的 AC 与证据                                                      |
| --- | -------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| T01 | 会话表与迁移；契约改路由与类型                           | `done` | 无，机器门（迁移在新槽位库跑通、类型检查、契约包构建）                |
| T02 | API 会话登录、会话认证与失败路径；移除 `/api/auth/login` | `pending` | AC-01、AC-02、AC-03、AC-04、AC-06；API 测试、契约 e2e                 |
| T03 | 退出吊销与 Origin 检查、CORS credentials                 | `pending` | AC-05、AC-07、AC-08；API 测试、`e2e:cors`                             |
| T04 | Web 改用会话 cookie                                      | `pending` | AC-09、AC-10；Web e2e、`e2e:demo-ui`                                  |
| T05 | Mobile 改用会话 cookie（Expo Web）                       | `pending` | AC-11、AC-12；`e2e:mobile`                                            |
| T06 | Mobile 原生链与冷启动保持登录                            | `pending` | AC-13（模拟器）                                                       |
| T07 | Web 构建产物加 CSP；演示链与快照脚本改用 cookie          | `pending` | AC-14；构建产物 e2e；AC-15 脚本部分（`e2e:demo`、`api-snapshot.mjs`） |
| T08 | 最终代码审查（独立 Subagent）                            | `pending` | 派审查前跑 AC-15 全套与全量门禁；审查记录                             |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| 启动 | passed | `git rev-parse HEAD`；`git status --short`；`python scripts/validate_docs.py` | `AGENTS.md` | 起始 HEAD `73a4db0fc753a12bd17e3ebed87f216052517ad8`；工作区干净；文档 0 问题。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

| T01 | passed | `pnpm --filter @libs/shared build`；`pnpm --filter @libs/shared typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test src/db/seed.test.ts` | `apps/api/drizzle/0001_sessions.sql` | 仅新增 sessions 前向迁移；槽位 1 迁移及种子 4/4。shared 类型与双模块构建通过；应用消费者在后续各任务切换契约。种子显式清空 sessions；无新增依赖，无自启服务。 |

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-27 用户采纳三条建议：服务端会话表（AC-01、AC-05）、CSP（AC-14）、Mobile 改用 cookie（AC-11～AC-13），原话"三条建议我是要全加的"。
- 2026-10-27 有了会话表，cookie 里放随机会话 ID 而不是 JWT：吊销要查表，JWT 的自包含就没有用处，JWT 签发随之移除（AC-06）。两端都改用 cookie 后 API 不再接受 Bearer，失败路径从"两种认证的组合"简化为一种。
- 2026-10-27 Origin 检查改为"带 Origin 且不在白名单才拒绝"：Mobile 原生请求不带 Origin，按讨论时"缺 Origin 也拒绝"的写法会挡掉 Mobile；浏览器的跨站点写请求总带 Origin，放行无 Origin 的请求不削弱对浏览器 CSRF 的防护。
- 2026-10-27 原生 cookie 能否跨 Expo Go 冷启动保留未验证（React Native 的 `ForwardingCookieHandler` 由系统 cookie 存储持久化，但未在本机实测），列为 T06 的停止条件，不改用 SecureStore 绕过。
- 设计默认（讨论时给出）：同站点部署；`SameSite=Strict`；1 小时有效期；打开页面调 `/api/me`。
- 串行基线：按 [试行记录](../../parallel-trial.md)「值不值」的口径分类记人工触点：开对话、批审批、答停下、传话（含用户回到 Claude 会话转述进度）、人工验收、排障，每次在这里加一行；归档时汇总进试行记录表，和 FW-008 那行按类别对照。

- 2026-10-27 人工触点：开对话 1 次（本次执行指令，授权 FW-009 按任务本地提交、不推送；不是额外批准）。
