# 商家注册与门店指派主管 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 并行组：g03，线 L1 第 2 个（上游 FW-018，下游 FW-020），槽位 1
- 当前任务：T03
- 阻塞：无
- 下一步：用三个独立浏览器会话取证改指派后甲乙队列范围立即生效（AC-05）

## 任务表

| ID  | 任务                           | 状态      | 交付的 AC 与证据                               |
| --- | ------------------------------ | --------- | ---------------------------------------------- |
| T01 | 注册接口与 Web 注册页          | `done` | AC-01、AC-02                                   |
| T02 | 门店指派主管接口与门店页主管列 | `done` | AC-03、AC-04                                   |
| T03 | 指派后范围生效的界面 e2e       | `in_progress` | AC-05                                          |
| T04 | 最终代码审查                   | `pending` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 / AC-01 | passed | `FW_SLOT=1 pnpm --filter @apps/api test -- src/orgs.test.ts`、`pnpm --filter @apps/api typecheck` | `apps/api/src/orgs.test.ts` | 7/7；覆盖商家/admin/会话原子创建、默认时区、空门店模板、任意商家邮箱冲突回滚、三类非法请求、已登录注册且原商家与原会话不变。测试删除新商家及账号，会话级联清理；额外登录原账号会话定向删除。 |
| T01 / AC-02 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/orgs.spec.ts`、`pnpm --filter @apps/web typecheck` | `tests/web/orgs.spec.ts`、`docs/work/FW-019-org-signup-site-supervisor/evidence/registration-dashboard.png`、`docs/work/FW-019-org-signup-site-supervisor/evidence/registration-error.png` | 2/2；首页进入 /register，四字段注册后 /console 总部看板显示“暂无门店数据”，刷新保持会话；邮箱冲突显示“该邮箱已被注册。”。afterAll 删除新增会话、账号与商家。协议空桩测试更新为实际注册字段。 |
| T02 / AC-03 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/site-supervisors.test.ts`、`pnpm --filter @apps/api typecheck` | `apps/api/src/site-supervisors.test.ts` | 7/7；同商家未指派主管可选，替换只留一条绑定，null 取消；异商家账号/非主管 400、主管调用 403、异商家门店 404。只读账号列表验证商家与名下门店范围、不返回密码。afterEach 恢复原指派，afterAll 删除临时主管及登录会话。 |
| T02 / AC-04 | passed | `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts tests/web/site-supervisors.spec.ts tests/web/orgs.spec.ts`（后定向复跑主管文件）、`pnpm --filter @apps/web typecheck` | `tests/web/site-supervisors.spec.ts`、`tests/web/orgs.spec.ts`、`docs/work/FW-019-org-signup-site-supervisor/evidence/site-supervisor-controls.png` | 注册文件 2/2、主管文件复跑 2/2；门店主管列与 API 一致，admin 候选匹配本商家主管、选择/替换/取消刷新持久化，主管只读无选择框，新商家显示“暂无主管”。初次只读测试误用 columnheader，页面快照表头实际暴露 cell，修正定位后通过，未放宽断言。finally 恢复原指派。截图为 /console 门店页，NB-004 显示未指派。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-03：AC-04 选择本商家主管依赖 `GET /admin/users`，该接口原排在下游 FW-020 且仍为 501。用户原话：“同意提前实现只读列表（推荐）”。据此将 `apps/api/src/users.controller.ts` 与相关测试加入 FW-019 写入范围，仅提前实现已批准的账号只读列表；不改共享契约、不提前实现建账号、改密码或停用。FW-020 接力时保留此实现并验证其余写规则。
- 2026-11-03：从 FW-018 完成提交 `75cb6b6` 接力；工作树 git-dir 与 common-dir 不同，已成功切换 `g03/L1`，依赖安装、文档校验通过，启动时工作区干净。`ui-skills-root` 分类 CLI 请求失败（fetch failed），注册页直接沿用现有 FW-016 表单和错误组件。
