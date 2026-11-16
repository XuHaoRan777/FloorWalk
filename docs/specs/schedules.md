# 日程方案与门店安排

代码（归档时再生成）：`apps/api/src/controllers/schedules.controller.ts`、`apps/api/src/services/schedule-persistence.ts`、`apps/api/src/services/task-scheduler.ts`、`packages/shared/src/schedule-plan.ts`、`packages/shared/src/contract/schedules.ts`、`apps/web/src/`

## 日程方案

商家管理员可创建、查看、修改和删除本商家的周循环日程方案。名称在商家内唯一；每个方案包含周一至周日各一天，每天可停用或配置零个以上任务。每项任务引用本商家的模板，并设置分钟精度的开始与结束时刻；结束早于或等于开始时表示跨零点，同一模板可在一天内安排多次，时间窗可重叠。

被日程方案引用的模板不能删除或移到其他商家。方案可在被门店使用时修改，但只要仍有门店选用，就不能删除。

## 门店安排与跳过日期

每家门店可选用一份方案或不选方案；一次操作可给多家门店设置同一方案，清除选用也支持多选。管理员可给一家或多家门店添加包含首尾日期的跳过区间并填写可选备注，也可删除单条区间；区间可重叠。

## 每日任务计划

共享纯函数 `planFor(site, date)` 按商家时区把门店在指定日历日应执行的方案项转换为绝对开始与截止时间。日期处于任一跳过区间、门店停用、未选方案或方案当天停用时，结果为空；跨零点的任务归在开始日期。夏令时造成的不存在或重复本地时刻不作额外调整。

API 进程启动时同步一次任务，此后每分钟同步所有商家的当天任务；日程方案、门店选用或跳过区间的变更会立即重算受影响门店当天的任务。尚未开始且没有上传巡检单的任务按新方案增删；已经开始的任务保留原计划。任务重复生成使用数据库唯一约束幂等。任务状态与巡检流程见[巡检主链](inspection.md#巡检规则)。

## 接口

以下接口仅商家管理员可用；跨商家资源按不存在处理。

| 方法与路径                                   | 说明                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/admin/schedules`                   | 读取本商家的周循环方案                                     |
| `POST /api/admin/schedules`                  | 新建方案；名称重复返回 409 `INVALID_STATE`                 |
| `PUT /api/admin/schedules/:id`               | 替换方案定义，并同步当天尚未开始的任务                     |
| `DELETE /api/admin/schedules/:id`            | 删除未被门店选用的方案；仍在使用时返回 409 `INVALID_STATE` |
| `GET /api/admin/site-schedules`              | 读取门店、选用方案和跳过区间                               |
| `PUT /api/admin/site-schedules`              | 批量设置或清除门店的方案选用                               |
| `POST /api/admin/site-schedules/skips`       | 批量添加门店跳过日期区间                                   |
| `DELETE /api/admin/site-schedules/skips/:id` | 删除一条跳过区间                                           |

## 数据契约（归档时再生成）

共享结构与规则函数位于 `packages/shared/src/contract/schedules.ts`、`packages/shared/src/schedule-plan.ts`；API 持久化与同步位于 `apps/api/src/services/schedule-persistence.ts`、`apps/api/src/services/task-scheduler.ts`、`apps/api/src/controllers/schedules.controller.ts`。底层表定义及迁移以 `apps/api/src/db/` 和 `apps/api/drizzle/` 为准。

## 修订记录

| 日期       | 用户或调用方可观察的变化                                                |
| ---------- | ----------------------------------------------------------------------- |
| 2026-11-11 | FW-027 增加周循环日程方案、门店选用、跳过日期区间及当天未开始任务同步。 |
| 2026-11-11 | FW-028 按门店日程每日幂等生成任务，并在日程变更时同步当天尚未开始且未上传的任务。 |
