# 账号体系与会话续期 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 并行组：g03，线 L1 第 3 个，线尾（上游 FW-019），槽位 1
- 当前任务：无
- 阻塞：无
- 下一步：已由 FW-023 T05 Promote 并归档

## 任务表

| ID  | 任务                                                    | 状态          | 交付的 AC 与证据                               |
| --- | ------------------------------------------------------- | ------------- | ---------------------------------------------- |
| T01 | 核对 FW-017 已实现的 7 天续期，补闲置超时与续期测试     | `done`        | AC-06                                          |
| T02 | 建账号、列表、停用、上级重置的接口与权限                | `done`        | AC-01、AC-02、AC-03、AC-04                     |
| T03 | 首次登录改密码：接口拦截、Web 改密码页、Mobile 改密码屏 | `done`        | AC-05                                          |
| T04 | Web「账号」页与界面 e2e                                 | `done`        | AC-08                                          |
| T05 | 跨域白名单与写请求来源校验、ADR 0003                    | `done`        | AC-07                                          |
| T06 | 最终代码审查                                            | `done`        | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command                                                                                                                                                                                                                  | artifact                                                                              | 备注                                                                                                                                                                                                                                         |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动 | passed | `git rev-parse --git-dir`、`git rev-parse --git-common-dir`；`git switch g03/L1`；`pnpm install --frozen-lockfile`；`git merge-base --is-ancestor 187a85d HEAD`；`python scripts/validate_docs.py`；`git status --short` | —                                                                                     | 工作树与公共 git 目录不同；切分支成功；安装通过；FW-019 提交及 done tag 在本线；文档 0 问题，初始工作区干净。保留 FW-019 已授权的账号只读列表。                                                                                              |
| T01  | passed | `pnpm --filter @libs/shared build`；`pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/session.test.ts`                                                                                 | `apps/api/src/session.test.ts`                                                        | AC-06：20/20。闲置 7 天 1 秒返回 401；闲置 6 天仍有效、更新最后活跃时间并刷新 cookie，忽略保留的 expires_at。只用槽位 1；套件结束删除 sessions 与临时账号，草稿测试清理照片与业务行。独立 Subagent 仅改测试，主 Agent 核对 diff 并运行验证。 |
| T02  | passed | `pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/users.test.ts src/session.test.ts`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/site-supervisors.test.ts`                         | `apps/api/src/users.controller.ts`、`apps/api/src/users.test.ts`                      | 创建、停用/启用、管理员保护、重置与会话吊销通过；6 个用户管理测试与 16 个会话测试通过，测试数据清理。AC-02 列表和主管范围复用 FW-019 行为及其定向测试。                                                                                      |
| T03  | passed | `pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/web typecheck`；`pnpm --filter @apps/mobile typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/users.test.ts src/session.test.ts`                      | `apps/api/src/auth.ts`、`apps/api/src/users.controller.ts`、Web/Mobile 改密路由与屏幕 | AC-05 API 错误密码 401、短密码/相同密码 400、强制改密接口限制、本人其他会话吊销且当前会话保留均通过。T02/T03 共跑 API 22 测试，类型检查三端通过；该 API 运行按 `floorwalk` 访问槽位 1，测试清理临时用户和会话。                              |
| T04  | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/users.spec.ts`；`FW_SLOT=1 pnpm exec playwright test --config=playwright.mobile.config.ts tests/mobile/protocol.spec.ts`                | `tests/web/users.spec.ts`、`tests/mobile/protocol.spec.ts`                            | AC-08 管理员在账号页新建店员，店员首次登录改密后进入 Web 店员首页；Mobile 首次登录改密后进入今日巡检。各 1/1 通过，测试后删除临时用户。                                                                                                      |
| T05  | passed | `FW_SLOT=1 pnpm e2e:cors`                                                                                                                                                                                                | `tests/cors.spec.ts`、`docs/adr/0003-cors-origin-allowlist.md`                        | 4/4：白名单 Web 与 Expo Origin 的凭据 GET 成功；外站 GET 无 CORS 头；外站写请求 403；不带 Origin 的写请求成功。测试创建会话后退出清理。                                                                                                      |
| T06  | passed | `pnpm typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm build`；`FW_SLOT=1 pnpm --filter @apps/api test`；`FW_SLOT=1 pnpm e2e:cors`；`python scripts/validate_docs.py` | `apps/api/src/users.test.ts`、`apps/api/src/cors-config.test.ts`、`docs/howto/final-review.md` | 独立 Subagent 审查，按清单七域完成。并发改密/重置、主管指派 TOCTOU 已修复并复核；CORS 本机 IPv4 自动白名单有定向测试；`displayName` 属 FW-017 AC-03 已批准契约，非 finding。API 13 文件 83/83、CORS 4/4；类型检查、lint、格式、构建及文档校验通过。Web 构建有 501.5 kB chunk 提示但成功。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-03（Claude 复核 FW-017）：会话续期已由 FW-017 T03 实现，T01、AC-06 改为核对与补测试；`auth-config.ts`（FW-017 从 `auth.ts` 拆出 `getJwtSecret`）在本单元写入范围内。
- 2026-11-03：用户授权将 `apps/mobile/app/(authenticated)/_layout.tsx` 补入 FW-020 写入范围，用于实现既有 AC-05；无需修改共享契约或产品语义。
