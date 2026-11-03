# 并行组 g03 集成 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`approved`
- 归档状态：`active`
- 并行组：g03，集成单元（线尾 FW-020、FW-021、FW-022）
- 当前任务：T04 用户能直接启动
- 阻塞：T02 Web 首次改密与 demo-ui 登录回归失败；T03 缺 AC-03 跨商家 API e2e；T04 `pnpm dev` shared/API 并发启动失败，修复涉及未授权的 package/workspace 配置，Expo Go 未做设备验收
- 下一步：需先决定是否扩展启动脚本修改范围，并补齐 AC-03 与失败回归后继续

## 任务表

| ID  | 任务                                 | 状态      | 交付的 AC 与证据                      |
| --- | ------------------------------------ | --------- | ------------------------------------- |
| T01 | 按线号顺序合并，查硬线路径           | `done`    | AC-01                                 |
| T02 | 全量测试                             | `blocked` | AC-02                                 |
| T03 | 跨线组合 e2e 与两项冒烟              | `blocked` | AC-03、AC-04                          |
| T04 | 用户能直接启动                       | `blocked` | AC-05                                 |
| T05 | 交付与归档六个单元                   | `pending` | AC-06                                 |
| T06 | 清理、试行记录、独立审查、归档本单元 | `pending` | AC-07；独立 Subagent 只审本单元的改动 |

## 证据

| 任务 | status  | command                                                                                                                                                                                                                                                                                            | artifact                                                    | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `git diff --stat g03/start g03/L{1,2,3} -- packages/shared/src/contract apps/api/drizzle apps/api/src/auth.ts apps/api/src/db/schema.ts apps/api/src/main.ts; git merge --no-ff`                                                                                                                   | `git log g03/start..HEAD`                                   | 按 L1、L2、L3 顺序合并；硬线仅 L1 `auth.ts`、`main.ts`，FW-020 明确授权。合并冲突 2 次，文件均为 `docs/backlog.md`，按 master 版本保留其余行并更新 FW-021/FW-022。                                                                                                                                                                                                                                                                                |
| T02  | blocked | `pnpm typecheck; pnpm lint; pnpm format:check; pnpm build; FW_SLOT=1 pnpm --filter @apps/api test; pnpm e2e:slots; FW_SLOT=1 pnpm e2e:cors; FW_SLOT=1 pnpm e2e:demo; FW_SLOT=1 pnpm e2e:mobile; FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts; FW_SLOT=1 pnpm e2e:demo-ui` | `tests/web-results/slot-1/; tests/web-results/demo-slot-1/` | 类型、lint、格式、构建、API（复跑后 114 passed / 3 skipped）、e2e:slots（3/3）、CORS（4/4）、API demo、Mobile Web（17/17）通过。Web 全量 23 passed / 1 skipped / 1 failed：`tests/web/users.spec.ts` 首次改密用例第二次登录未发出 POST；独立重跑同样失败，trace 证实此前 API 建号和退出通过，失败阶段无登录请求。demo-ui 登录后没有找到今日 Tab（该套件实际上运行 Expo Web）。初次 API 全套运行迁移测试因旧槽位照片缺失失败，测试清理后复跑通过。 |
| T03  | blocked | `FW_SLOT=1 FW_OSS_SMOKE=1 FW_AI_SMOKE=1 pnpm --filter @apps/api test -- src/storage/oss.smoke.test.ts`                                                                                                                                                                                             | `apps/api/src/storage/oss.smoke.test.ts`                    | OSS 独立冒烟通过；模型独立冒烟通过，640x480 红方块返回符合 schema 的 pass；组合 OSS 签名 URL + OpenAI Reviewer 通过，判定 pass。OSS 对象在 finally 删除。AC-03 所要求的独立 `tests/e2e/` 跨商家组合测试未实现。                                                                                                                                                                                                                                   |
| T04  | blocked | `pnpm --filter @apps/api db:migrate; pnpm --filter @apps/api db:seed; pnpm dev; pnpm dev:api; pnpm dev:web; pnpm dev:mobile; FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts`                                                                                                | `apps/api/.e2e/slot-1/storage/`                             | 开发库已迁移到最新并重建种子。`pnpm dev` 启动时 shared watch 清理 dist 与 API 编译竞态，API 报 99 个 `@libs/shared` 缺失，`/health` 502。独立入口稳定启动，API `/health` 200、Web/Metro 端口可用；三项 Web 角色/数据范围 e2e 通过。仍缺演示二号 admin 登录证据与 Expo Go 设备连接验收。统一启动脚本涉及的 workspace/package 配置不在 FW-023 写入授权内。                                                                                          |

T05、T06 未开始：T02、T03、T04 存在未解决的验收阻塞，不 Promote、不归档。

## 交接

- 启动说明：
- 演示账号：

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差
