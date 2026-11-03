# 门店与模板管理

代码（归档时再生成）：`apps/api/src/admin.controller.ts`、`apps/web/src/components/console/sites-page.tsx`、`apps/web/src/components/console/templates-page.tsx`；Web 客户端为 `apps/web/src/lib/api/admin.ts`。

## 权限

商家管理员可以管理本商家的门店与模板；主管仅能读取和管理自己被指派门店范围内的数据，且不能指派主管；店员调用管理接口返回 403。Web 控制台侧栏提供「门店」「模板」分区。网络或 400/403/404/409 错误以中文提示，401 返回登录页。

## 门店与停用

门店页列出当前账号范围内的门店并标记「已停用」。商家管理员可以用编码与名称新建启用门店、改名、停用和重新启用；主管只管理名下门店。编码在商家内不可重复，冲突返回 409；不存在或跨商家资源返回 404，非法请求返回 400。新建门店不会创建员工账号。商家管理员可从本商家的主管账号中指派或取消门店主管，一店最多一位；重新指派立即更新主管的队列范围。

停用保留门店和历史数据，写入 `deactivated_at`；重新启用清空它。店员仍可登录、看记录和历史详情，但今日待巡显示「门店已停用」，不显示开始按钮，服务端拒绝新建巡检。已提交的单主管仍可审完。总部看板保留最近判定分数并标「已停用」；重新启用恢复开始巡检。建单与停用通过门店行锁协调。

## 模板与当前模板

模板页列出全部模板并标记当前模板；可新建，编辑名称与检查项，增删检查项、改标题、勾选必拍和严重项、上下移动顺序。至少一项，`position` 从 1 连续；名称重复返回 409，不存在返回 404，非法请求返回 400。新模板不自动成为当前模板。

保存时在一个事务里改名并整体替换检查项。设置当前模板使用事务，按固定顺序锁定模板，取消原当前并启用目标模板；每个商家各有一个当前模板。已有巡检的检查项是建单时快照，修改模板不改变既有结果与分数，之后新建巡检使用修改后的当前模板。多人编辑采用后保存的内容。

## 没有的

没有按门店分配模板、模板删除或编辑冲突检测。

## 数据契约（归档时再生成）

| 入口 | 当前契约 | 代码（归档时再生成） |
| --- | --- | --- |
| 门店管理 | GET/POST `/api/admin/sites`、PATCH `/api/admin/sites/:id`；返回 `active` | [控制器](../../apps/api/src/admin.controller.ts)、[共享契约](../../packages/shared/src/contract/index.ts) |
| 主管指派 | GET `/api/admin/users`；PUT `/api/admin/sites/:id/supervisor`，`userId: null` 取消 | [门店控制器](../../apps/api/src/admin.controller.ts)、[账号控制器](../../apps/api/src/users.controller.ts) |
| 模板管理 | GET/POST `/api/admin/templates`、PUT `/api/admin/templates/:id`、POST `/api/admin/templates/:id/current` | [控制器](../../apps/api/src/admin.controller.ts) |
| 持久化 | organizations、sites、site_supervisors、templates、template_items；商家内唯一编码/名称，每商家当前模板部分唯一索引 | [数据结构](inspection.md#数据结构)、[schema](../../apps/api/src/db/schema.ts) |
| 停用效果 | 今日待巡、新建巡检、总部看板 | [巡检](../../apps/api/src/inspection.controller.ts)、[看板](../../apps/api/src/dashboard.controller.ts)、[Mobile 今日页](../../apps/mobile/components/mobile/today-screen.tsx) |

## 修订记录

| 日期 | 用户或调用方可观察的变化 |
| --- | --- |
| 2026-10-29 | 门店与模板管理落库并提供 Web 页面；停用限制新建、保留历史与审核，看板标停用；模板修改保持已有巡检快照。 |
| 2026-11-03 | g03 增加商家隔离与主管门店范围；商家管理员可指派主管，门店编码和模板名在商家内唯一、每商家一个当前模板。 |
