# 多商家隔离与门店范围 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`blocked`
- 归档状态：`active`
- 并行组：g03，线 L1 第 1 个（上游 FW-017，下游 FW-019），槽位 1
- 当前任务：T01（入口与范围核对时阻塞，尚未写业务代码）
- 阻塞：AC-06 的主管 Web 看板入口需要修改写入范围外的 `apps/web/src/pages/console.tsx`
- 下一步：用户确认是否将该文件加入本单元写入范围；确认后删除 `g03/blocked/FW-018` 并继续 T01

## 任务表

| ID  | 任务                                             | 状态      | 交付的 AC 与证据                               |
| --- | ------------------------------------------------ | --------- | ---------------------------------------------- |
| T01 | 巡检、证据、审核、记录、聊天接口加商家与门店范围 | `blocked` | AC-01、AC-02、AC-04（这几类接口）              |
| T02 | 看板、门店、模板接口加商家范围，查重按商家       | `pending` | AC-01、AC-05（这几类接口）                     |
| T03 | 主管名下范围与无主管门店只给 admin 审            | `pending` | AC-02、AC-03                                   |
| T04 | Web 范围 e2e，现有 e2e 回绿                      | `pending` | AC-06                                          |
| T05 | 最终代码审查                                     | `pending` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `git rev-parse --git-dir`、`git rev-parse --git-common-dir`、`git switch g03/L1`、`pnpm install --frozen-lockfile`、`python scripts/validate_docs.py`、`git status --short` | — | git-dir 为 `F:/project/FloorWalk/.git/worktrees/FloorWalk3`，common-dir 为 `F:/project/FloorWalk/.git`，确认独立工作树；分支切换及依赖安装成功；启动文档校验 0 问题，工作区干净。 |
| T01 | blocked | 只读核对 FW-018 AC-06、FW-017 写入范围与 `console.tsx` | `apps/web/src/pages/console.tsx` | 第 130 行只允许 admin 渲染看板，第 157 行仅给 admin 导航；主管无法进入看板。该文件不在 FW-018 允许修改的 API 与测试路径内，按并行协议第 3 节停止；没有执行写库测试、启动服务或修改业务代码。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 卡在哪：AC-06 明确要求主管 Web 看板仅显示名下 6 店，但 `apps/web/src/pages/console.tsx:130,157` 把看板渲染和导航限定为 admin；FW-017 的 FW-018 写入范围未包含此文件。
- 要用户定什么：是否将 `apps/web/src/pages/console.tsx` 加入 FW-018 写入范围，仅放行主管现有看板入口与渲染，不改样式、不改共享契约。
- 可选项和倾向：建议补充该文件授权并保留 AC-06；另一选项是修改 AC-06 为主管仅验 API 看板，但这会减少已批准的 Web 能力。未获答复前不修改规格或业务代码。
