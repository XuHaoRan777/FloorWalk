# UI 基础：两端统一设计 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`approved`
- 归档状态：`active`
- 当前任务：无
- 阻塞：无
- 下一步：从 T01 开始；执行器先确认 spec「三个阶段」表里的 skill 都可用

## 任务表

| ID  | 任务                                                                                                                                                                                | 状态      | 交付的 AC 与证据                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------- |
| T01 | 阶段 1 前置：记录两端现状截图（Web `inspect.mjs --app --out .taste-skill/before`、Mobile 模拟器截图），建共享 token 源并在 Mobile 实测主题生效（NativeWind 5 是 preview，先验能用） | `pending` | 无，机器门                                     |
| T02 | 阶段 1：出 2～3 个方向，每个方向 Web、Mobile 各一张样张页；停下等用户挑选                                                                                                           | `pending` | AC-01                                          |
| T03 | 阶段 1 收口：选中方向写进 token 与 `DESIGN.md`，删掉落选方向；两端主题接上                                                                                                          | `pending` | AC-02                                          |
| T04 | 阶段 2 Web：先用 `improve-ui` 审现状，再换全部页面并补齐三种状态；Web e2e 只改定位                                                                                                  | `pending` | AC-03、AC-04（Web）                            |
| T05 | 阶段 2 Mobile：换全部页面并补齐三种状态；Mobile e2e 只改定位                                                                                                                        | `pending` | AC-03、AC-04（Mobile）                         |
| T06 | 阶段 3 质感：先审阶段 2 产物，两端按 design-taste-frontend 改版流程做增量，Web 过 `inspect.mjs --app` 与 `lint.mjs`，两端过可访问性检查                                             | `pending` | AC-05、AC-06                                   |
| T07 | 模拟器走店员主链截图；全量机器门；交接两行，登记待人工验收                                                                                                                          | `pending` | AC-08、AC-07                                   |
| T08 | 最终代码审查                                                                                                                                                                        | `pending` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |

## 交接

- 和讨论时不一样的：
- 需要你测的：

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-02：三阶段边界、每阶段必须用的 skill 由用户定；design-taste-frontend 放在阶段 1（出方向）和阶段 3（`--keep palette,type` 改版），按 app-screen 流程；执行器缺 skill 就停下，不绑定执行器。
