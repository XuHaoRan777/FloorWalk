# 多商家隔离与门店范围 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 并行组：g03，线 L1 第 1 个（上游 FW-017，下游 FW-019），槽位 1
- 当前任务：T01
- 阻塞：无
- 下一步：完成 T01 收尾提交后开始 T02

## 任务表

| ID  | 任务                                             | 状态          | 交付的 AC 与证据                               |
| --- | ------------------------------------------------ | ------------- | ---------------------------------------------- |
| T01 | 巡检、证据、审核、记录、聊天接口加商家与门店范围 | `done`        | AC-01、AC-02、AC-04（这几类接口）              |
| T02 | 看板、门店、模板接口加商家范围，查重按商家       | `pending`     | AC-01、AC-05（这几类接口）                     |
| T03 | 主管名下范围与无主管门店只给 admin 审            | `pending`     | AC-02、AC-03                                   |
| T04 | Web 范围 e2e，现有 e2e 回绿                      | `pending`     | AC-06                                          |
| T05 | 最终代码审查                                     | `pending`     | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status  | command                                                                                                                                                                     | artifact                             | 备注                                                                                                                                                                                                                         |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | passed  | `git rev-parse --git-dir`、`git rev-parse --git-common-dir`、`git switch g03/L1`、`pnpm install --frozen-lockfile`、`python scripts/validate_docs.py`、`git status --short` | —                                    | git-dir 为 `F:/project/FloorWalk/.git/worktrees/FloorWalk3`，common-dir 为 `F:/project/FloorWalk/.git`，确认独立工作树；分支切换及依赖安装成功；启动文档校验 0 问题，工作区干净。                                            |
| T01  | blocked | 只读核对 FW-018 AC-06、FW-017 写入范围与 `console.tsx`                                                                                                                      | `apps/web/src/pages/console.tsx`     | 第 130 行只允许 admin 渲染看板，第 157 行仅给 admin 导航；主管无法进入看板。该文件不在 FW-018 允许修改的 API 与测试路径内，按并行协议第 3 节停止；没有执行写库测试、启动服务或修改业务代码。                                 |
| T01  | failed  | `pnpm --filter @apps/api typecheck`                                                                                                                                         | `apps/api/src/inspection-queries.ts` | 共享包 `@libs/shared` 尚无构建产物，导致模块解析及依赖类型错误；下一步先执行 `pnpm --filter @libs/shared build`，再重跑 API 类型检查。                                                                                       |
| T01  | failed  | `pnpm --filter @libs/shared build`、`pnpm --filter @apps/api typecheck`                                                                                                     | `apps/api/src/inspection-queries.ts` | shared 构建后暴露 `canAccessSite` 实际由 API 本地 `site-scope.ts` 实现，并非共享包导出；已调整导入，下一步重跑 API 类型检查。                                                                                                |
| T01  | failed  | `FW_SLOT=1 pnpm --filter @apps/api test -- src/contract.e2e.test.ts`                                                                                                        | `apps/api/src/contract.e2e.test.ts`  | 初次新增矩阵让 supervisor 调用仅 inspector 获准的照片上传，角色门先返回 403；已把照片上传断言收窄到 inspector。完整套件中旧测试先用模板接口清空所有商家的当前模板，导致 demo2 `/today` 404；已将该 AC 断言移到状态变更之前。 |
| T01  | passed  | `pnpm --filter @apps/api typecheck`、`pnpm --filter @apps/api build`、`pnpm --filter @apps/api lint`、`pnpm exec prettier --check ...`、`FW_SLOT=1 pnpm --filter @apps/api test`、`git diff --check` | `apps/api/src/contract.e2e.test.ts` | 13 个契约 API 测试及 API 全套 59 项通过；类型检查、构建、lint、格式检查和差异空白检查通过。跨商家巡检/照片/聊天/审核资源返回 404；主管跨指派门店返回 403。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-03 用户原话：“同意：apps/web/src/pages/console.tsx 加入 FW-018 写入范围，只放行主管的看板入口与渲染，不改样式、不改共享契约。”据此仅在该文件开放主管现有看板入口与渲染；不调整样式或共享契约。
