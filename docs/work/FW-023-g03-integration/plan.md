# 并行组 g03 集成 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`approved`
- 归档状态：`active`
- 并行组：g03，集成单元（线尾 FW-020、FW-021、FW-022）
- 当前任务：T02 全量测试
- 阻塞：T02 全量 Web 的首次改密用例未通过；T06 AC-07 的 3111 端口由本机 `mihomo.exe` 监听，非本任务进程
- 下一步：定位 Web 首次改密测试未发登录请求的原因；端口清理仅核验 FloorWalk 进程，不停止代理

## 任务表

| ID  | 任务                                 | 状态          | 交付的 AC 与证据                      |
| --- | ------------------------------------ | ------------- | ------------------------------------- |
| T01 | 按线号顺序合并，查硬线路径           | `done`        | AC-01                                 |
| T02 | 全量测试                             | `blocked`     | AC-02                                 |
| T03 | 跨线组合 e2e 与两项冒烟              | `done`        | AC-03、AC-04                          |
| T04 | 用户能直接启动                       | `done`        | AC-05                                 |
| T05 | 交付与归档六个单元                   | `pending`     | AC-06                                 |
| T06 | 清理、试行记录、独立审查、归档本单元 | `pending`     | AC-07；独立 Subagent 只审本单元的改动 |

## 证据

| 任务 | status  | command                                                                                                                                                                                                                                                                                            | artifact                                                    | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `git diff --stat g03/start g03/L{1,2,3} -- packages/shared/src/contract apps/api/drizzle apps/api/src/auth.ts apps/api/src/db/schema.ts apps/api/src/main.ts; git merge --no-ff`                                                                                                                   | `git log g03/start..HEAD`                                   | 按 L1、L2、L3 顺序合并；硬线仅 L1 `auth.ts`、`main.ts`，FW-020 明确授权。合并冲突 2 次，文件均为 `docs/backlog.md`，按 master 版本保留其余行并更新 FW-021/FW-022。                                                                                                                                                                                                                                                                                |
| T02  | blocked | `pnpm typecheck; pnpm lint; pnpm format:check; pnpm build; FW_SLOT=1 pnpm --filter @apps/api test; pnpm e2e:slots; FW_SLOT=1 pnpm e2e:cors; FW_SLOT=1 pnpm e2e:demo; FW_SLOT=1 pnpm e2e:mobile; FW_SLOT=3 node --env-file=apps/api/.env.development --import=tsx node_modules/@playwright/test/cli.js test --config=playwright.web.config.ts; FW_SLOT=3 pnpm e2e:demo-ui` | `tests/web-results/slot-3/; tests/web-results/demo-slot-3/` | 类型检查、lint、格式、构建、API（114 passed / 3 skipped）、e2e:slots（3/3）、CORS（4/4）、API demo、Mobile Web（17/17）先前通过。本轮 demo-ui 经配置补充 CORS 来源后通过（1/1）。全量 Web 23 passed / 1 skipped / 1 failed；首次改密用例单独重跑仍失败。trace 证实已有管理员登录与退出请求，但店员登录表单点击后没有第二次 `/api/auth/session` 请求，最终页面邮箱为空；原因未明，不修改认证语义，需继续定位。槽位 1 的 Web 端口 3111 被用户 `mihomo.exe` 占用，改用槽位 3 验证。静态检查复验通过。 |
| T03  | passed  | `FW_SLOT=1 node --env-file=apps/api/.env.development --import=tsx node_modules/@playwright/test/cli.js test --config=playwright.g03.config.ts; FW_SLOT=1 FW_OSS_SMOKE=1 FW_AI_SMOKE=1 pnpm --filter @apps/api test -- src/storage/oss.smoke.test.ts` | `tests/e2e/g03.integration.spec.ts; apps/api/src/storage/oss.smoke.test.ts` | 新增跨商家 API e2e 通过（1/1）：注册、建主管/店员、首次改密、巡检照片存储且键前缀为新组织、FakeAiReviewer schema 与 Northbean 隔离。测试 `finally` 清理对象与组织数据。独立 OSS、模型和签名 URL 组合冒烟均通过，OSS 对象已删。专用 config 显式绕过 localhost 代理；不显式设置 `NO_PROXY` 的命令复跑仍通过。测试从 `dist` 相对路径导入 shared schema。 |
| T04  | passed  | `pnpm dev; curl.exe --noproxy "*" http://127.0.0.1:3018/health; Web 3019 逐角色登录; AVD Expo Go 店员登录` | `apps/api/.e2e/slot-1/storage/` | shared watch 已设 `--no-clean`；统一 `pnpm dev` 下 API `/health` 200。Web 实测总部 admin 12 家、Northbean 主管甲 6 家、演示二号 admin 1 家。启动 AVD `Medium_Phone_API_37.0`，Expo Go 连接 Metro 3020，店员登录后看到“今日待巡”和 Northbean Coffee 1。开发服务及 AVD 已停止。 |

2026-11-03 用户授权扩大开发启动配置写入范围，允许修复 `pnpm dev` 启动竞态；具体变更为 shared watch 不清理构建产物。

T05、T06 未开始：T02 仍有未解释的 Web 用例失败；T06 另有外部进程占用 3111，均不 Promote、不归档。

## 交接

- 启动说明：
- 演示账号：

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差
