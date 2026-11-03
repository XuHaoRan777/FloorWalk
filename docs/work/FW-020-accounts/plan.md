# 账号体系与会话续期 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`blocked`
- 归档状态：`active`
- 并行组：g03，线 L1 第 3 个，线尾（上游 FW-019），槽位 1
- 当前任务：无（T01 已完成，T02 尚未开始）
- 阻塞：AC-05 的 Mobile 强制改密分流需要修改写入范围外的已登录布局
- 下一步：用户授权补入 `apps/mobile/app/(authenticated)/_layout.tsx` 后继续 T02；恢复时删除 blocked tag

## 任务表

| ID  | 任务                                                    | 状态      | 交付的 AC 与证据                               |
| --- | ------------------------------------------------------- | --------- | ---------------------------------------------- |
| T01 | 核对 FW-017 已实现的 7 天续期，补闲置超时与续期测试     | `done` | AC-06                                          |
| T02 | 建账号、列表、停用、上级重置的接口与权限                | `pending` | AC-01、AC-02、AC-03、AC-04                     |
| T03 | 首次登录改密码：接口拦截、Web 改密码页、Mobile 改密码屏 | `pending` | AC-05                                          |
| T04 | Web「账号」页与界面 e2e                                 | `pending` | AC-08                                          |
| T05 | 跨域白名单与写请求来源校验、ADR 0003                    | `pending` | AC-07                                          |
| T06 | 最终代码审查                                            | `pending` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| 启动 | passed | `git rev-parse --git-dir`、`git rev-parse --git-common-dir`；`git switch g03/L1`；`pnpm install --frozen-lockfile`；`git merge-base --is-ancestor 187a85d HEAD`；`python scripts/validate_docs.py`；`git status --short` | — | 工作树与公共 git 目录不同；切分支成功；安装通过；FW-019 提交及 done tag 在本线；文档 0 问题，初始工作区干净。保留 FW-019 已授权的账号只读列表。 |
| T01 | passed | `pnpm --filter @libs/shared build`；`pnpm --filter @apps/api typecheck`；`FW_SLOT=1 pnpm --filter @apps/api test -- src/session.test.ts` | `apps/api/src/session.test.ts` | AC-06：20/20。闲置 7 天 1 秒返回 401；闲置 6 天仍有效、更新最后活跃时间并刷新 cookie，忽略保留的 expires_at。只用槽位 1；套件结束删除 sessions 与临时账号，草稿测试清理照片与业务行。独立 Subagent 仅改测试，主 Agent 核对 diff 并运行验证。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-03（Claude 复核 FW-017）：会话续期已由 FW-017 T03 实现，T01、AC-06 改为核对与补测试；`auth-config.ts`（FW-017 从 `auth.ts` 拆出 `getJwtSecret`）在本单元写入范围内。
- 2026-11-03：卡在哪：`apps/mobile/app/(authenticated)/_layout.tsx` 当前无条件挂载 TodayProvider 和所有已登录页面；只填改密码屏不能覆盖首次登录、恢复会话与直接进入今日页。该文件不在 FW-020 写入范围，且 `git log g03/start..HEAD -- <该文件>` 无上游修改记录。
- 要用户定什么：是否将上述已登录布局补入本单元写入范围，用于实现既有 AC-05，不新增产品行为、不改共享契约。
- 可选项和倾向：推荐授权该单文件后在布局按 mustChangePassword 分流；否则 AC-05 无法按当前范围完成。依据 `docs/howto/parallel.md` 第 3 节停止，不用 API 客户端隐式导航绕过范围约束。T02～T06 未执行，未验收、未打 done tag。本工作树无常驻服务。
