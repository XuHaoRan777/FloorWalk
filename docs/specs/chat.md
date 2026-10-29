# 巡检单聊天

代码（归档时再生成）：`apps/api/src/chat.controller.ts`、`apps/web/src/components/console/chat-panel.tsx`、`apps/mobile/components/mobile/chat-panel.tsx`，两端客户端在各自的 `lib/api/chat.ts`。

## 权限与入口

聊天挂在 Mobile 巡检页、Mobile 记录详情和 Web 审核详情。有权读取巡检单的用户可以读聊天；本店店员和主管可以发送，总部只读，没有输入框和发送按钮。巡检结束后仍可以聊天。角色和门店访问边界见[巡检主链](inspection.md#契约与权限)。

## 轮询与分页

打开面板读取最近 50 条，按消息序号升序展示作者名、角色、时间、文字和图片。有更早消息时显示「加载更早」，使用 `before` 获取上一页并插入顶部，保持当前消息的滚动位置；没有更早消息时隐藏按钮。

面板可见且页面聚焦时，每 2 秒使用 `after` 拉取增量消息，追加到底部，保留已显示的消息与图片。Web 标签隐藏、Mobile App 转后台或页面失焦时停止轮询，恢复时立即补拉再继续轮询。发送响应不推进接收游标，避免交错发送时漏掉对方消息。

## 发送与错误

可发送 1～1000 字文字、单独图片或图文。Web 选择文件，Mobile 使用系统相册；只接受 jpeg/png，单张不超过 10 MB，非法类型或超限在前端提示且不发送。发送中按钮禁用，成功后清空输入；失败保留内容并显示中文提示，可重试。

图片使用签名链接；加载失败时为该消息重取一次签名地址。网络和接口错误显示中文提示；轮询断网时保持单一错误提示，恢复后自动补拉。会话失效显示中文提示并返回登录页。

## 没有的

没有实时推送、已读未读、通知、编辑或删除消息。

## 数据契约（归档时再生成）

| 入口 | 当前契约 | 代码（归档时再生成） |
| --- | --- | --- |
| 聊天 API | GET/POST 巡检单消息、消息图片签名；消息 `seq` 为字符串，分页 `before`/`after` 互斥 | [共享契约](../../packages/shared/src/contract/index.ts)、[控制器](../../apps/api/src/chat.controller.ts) |
| 图片与存储 | `chat_messages` 及图片字段约束、签名和读取 | [数据结构](inspection.md#数据结构)、[schema](../../apps/api/src/db/schema.ts) |
| Web 面板 | 列表、分页、轮询、发送与只读显示 | [面板](../../apps/web/src/components/console/chat-panel.tsx)、[客户端](../../apps/web/src/lib/api/chat.ts) |
| Mobile 面板 | 系统相册、页面焦点与 AppState、列表与发送 | [面板](../../apps/mobile/components/mobile/chat-panel.tsx)、[客户端](../../apps/mobile/lib/api/chat.ts) |

## 修订记录

| 日期 | 用户或调用方可观察的变化 |
| --- | --- |
| 2026-10-29 | 巡检单聊天支持分页、前台增量轮询、文字与相册图片发送、错误重试及总部只读；Android 模拟器与 Web 往返通过。 |
