# 商家注册与门店指派主管 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 并行组：g03，线 L1 第 2 个（上游 FW-018，下游 FW-020），槽位 1
- 当前任务：T02
- 阻塞：无
- 下一步：实现门店指派主管、提前实现候选账号只读列表，取证 AC-03、AC-04

## 任务表

| ID  | 任务                           | 状态      | 交付的 AC 与证据                               |
| --- | ------------------------------ | --------- | ---------------------------------------------- |
| T01 | 注册接口与 Web 注册页          | `done` | AC-01、AC-02                                   |
| T02 | 门店指派主管接口与门店页主管列 | `in_progress` | AC-03、AC-04                                   |
| T03 | 指派后范围生效的界面 e2e       | `pending` | AC-05                                          |
| T04 | 最终代码审查                   | `pending` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 / AC-01 | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/orgs.test.ts`、`pnpm --filter @apps/api typecheck` | `apps/api/src/orgs.test.ts` | 7/7；覆盖商家/admin/会话原子创建、默认时区、空门店模板、任意商家邮箱冲突回滚、三类非法请求、已登录注册且原商家与原会话不变。测试删除新商家及账号，会话级联清理；额外登录原账号会话定向删除。 |
| T01 / AC-02 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/orgs.spec.ts`、`pnpm --filter @apps/web typecheck` | `tests/web/orgs.spec.ts`、`docs/work/FW-019-org-signup-site-supervisor/evidence/registration-dashboard.png`、`docs/work/FW-019-org-signup-site-supervisor/evidence/registration-error.png` | 2/2；首页进入 /register，四字段注册后 /console 总部看板显示“暂无门店数据”，刷新保持会话；邮箱冲突显示“该邮箱已被注册。”。afterAll 删除新增会话、账号与商家。协议空桩测试更新为实际注册字段。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-03：AC-04 选择本商家主管依赖 `GET /admin/users`，该接口原排在下游 FW-020 且仍为 501。用户原话：“同意提前实现只读列表（推荐）”。据此将 `apps/api/src/users.controller.ts` 与相关测试加入 FW-019 写入范围，仅提前实现已批准的账号只读列表；不改共享契约、不提前实现建账号、改密码或停用。FW-020 接力时保留此实现并验证其余写规则。
- 2026-11-03：从 FW-018 完成提交 `75cb6b6` 接力；工作树 git-dir 与 common-dir 不同，已成功切换 `g03/L1`，依赖安装、文档校验通过，启动时工作区干净。`ui-skills-root` 分类 CLI 请求失败（fetch failed），注册页直接沿用现有 FW-016 表单和错误组件。
