# 并行组 g03 集成 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`approved`
- 归档状态：`active`
- 并行组：g03，集成单元（线尾 FW-020、FW-021、FW-022）
- 当前任务：T06 清理、试行记录、独立审查、归档本单元
- 阻塞：无
- 下一步：完成独立最终审查与归档门

## 任务表

| ID  | 任务                                 | 状态          | 交付的 AC 与证据                      |
| --- | ------------------------------------ | ------------- | ------------------------------------- |
| T01 | 按线号顺序合并，查硬线路径           | `done`        | AC-01                                 |
| T02 | 全量测试                             | `done`        | AC-02                                 |
| T03 | 跨线组合 e2e 与两项冒烟              | `done`        | AC-03、AC-04                          |
| T04 | 用户能直接启动                       | `done`        | AC-05                                 |
| T05 | 交付与归档六个单元                   | `done`        | AC-06                                 |
| T06 | 清理、试行记录、独立审查、归档本单元 | `in_progress` | AC-07；独立 Subagent 只审本单元的改动 |

## 证据

| 任务 | status  | command                                                                                                                                                                                                                                                                                            | artifact                                                    | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `git diff --stat g03/start g03/L{1,2,3} -- packages/shared/src/contract apps/api/drizzle apps/api/src/auth.ts apps/api/src/db/schema.ts apps/api/src/main.ts; git merge --no-ff`                                                                                                                   | `git log g03/start..HEAD`                                   | 按 L1、L2、L3 顺序合并；硬线仅 L1 `auth.ts`、`main.ts`，FW-020 明确授权。合并冲突 2 次，文件均为 `docs/backlog.md`，按 master 版本保留其余行并更新 FW-021/FW-022。                                                                                                                                                                                                                                                                                |
| T02  | passed  | `pnpm typecheck; pnpm lint; pnpm format:check; pnpm build; FW_SLOT=1 pnpm --filter @apps/api test; pnpm e2e:slots; FW_SLOT=1 pnpm e2e:cors; FW_SLOT=1 pnpm e2e:demo; FW_SLOT=1 pnpm e2e:mobile; FW_SLOT=1 node --env-file=apps/api/.env.development --import=tsx node_modules/@playwright/test/cli.js test --config=playwright.web.config.ts; FW_SLOT=1 pnpm e2e:demo-ui` | `tests/web-results/slot-1/; tests/web-results/demo-slot-1/` | 类型检查、lint、格式、构建、API（114 passed / 3 skipped）、e2e:slots（3/3）、CORS（4/4）、API demo、Mobile Web（17/17）通过。Web 全量在修复登出竞态后 24 passed / 1 skipped；单独首次改密用例 1/1。根因是登出导航完成前宽泛邮箱 locator 命中旧管理页输入框；测试现等待 `/` 并将定位限定到“登录工作台”。demo-ui 1/1 通过，配置已为 API 加入 Web 与 Expo Web 的 CORS 来源。3111 当前已释放，未终止 `mihomo.exe`。 |
| T03  | passed  | `FW_SLOT=1 node --env-file=apps/api/.env.development --import=tsx node_modules/@playwright/test/cli.js test --config=playwright.g03.config.ts; FW_SLOT=1 FW_OSS_SMOKE=1 FW_AI_SMOKE=1 pnpm --filter @apps/api test -- src/storage/oss.smoke.test.ts` | `tests/e2e/g03.integration.spec.ts; apps/api/src/storage/oss.smoke.test.ts` | 新增跨商家 API e2e 通过（1/1）：注册、建主管/店员、首次改密、巡检照片存储且键前缀为新组织、FakeAiReviewer schema 与 Northbean 隔离。测试 `finally` 清理对象与组织数据。独立 OSS、模型和签名 URL 组合冒烟均通过，OSS 对象已删。专用 config 显式绕过 localhost 代理；不显式设置 `NO_PROXY` 的命令复跑仍通过。测试从 `dist` 相对路径导入 shared schema。 |
| T04  | passed  | `pnpm dev; curl.exe --noproxy "*" http://127.0.0.1:3018/health; Web 3019 逐角色登录; AVD Expo Go 店员登录` | `apps/api/.e2e/slot-1/storage/` | shared watch 已设 `--no-clean`；统一 `pnpm dev` 下 API `/health` 200。Web 实测总部 admin 12 家、Northbean 主管甲 6 家、演示二号 admin 1 家。启动 AVD `Medium_Phone_API_37.0`，Expo Go 连接 Metro 3020，店员登录后看到“今日待巡”和 Northbean Coffee 1。开发服务及 AVD 已停止。 |
| T05  | passed  | `git log --format="%h %s" 8a40a78~1..HEAD -- . ":(exclude)docs" ":(exclude)*.md"`; `python scripts/validate_docs.py`; `git diff --check` | `docs/specs/inspection.md`、`docs/specs/admin.md`、`docs/specs/web-console.md`、`docs/specs/mobile-inspector.md`、`docs/specs/workspace.md`、`docs/context/dev-environment.md`、`docs/backlog.md` | 按 FW-017～FW-022 顺序核对并 Promote；FW-017 已预先归档，其余五单状态及 Backlog 已归档。Promote 当前组织/账号/权限、来源白名单、存储与 AI 行为；环境键名未包含值。提交均带单元号，额外 FW-023 测试修复单独提交 `22e583e`。文档校验 0 问题，差异检查通过。 |

2026-11-03 用户授权扩大开发启动配置写入范围，允许修复 `pnpm dev` 启动竞态；具体变更为 shared watch 不清理构建产物。

T05 已完成：确认 FW-017 已 Promote 并归档；按 FW-018～FW-022 顺序 Promote 当前行为，更新各 `plan.md`、Backlog 与事实文档并归档。提交对账以 `8a40a78` 为 g03 单元起点，线上提交均带单元号；跨线首次改密用例竞态在 FW-023 中修复。试行记录中人工触点待 Claude 复核。

T06 进行中：清理状态已核对；待试行数据复核、独立审查及归档门。

## 交接

- 启动说明：
- 演示账号：

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差
