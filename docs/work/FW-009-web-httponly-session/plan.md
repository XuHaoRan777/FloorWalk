# 会话改为 HttpOnly cookie 与服务端会话表 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：T06
- 阻塞：无。
- 下一步：T06 Android Expo Go 原生链与冷启动保持登录。

Preflight：动 `packages/shared/src/contract/`、`apps/api/src/auth.ts`、`apps/api/src/db/schema.ts`、`apps/api/drizzle/`（均为 hardline）、`apps/api/src`、`apps/web/src`、`apps/web/vite.config.ts`、`apps/mobile`（`components/`、`lib/`）、`tests/`、`playwright.*.config.ts`、`scripts/demo-chain.mjs`、`scripts/api-snapshot.mjs`；不动 `package.json`、锁文件。全程用槽位 1，不占 3018～3020。T05、T06 动 Mobile 前先读 `~/.agents/skills/expo-overview`，按分流读 `expo-data-fetching`，查 SDK 57 文档，在证据里记一行。

## 任务表

| ID  | 任务                                                     | 状态      | 交付的 AC 与证据                                                      |
| --- | -------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| T01 | 会话表与迁移；契约改路由与类型                           | `done` | 无，机器门（迁移在新槽位库跑通、类型检查、契约包构建）                |
| T02 | API 会话登录、会话认证与失败路径；移除 `/api/auth/login` | `done` | AC-01、AC-02、AC-03、AC-04、AC-06；API 测试、契约 e2e                 |
| T03 | 退出吊销与 Origin 检查、CORS credentials                 | `done` | AC-05、AC-07、AC-08；API 测试、`e2e:cors`                             |
| T04 | Web 改用会话 cookie                                      | `done` | AC-09、AC-10；Web e2e、`e2e:demo-ui`                                  |
| T05 | Mobile 改用会话 cookie（Expo Web）                       | `done` | AC-11、AC-12；`e2e:mobile`                                            |
| T06 | Mobile 原生链与冷启动保持登录                            | `in_progress` | AC-13（模拟器）                                                       |
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

| T02 | passed | `pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test src/session.test.ts src/contract.e2e.test.ts` | `apps/api/src/session.test.ts`；`apps/api/src/contract.e2e.test.ts` | AC-01/02/03/04/06：17/17；表字段/索引/级联/种子、32 字节 ID 的 SHA-256、1h、dev/prod cookie 属性、各 401 与旧路由 404。契约登录改为读 Set-Cookie 并以 Cookie 请求；原权限/业务/照片签名断言未放宽。DELETE 本任务覆盖 204 清 cookie，吊销在 T03。清理本任务会话、用户、巡检及上传文件，末尾重新 seed；无监听进程。主 Agent 核对 Subagent 两文件 diff 与实际测试输出。 |

| T03 AC-05 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/session.test.ts` | `apps/api/src/session.test.ts` | 20/20；退出撤销当前 session、清空 HttpOnly cookie、保存的原 cookie 重放 `/api/me` 为 401；无会话退出 204。 |

| T03 AC-07 | passed | `pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test src/session.test.ts` | `apps/api/src/cors.ts`；`apps/api/src/session.test.ts` | 白名单和无 Origin 的 session 写入通过；外来 Origin 的登录、退出、PATCH 与 multipart 上传返回 403，session 未创建/未撤销、检查项未改、证据未写入。API 类型检查通过。 |

| T03 AC-08 | passed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e:cors` | `tests/cors.spec.ts` | 3/3；Web 槽位与 Metro 槽位以 credentials 登录并读到 `/api/me`，外来 origin 无法读取 credentialed 响应。测试串行；3110～3112 在结束时无监听进程。 |

| T04 AC-09 | passed | `pnpm --filter @apps/web typecheck`；`FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts tests/web/console.spec.ts` | `apps/web/src/lib/api/request.ts`；`tests/web/console.spec.ts` | 7/7；登录/退出走会话接口，API 请求包含 credentials、不带 Authorization；首次加载调用 `/api/me` 恢复会话并显示加载态；页面沿用角色分流和权限行为。类型检查通过。 |

| T04 AC-10 | passed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm exec playwright test --config=playwright.web.config.ts tests/web/console.spec.ts` | `tests/web/console.spec.ts` | 7/7；登录后的 session ID 未出现在 localStorage/sessionStorage，`document.cookie` 不含 `fw_session`；刷新仍保持登录，退出后回登录页且 `/api/me` 为 401。 |

| AC-15 demo-ui | passed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e:demo-ui`（T04 首次运行的结果见「决策与偏差」） | `tests/demo/inspection-chain.spec.ts` | T05 完成后跨端链 1/1 通过，Mobile 巡检提交、Web 主管打回并通过、总部看板分数一致。 |

| T05 准备 | passed | 阅读 `C:/Users/29019/.agents/skills/expo-overview/SKILL.md` 与 `C:/Users/29019/.agents/skills/expo-data-fetching/SKILL.md`；检查 `https://docs.expo.dev/versions/v57.0.0/`、`https://docs.expo.dev/versions/v57.0.0/sdk/securestore/`、`https://reactnative.dev/docs/0.86/network` | `apps/mobile/package.json` | 检出 Expo 57.0.31 / React Native 0.86.3；使用 SDK 57 固定版本文档而非 latest。RN 网络文档说明 Cookie 认证仍有已知不稳定情形，T06 按批准范围实测 Android Expo Go 冷启动；此处不改成 SecureStore。 |

| T05 AC-11 | passed | `pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e:mobile` | `apps/mobile/lib/api/request.ts`；`apps/mobile/components/mobile/session-provider.tsx` | 9/9；会话登录、退出和 API 均使用 cookie credentials，不带 Authorization；启动清除旧 SecureStore/localStorage token 并调 `/api/me` 恢复会话；类型检查通过；无新增依赖。 |

| T05 AC-12 | passed | `FW_SLOT=1 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost pnpm e2e:mobile` | `tests/mobile/mobile-inspection.spec.ts` | 9/9；session ID 不在 localStorage/sessionStorage，`document.cookie` 不含 `fw_session`；刷新保持登录、退出后 `/api/me` 为 401。 |

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
- 2026-10-27 T04 的 Web e2e 通过；同阶段 `e2e:demo-ui` 在 Mobile 登录处因尚未执行 T05 而遇旧登录接口 404，未修改 Mobile，计划在 T05 完成后重跑。
- 2026-10-27 按 SDK 57 网络文档分流读取 Expo 数据获取技能；React Native 0.86 网络页标注 Cookie 认证存在不稳定情形。实现继续按已批准的 cookie 规格，T06 以 Android Expo Go 冷启动实测，不存 SecureStore。
- 2026-10-27 T04 时 `e2e:demo-ui` 因 Mobile 尚未执行 T05 命中旧 `/api/auth/login` 返回 404；T05 完成后重跑 1/1 通过，属任务顺序导致的暂时失败。
- 设计默认（讨论时给出）：同站点部署；`SameSite=Strict`；1 小时有效期；打开页面调 `/api/me`。
- 串行基线：按 [试行记录](../../parallel-trial.md)「值不值」的口径分类记人工触点：开对话、批审批、答停下、传话（含用户回到 Claude 会话转述进度）、人工验收、排障，每次在这里加一行；归档时汇总进试行记录表，和 FW-008 那行按类别对照。

- 2026-10-27 人工触点：开对话 1 次（本次执行指令，授权 FW-009 按任务本地提交、不推送；不是额外批准）。
